// sequences.runtime.configure: the only thing that arms or parks the tick (commerce's
// configure-schedules pattern). Plan prints the exact job and schedule shape and its sha256; apply
// needs that sha and the literal confirmation, disables the schedule first, writes the jobs, enables
// only the planned set, rolls back to disabled on any error and reads everything back exactly.
import { createHash } from "node:crypto";
import { JOB_SPECS, TICK_EXPRESSION, TICK_JOB_NAME, TICK_SCHEDULE_NAME, TICK_TIMEZONE } from "../hooks/runtime-work.js";
import { asString, isEnabled, listAll, type Row } from "./nex.js";
import type { NexClient } from "./types.js";

export const CONFIGURE_CONFIRMATION = "CONFIGURE_SEQUENCES_RUNTIME";

export type RuntimePlan = {
  version: 1;
  target: "armed" | "parked";
  jobs: Array<{ name: string; status: string; lane_id: string; profile: string; timeout_ms: number; allowlist: string[] }>;
  schedules: Array<{ name: string; expression: string; timezone: string; enabled: boolean }>;
  provider_write_authority: false;
};

export function runtimePlan(target: "armed" | "parked"): { plan: RuntimePlan; plan_sha256: string } {
  const plan: RuntimePlan = {
    version: 1,
    target,
    jobs: JOB_SPECS.map((spec) => ({
      name: spec.name,
      status: spec.status,
      lane_id: spec.lane_id,
      profile: spec.execution_profile_revision_id,
      timeout_ms: spec.timeout_ms,
      allowlist: JSON.parse(spec.runtime_method_allowlist) as string[],
    })),
    schedules: [{ name: TICK_SCHEDULE_NAME, expression: TICK_EXPRESSION, timezone: TICK_TIMEZONE, enabled: target === "armed" }],
    provider_write_authority: false,
  };
  return { plan, plan_sha256: createHash("sha256").update(JSON.stringify(plan), "utf8").digest("hex") };
}

export class ConfigureRefusal extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Exactly one job per name, exactly one tick schedule bound to the tick job, nothing else. */
function shapeOf(jobs: Row[], schedules: Row[]): { jobs: Map<string, Row>; schedule: Row } {
  const byName = new Map<string, Row>();
  for (const spec of JOB_SPECS) {
    const matches = jobs.filter((job) => asString(job.name) === spec.name);
    if (matches.length !== 1) throw new ConfigureRefusal("refuse.runtime_shape", `${spec.name} is ${matches.length === 0 ? "missing" : "duplicated"}: run the install hook (site-nexapp release) first`);
    byName.set(spec.name, matches[0]!);
  }
  const ours = schedules.filter((row) => asString(row.name).startsWith("sequences."));
  if (ours.length !== 1 || asString(ours[0]!.name) !== TICK_SCHEDULE_NAME) {
    throw new ConfigureRefusal("refuse.runtime_shape", `expected exactly one schedule ${TICK_SCHEDULE_NAME}, found ${ours.map((row) => asString(row.name)).join(", ") || "none"}`);
  }
  if (asString(ours[0]!.job_definition_id) !== asString(byName.get(TICK_JOB_NAME)!.id)) {
    throw new ConfigureRefusal("refuse.runtime_shape", `${TICK_SCHEDULE_NAME} is bound to another job`);
  }
  return { jobs: byName, schedule: ours[0]! };
}

export async function applyRuntimePlan(nex: NexClient, target: "armed" | "parked"): Promise<{ plan: RuntimePlan; plan_sha256: string; readback: Record<string, unknown> }> {
  const { plan, plan_sha256 } = runtimePlan(target);
  const listed = shapeOf(await listAll((params) => nex.jobs.list(params), "jobs"), await listAll((params) => nex.schedules.list(params), "schedules"));
  const scheduleId = asString(listed.schedule.id);
  try {
    // Disable first: a failed write can leave job metadata updated, never a half-armed tick.
    await nex.schedules.update({ id: scheduleId, enabled: false });
    for (const spec of JOB_SPECS) {
      const job = listed.jobs.get(spec.name)!;
      const { name: _name, ...fields } = spec;
      await nex.jobs.update({ id: asString(job.id), ...fields });
    }
    await nex.schedules.update({ id: scheduleId, expression: TICK_EXPRESSION, timezone: TICK_TIMEZONE, enabled: false });
    if (plan.schedules[0]!.enabled) await nex.schedules.update({ id: scheduleId, enabled: true });
  } catch (error) {
    try {
      await nex.schedules.update({ id: scheduleId, enabled: false });
    } catch (rollbackError) {
      throw new Error(`sequences runtime configuration failed and the disable rollback failed: ${(rollbackError as Error).message}`, { cause: error });
    }
    throw error;
  }
  const verified = shapeOf(await listAll((params) => nex.jobs.list(params), "jobs"), await listAll((params) => nex.schedules.list(params), "schedules"));
  for (const spec of JOB_SPECS) {
    const job = verified.jobs.get(spec.name)!;
    const exact =
      asString(job.status) === spec.status &&
      asString(job.lane_id) === spec.lane_id &&
      asString(job.execution_profile_revision_id) === spec.execution_profile_revision_id &&
      Number(job.timeout_ms) === spec.timeout_ms &&
      asString(job.runtime_method_allowlist) === spec.runtime_method_allowlist &&
      asString(job.script_path) === spec.script_path;
    if (!exact) throw new Error(`sequences runtime configuration: ${spec.name} failed exact readback`);
  }
  const schedule = verified.schedule;
  if (asString(schedule.expression) !== TICK_EXPRESSION || asString(schedule.timezone) !== TICK_TIMEZONE || isEnabled(schedule.enabled) !== plan.schedules[0]!.enabled) {
    throw new Error(`sequences runtime configuration: ${TICK_SCHEDULE_NAME} failed exact readback`);
  }
  return {
    plan,
    plan_sha256,
    readback: {
      jobs: JOB_SPECS.map((spec) => ({ name: spec.name, id: asString(verified.jobs.get(spec.name)!.id), status: asString(verified.jobs.get(spec.name)!.status) })),
      schedule: { id: asString(schedule.id), enabled: isEnabled(schedule.enabled), expression: asString(schedule.expression), next_run_at: schedule.next_run_at ?? null },
    },
  };
}
