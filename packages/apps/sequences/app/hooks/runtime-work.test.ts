import { describe, expect, it } from "vitest";
import {
  JOB_NAMES,
  JOB_SPECS,
  TICK_EXPRESSION,
  TICK_JOB_NAME,
  TICK_SCHEDULE_NAME,
  TICK_SCRIPT_PATH,
  ensureSequencesWork,
  pauseSequencesWork,
  retireSequencesWork,
} from "./runtime-work.js";
import { CONFIGURE_CONFIRMATION, applyRuntimePlan, runtimePlan } from "../lib/configure.js";

type Row = Record<string, unknown>;

export function fakeNex(seed: { jobs?: Row[]; schedules?: Row[] } = {}) {
  const jobs: Row[] = seed.jobs ?? [];
  const schedules: Row[] = seed.schedules ?? [];
  const calls: string[] = [];
  const failOn = new Set<string>();
  const page = (rows: Row[], offset: number) => rows.slice(offset, offset + 1000);
  return {
    calls,
    jobs,
    schedules,
    failOn,
    nex: {
      jobs: {
        list: async ({ offset }: { offset: number }) => ({ jobs: page(jobs, offset) }),
        create: async (params: Row) => {
          calls.push(`jobs.create:${String(params.name)}`);
          const job = { id: `job-${jobs.length + 1}`, default_revision_id: `rev-${jobs.length + 1}-1`, ...params };
          jobs.push(job);
          return { job };
        },
        update: async (params: Row) => {
          calls.push(`jobs.update:${String(params.status ?? "fields")}`);
          const row = jobs.find((entry) => entry.id === params.id)!;
          if (failOn.has("jobs.update")) throw new Error("injected jobs.update failure");
          Object.assign(row, params);
          return { job: row };
        },
      },
      schedules: {
        list: async ({ offset }: { offset: number }) => ({ schedules: page(schedules, offset) }),
        create: async (params: Row) => {
          calls.push(`schedules.create:${String(params.name)}`);
          const schedule = { id: `schedule-${schedules.length + 1}`, ...params, enabled: params.enabled ? 1 : 0 };
          schedules.push(schedule);
          return { schedule };
        },
        update: async (params: Row) => {
          calls.push(`schedules.update:${"enabled" in params ? `enabled=${String(params.enabled)}` : "cadence"}`);
          const row = schedules.find((entry) => entry.id === params.id)!;
          Object.assign(row, params, "enabled" in params ? { enabled: params.enabled ? 1 : 0 } : {});
          return { schedule: row };
        },
      },
    },
  };
}

describe("sequences runtime work (hooks)", () => {
  it("installs the six fixed jobs once and one disabled tick schedule", async () => {
    const fake = fakeNex();
    const result = await ensureSequencesWork(fake.nex, "sequences");
    expect(Object.keys(result.jobIds)).toEqual(["sequences.tick", "sequences.step", "sequences.draw", "sequences.send", "sequences.notify", "sequences.agent"]);
    expect(result.scheduleEnabled).toBe(false);
    expect(fake.jobs).toHaveLength(6);
    expect(fake.jobs.find((job) => job.name === TICK_JOB_NAME)).toMatchObject({
      script_path: TICK_SCRIPT_PATH,
      status: "active",
      lane_id: "control",
      execution_profile_revision_id: "job_profile_control_r1",
      timeout_ms: 50_000,
      created_by: "app:sequences",
    });
    expect(fake.schedules).toEqual([expect.objectContaining({ name: TICK_SCHEDULE_NAME, job_definition_id: result.jobId, expression: TICK_EXPRESSION, timezone: "UTC", enabled: 0 })]);
    await ensureSequencesWork(fake.nex, "sequences");
    expect(fake.calls.filter((call) => call.includes("create"))).toHaveLength(7);
    expect(fake.calls.filter((call) => call.includes("update"))).toEqual([]);
  });

  it("pins exact, never-empty allowlists; only agent is inactive; every profile is inline", () => {
    const byName = Object.fromEntries(JOB_SPECS.map((spec) => [spec.name, spec]));
    expect(JSON.parse(byName["sequences.tick"]!.runtime_method_allowlist)).toEqual(["jobs.invoke", "jobs.invokeMany", "jobs.runs.get", "jobs.runs.list", "jobs.cancel", "runtime.health"]);
    expect(JSON.parse(byName["sequences.step"]!.runtime_method_allowlist)).toEqual(["credentials.resolve", "runtime.health"]);
    expect(JSON.parse(byName["sequences.draw"]!.runtime_method_allowlist)).toEqual(["credentials.resolve", "runtime.health"]);
    expect(JSON.parse(byName["sequences.send"]!.runtime_method_allowlist)).toEqual(["runtime.health"]);
    expect(JSON.parse(byName["sequences.notify"]!.runtime_method_allowlist)).toEqual(["runtime.health"]);
    for (const spec of JOB_SPECS) expect(JSON.parse(spec.runtime_method_allowlist).length).toBeGreaterThan(0);
    for (const spec of JOB_SPECS) expect(JSON.parse(spec.runtime_method_allowlist)).not.toContain("sequences.approvals.record");
    expect(JOB_SPECS.filter((spec) => spec.status === "inactive").map((spec) => spec.name)).toEqual(["sequences.agent"]);
    expect(JOB_SPECS.map((spec) => spec.execution_profile_revision_id)).not.toContain("job_profile_provider_effect_r1");
    expect(byName["sequences.step"]).toMatchObject({ lane_id: "workflow", execution_profile_revision_id: "job_profile_adapter_projection_r1", timeout_ms: 840_000 });
  });

  it("finds its jobs after a short filtered first page instead of creating duplicates", async () => {
    const seeded = fakeNex();
    await ensureSequencesWork(seeded.nex, "sequences");
    const reads: number[] = [];
    const nex = {
      jobs: {
        list: async ({ limit, offset }: { limit: number; offset: number }) => {
          expect(limit).toBe(1000);
          reads.push(offset);
          // jobs.list filters internal definitions after paging: page one is short.
          return { payload: { jobs: offset === 0 ? [{ id: "other-1", name: "other.app" }] : offset === 1000 ? seeded.jobs : [] } };
        },
        create: async () => expect.fail("must not recreate a job"),
        update: async () => expect.fail("nothing drifted"),
      },
      schedules: { ...seeded.nex.schedules, create: async () => expect.fail("must not recreate the schedule") },
    };
    await ensureSequencesWork(nex, "sequences");
    expect(reads).toEqual([0, 1000, 2000]);
  });

  it("updates only on drift", async () => {
    const fake = fakeNex();
    await ensureSequencesWork(fake.nex, "sequences");
    fake.jobs.find((job) => job.name === "sequences.step")!.runtime_method_allowlist = JSON.stringify(["runtime.health"]);
    fake.calls.length = 0;
    await ensureSequencesWork(fake.nex, "sequences");
    expect(fake.calls).toEqual(["jobs.update:active"]);
  });

  it("keeps an enabled schedule enabled across deactivate -> upgrade -> activate, parking only the tick", async () => {
    const fake = fakeNex();
    await ensureSequencesWork(fake.nex, "sequences");
    fake.schedules[0]!.enabled = 1; // what sequences.runtime.configure apply sets
    await pauseSequencesWork(fake.nex);
    expect(fake.jobs.filter((job) => job.status === "inactive").map((job) => job.name).sort()).toEqual(["sequences.agent", "sequences.tick"]);
    const again = await ensureSequencesWork(fake.nex, "sequences");
    expect(again.scheduleEnabled).toBe(true);
    expect(fake.jobs.find((job) => job.name === TICK_JOB_NAME)!.status).toBe("active");
    expect(fake.calls.some((call) => call.startsWith("schedules.update:enabled"))).toBe(false);
  });

  it("refuses a tick schedule bound to another job, and any other sequences schedule", async () => {
    const bound = fakeNex({ jobs: [], schedules: [{ id: "schedule-x", name: TICK_SCHEDULE_NAME, job_definition_id: "job-other", enabled: 0 }] });
    await expect(ensureSequencesWork(bound.nex, "sequences")).rejects.toThrow(/bound to another job/);
    const extra = fakeNex({ schedules: [{ id: "schedule-y", name: "sequences.once", job_definition_id: "job-1", expression: "2026-10-27T13:00:00Z", enabled: 0 }] });
    await expect(ensureSequencesWork(extra.nex, "sequences")).rejects.toThrow(/only sequences.tick may exist/);
  });

  it("never creates a schedule other than sequences.tick, across install, upgrade and uninstall", async () => {
    const fake = fakeNex();
    await ensureSequencesWork(fake.nex, "sequences");
    await pauseSequencesWork(fake.nex);
    await ensureSequencesWork(fake.nex, "sequences");
    await retireSequencesWork(fake.nex);
    expect(fake.calls.filter((call) => call.startsWith("schedules.create"))).toEqual([`schedules.create:${TICK_SCHEDULE_NAME}`]);
    expect(fake.schedules.map((schedule) => schedule.name)).toEqual([TICK_SCHEDULE_NAME]);
  });

  it("uninstall disables the schedule, parks every job and keeps the definitions", async () => {
    const fake = fakeNex();
    await ensureSequencesWork(fake.nex, "sequences");
    fake.schedules[0]!.enabled = 1;
    await retireSequencesWork(fake.nex);
    expect(fake.schedules[0]!.enabled).toBe(0);
    expect(fake.jobs).toHaveLength(6);
    expect(fake.jobs.every((job) => job.status === "inactive")).toBe(true);
    expect(JOB_NAMES).toHaveLength(6);
  });
});

describe("sequences.runtime.configure plan/apply", () => {
  it("has a stable plan sha that differs by target", () => {
    const armed = runtimePlan("armed");
    expect(runtimePlan("armed").plan_sha256).toBe(armed.plan_sha256);
    expect(runtimePlan("parked").plan_sha256).not.toBe(armed.plan_sha256);
    expect(armed.plan.schedules).toEqual([{ name: "sequences.tick", expression: "0 * * * * *", timezone: "UTC", enabled: true }]);
    expect(armed.plan.provider_write_authority).toBe(false);
    expect(CONFIGURE_CONFIRMATION).toBe("CONFIGURE_SEQUENCES_RUNTIME");
  });

  it("arms: disables first, writes the jobs, enables only the tick, and reads back exactly", async () => {
    const fake = fakeNex();
    await ensureSequencesWork(fake.nex, "sequences");
    fake.calls.length = 0;
    const applied = await applyRuntimePlan(fake.nex, "armed");
    expect(fake.calls[0]).toBe("schedules.update:enabled=false");
    expect(fake.calls[fake.calls.length - 1]).toBe("schedules.update:enabled=true");
    expect(applied.readback.schedule).toMatchObject({ enabled: true, expression: TICK_EXPRESSION });
    await applyRuntimePlan(fake.nex, "parked");
    expect(fake.schedules[0]!.enabled).toBe(0);
  });

  it("rolls back to disabled when a write fails", async () => {
    const fake = fakeNex();
    await ensureSequencesWork(fake.nex, "sequences");
    fake.schedules[0]!.enabled = 1;
    fake.failOn.add("jobs.update");
    await expect(applyRuntimePlan(fake.nex, "armed")).rejects.toThrow(/injected/);
    expect(fake.schedules[0]!.enabled).toBe(0);
  });

  it("refuses when the job or schedule shape is not exactly one each", async () => {
    const fake = fakeNex();
    await ensureSequencesWork(fake.nex, "sequences");
    fake.jobs.push({ ...fake.jobs[1]!, id: "job-dup" });
    await expect(applyRuntimePlan(fake.nex, "armed")).rejects.toThrow(/duplicated/);
    const missing = fakeNex();
    await expect(applyRuntimePlan(missing.nex, "armed")).rejects.toThrow(/missing/);
  });
});
