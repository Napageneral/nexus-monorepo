import { describe, expect, it } from "vitest";
import {
  TICK_EXPRESSION,
  TICK_JOB_NAME,
  TICK_SCHEDULE_NAME,
  TICK_SCRIPT_PATH,
  ensureSequencesWork,
  pauseSequencesWork,
  retireSequencesWork,
} from "./runtime-work.js";

type Row = Record<string, unknown>;

function fakeNex(seed: { jobs?: Row[]; schedules?: Row[] } = {}) {
  const jobs: Row[] = seed.jobs ?? [];
  const schedules: Row[] = seed.schedules ?? [];
  const calls: string[] = [];
  const page = (rows: Row[], offset: number) => rows.slice(offset, offset + 1000);
  return {
    calls,
    jobs,
    schedules,
    nex: {
      jobs: {
        list: async ({ offset }: { offset: number }) => ({ jobs: page(jobs, offset) }),
        create: async (params: Row) => {
          calls.push("jobs.create");
          const job = { id: `job-${jobs.length + 1}`, ...params };
          jobs.push(job);
          return { job };
        },
        update: async (params: Row) => {
          calls.push(`jobs.update:${String(params.status ?? "fields")}`);
          Object.assign(jobs.find((row) => row.id === params.id)!, params);
          return { job: params };
        },
      },
      schedules: {
        list: async ({ offset }: { offset: number }) => ({ schedules: page(schedules, offset) }),
        create: async (params: Row) => {
          calls.push("schedules.create");
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

describe("sequences runtime work", () => {
  it("installs one active tick job and one disabled tick schedule", async () => {
    const fake = fakeNex();
    const result = await ensureSequencesWork(fake.nex, "sequences");
    expect(result).toEqual({ jobId: "job-1", scheduleId: "schedule-1", scheduleEnabled: false });
    expect(fake.jobs[0]).toMatchObject({
      name: TICK_JOB_NAME,
      script_path: TICK_SCRIPT_PATH,
      status: "active",
      lane_id: "control",
      execution_profile_revision_id: "job_profile_control_r1",
      runtime_method_allowlist: JSON.stringify(["runtime.health"]),
      created_by: "app:sequences",
    });
    expect(fake.schedules[0]).toMatchObject({
      name: TICK_SCHEDULE_NAME,
      job_definition_id: "job-1",
      expression: TICK_EXPRESSION,
      timezone: "UTC",
      enabled: 0,
    });
  });

  it("keeps an enabled schedule enabled across deactivate and re-activate (an upgrade)", async () => {
    const fake = fakeNex();
    await ensureSequencesWork(fake.nex, "sequences");
    fake.schedules[0]!.enabled = 1; // what the hash-confirmed apply method would set
    await pauseSequencesWork(fake.nex);
    expect(fake.jobs[0]!.status).toBe("inactive");
    const again = await ensureSequencesWork(fake.nex, "sequences");
    expect(again.scheduleEnabled).toBe(true);
    expect(fake.jobs[0]!.status).toBe("active");
    expect(fake.calls.filter((call) => call.endsWith("create"))).toEqual(["jobs.create", "schedules.create"]);
    expect(fake.calls.some((call) => call.startsWith("schedules.update:enabled"))).toBe(false);
  });

  it("finds its job after a short filtered page instead of creating a duplicate", async () => {
    // jobs.list filters internal definitions after pagination: page one is short, page two holds the job.
    const tickJob = {
      id: "job-7",
      name: TICK_JOB_NAME,
      description: "Advance due Sequences steps once a minute",
      script_path: TICK_SCRIPT_PATH,
      status: "active",
      timeout_ms: 50_000,
      lane_id: "control",
      execution_profile_revision_id: "job_profile_control_r1",
      runtime_method_allowlist: JSON.stringify(["runtime.health"]),
    };
    const reads: number[] = [];
    const nex = {
      jobs: {
        list: async ({ limit, offset }: { limit: number; offset: number }) => {
          expect(limit).toBe(1000);
          reads.push(offset);
          return { payload: { jobs: offset === 0 ? [{ id: "other-1", name: "other.app" }] : offset === 1000 ? [tickJob] : [] } };
        },
        create: async () => expect.fail("must not recreate the tick job"),
        update: async () => expect.fail("the tick job already matches"),
      },
      schedules: {
        list: async ({ offset }: { offset: number }) => ({
          schedules: offset === 0
            ? [{ id: "schedule-7", name: TICK_SCHEDULE_NAME, job_definition_id: "job-7", expression: TICK_EXPRESSION, timezone: "UTC", enabled: 1 }]
            : [],
        }),
        create: async () => expect.fail("must not recreate the tick schedule"),
        update: async () => expect.fail("the tick schedule already matches"),
      },
    };
    expect(await ensureSequencesWork(nex, "sequences")).toEqual({ jobId: "job-7", scheduleId: "schedule-7", scheduleEnabled: true });
    expect(reads).toEqual([0, 1000, 2000]);
  });

  it("refuses a schedule bound to another job", async () => {
    const fake = fakeNex({
      jobs: [{ id: "job-x", name: TICK_JOB_NAME, script_path: TICK_SCRIPT_PATH }],
      schedules: [{ id: "schedule-x", name: TICK_SCHEDULE_NAME, job_definition_id: "job-other", enabled: 0 }],
    });
    await expect(ensureSequencesWork(fake.nex, "sequences")).rejects.toThrow(/bound to another job/);
  });

  it("uninstall disables the schedule and keeps the definitions", async () => {
    const fake = fakeNex();
    await ensureSequencesWork(fake.nex, "sequences");
    fake.schedules[0]!.enabled = 1;
    await retireSequencesWork(fake.nex);
    expect(fake.schedules[0]!.enabled).toBe(0);
    expect(fake.jobs).toHaveLength(1);
  });
});
