// The app's runtime work: six fixed job definitions and one schedule, ensured idempotently by name
// and updated only on drift. A new sequence never adds a job, schedule or allowlist entry.
//
// Install creates the tick schedule DISABLED; no hook ever writes `enabled`, so an install or
// upgrade never starts ticking by surprise. Arming is sequences.runtime.configure (a hash-confirmed
// plan/apply method, the commerce pattern), and every hook keeps whatever state it set.
//
// The step jobs are `active` from install: hygiene cancels delayed Runs of inactive definitions,
// and "inactive" does not stop queued Runs from leasing anyway. Only sequences.agent stays inactive
// (until P5). No schedule other than sequences.tick is ever created: a one-shot expression would hit
// the no-next-occurrence bug, which stops leasing on every worker.
import { fileURLToPath } from "node:url";
import { asString, isEnabled, listAll, unwrapPayload, asRecord, type Row } from "../lib/nex.js";
import type { AppStore, NexClient } from "../lib/types.js";

export const TICK_JOB_NAME = "sequences.tick";
export const TICK_SCHEDULE_NAME = "sequences.tick";
// 6-field cron (sec min hour dom mon dow), evaluated in UTC.
export const TICK_EXPRESSION = "0 * * * * *";
export const TICK_TIMEZONE = "UTC";

// Resolves inside the immutable release tree the hook is loaded from, which is where the worker's
// job-script fence (job-script-roots.ts) requires module scripts to live.
const script = (name: string) => fileURLToPath(new URL(`../jobs/${name}.ts`, import.meta.url));
export const TICK_SCRIPT_PATH = script("tick");

export type JobSpec = {
  name: string;
  description: string;
  script_path: string;
  status: "active" | "inactive";
  timeout_ms: number;
  lane_id: string;
  execution_profile_revision_id: string;
  // A pinned list is required: with none the worker allows only runtime.health, and an empty
  // intersection with the profile refuses the launch. Every runtime method the job calls is here.
  runtime_method_allowlist: string;
};

const allow = (...methods: string[]) => JSON.stringify(methods);

// Inline profiles, never provider_effect: that one clamps a 15-minute timeout to 300 s, its isolated
// attempts never set ambiguous_external_effect, and only the fast isolated path passes ctx.app.store.
export const JOB_SPECS: readonly JobSpec[] = Object.freeze([
  {
    name: TICK_JOB_NAME,
    description: "Advance due Sequences steps once a minute",
    script_path: TICK_SCRIPT_PATH,
    status: "active",
    timeout_ms: 50_000,
    lane_id: "control",
    execution_profile_revision_id: "job_profile_control_r1",
    runtime_method_allowlist: allow("jobs.invoke", "jobs.invokeMany", "jobs.runs.get", "jobs.runs.list", "jobs.cancel", "runtime.health"),
  },
  {
    name: "sequences.step",
    description: "Run one Sequences step phase: observe reads and the system probe",
    script_path: script("step"),
    status: "active",
    timeout_ms: 840_000,
    lane_id: "workflow",
    execution_profile_revision_id: "job_profile_adapter_projection_r1",
    runtime_method_allowlist: allow("credentials.resolve", "runtime.health"),
  },
  {
    name: "sequences.draw",
    description: "Run one Sequences drawing phase (P1b: shadow reads and the compare only)",
    script_path: script("draw"),
    status: "active",
    timeout_ms: 840_000,
    lane_id: "workflow",
    execution_profile_revision_id: "job_profile_adapter_projection_r1",
    runtime_method_allowlist: allow("credentials.resolve", "runtime.health"),
  },
  {
    name: "sequences.send",
    description: "Send one shard of a Sequences send step (P1b: refuses every Run)",
    script_path: script("send"),
    status: "active",
    timeout_ms: 840_000,
    lane_id: "workflow",
    execution_profile_revision_id: "job_profile_adapter_projection_r1",
    runtime_method_allowlist: allow("runtime.health"),
  },
  {
    name: "sequences.notify",
    description: "Render and record Sequences alert deliveries (P1b: the off-host dead-man delivers)",
    script_path: script("notify"),
    status: "active",
    timeout_ms: 60_000,
    lane_id: "control",
    execution_profile_revision_id: "job_profile_control_r1",
    runtime_method_allowlist: allow("runtime.health"),
  },
  {
    // No 'agent' lane exists (work.ts WORK_LANE_IDS); agent turns run on automation
    // (agent-turn-contract.ts INTERNAL_AGENT_TURN_LANE_ID).
    name: "sequences.agent",
    description: "A bounded Sequences agent step that only proposes (inactive until P5)",
    script_path: script("agent"),
    status: "inactive",
    timeout_ms: 600_000,
    lane_id: "automation",
    execution_profile_revision_id: "job_profile_agent_r1",
    runtime_method_allowlist: allow("runtime.health"),
  },
]);

export const JOB_NAMES = JOB_SPECS.map((spec) => spec.name);

function drifted(existing: Row, spec: JobSpec): boolean {
  return (
    asString(existing.description) !== spec.description ||
    asString(existing.script_path) !== spec.script_path ||
    asString(existing.status) !== spec.status ||
    Number(existing.timeout_ms) !== spec.timeout_ms ||
    asString(existing.lane_id) !== spec.lane_id ||
    asString(existing.execution_profile_revision_id) !== spec.execution_profile_revision_id ||
    asString(existing.runtime_method_allowlist) !== spec.runtime_method_allowlist
  );
}

async function ensureJob(nex: NexClient, appId: string, jobs: Row[], spec: JobSpec, status: string): Promise<string> {
  const matches = jobs.filter((row) => asString(row.name) === spec.name);
  if (matches.length > 1) throw new Error(`sequences: duplicate job definitions named ${spec.name}`);
  const wanted = { ...spec, status } as JobSpec;
  const existing = matches[0];
  if (existing) {
    const id = asString(existing.id);
    const { name: _name, ...fields } = wanted;
    if (drifted(existing, wanted)) await nex.jobs.update({ id, ...fields });
    return id;
  }
  const created = unwrapPayload(await nex.jobs.create({ ...wanted, created_by: `app:${appId}` }));
  const id = asString(asRecord(created.job).id) || asString(created.id);
  if (!id) throw new Error(`sequences: jobs.create returned no id for ${spec.name}`);
  return id;
}

async function ensureTickSchedule(nex: NexClient, jobId: string, schedules: Row[]): Promise<{ id: string; enabled: boolean }> {
  const ours = schedules.filter((row) => asString(row.name).startsWith("sequences."));
  const foreign = ours.filter((row) => asString(row.name) !== TICK_SCHEDULE_NAME);
  if (foreign.length > 0) throw new Error(`sequences: unexpected schedules ${foreign.map((row) => asString(row.name)).join(", ")}; only ${TICK_SCHEDULE_NAME} may exist`);
  const matches = ours.filter((row) => asString(row.name) === TICK_SCHEDULE_NAME);
  if (matches.length > 1) throw new Error(`sequences: duplicate schedules named ${TICK_SCHEDULE_NAME}`);
  const existing = matches[0];
  if (existing) {
    const id = asString(existing.id);
    if (asString(existing.job_definition_id) !== jobId) {
      throw new Error(`sequences: schedule ${TICK_SCHEDULE_NAME} is bound to another job`);
    }
    if (asString(existing.expression) !== TICK_EXPRESSION || asString(existing.timezone) !== TICK_TIMEZONE) {
      // Repair the cadence only; `enabled` is never written here.
      await nex.schedules.update({ id, expression: TICK_EXPRESSION, timezone: TICK_TIMEZONE });
    }
    return { id, enabled: isEnabled(existing.enabled) };
  }
  const created = unwrapPayload(
    await nex.schedules.create({ job_definition_id: jobId, name: TICK_SCHEDULE_NAME, expression: TICK_EXPRESSION, timezone: TICK_TIMEZONE, enabled: false }),
  );
  const id = asString(asRecord(created.schedule).id) || asString(created.id);
  if (!id) throw new Error("sequences: schedules.create returned no id");
  return { id, enabled: false };
}

/** The tick reads job ids and revisions from the store (it holds no jobs.list). */
async function recordRuntimeJobs(nex: NexClient, store: AppStore | undefined): Promise<void> {
  if (!store) return;
  const jobs = (await listAll((params) => nex.jobs.list(params), "jobs")).filter((row) => JOB_NAMES.includes(asString(row.name)));
  for (const job of jobs) {
    await store.query(
      `INSERT INTO runtime_jobs (name, job_id, revision_id, status, updated_at) VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (name) DO UPDATE SET job_id = EXCLUDED.job_id, status = EXCLUDED.status, revision_id = EXCLUDED.revision_id,
         updated_at = CASE WHEN runtime_jobs.revision_id IS DISTINCT FROM EXCLUDED.revision_id OR runtime_jobs.job_id <> EXCLUDED.job_id THEN now() ELSE runtime_jobs.updated_at END`,
      [asString(job.name), asString(job.id), asString(job.default_revision_id) || null, asString(job.status)],
    );
  }
}

export type WorkState = { jobIds: Record<string, string>; jobId: string; scheduleId: string; scheduleEnabled: boolean };

export async function ensureSequencesWork(nex: NexClient, appId: string, store?: AppStore): Promise<WorkState> {
  const jobs = await listAll((params) => nex.jobs.list(params), "jobs");
  const schedules = await listAll((params) => nex.schedules.list(params), "schedules");
  const jobIds: Record<string, string> = {};
  for (const spec of JOB_SPECS) jobIds[spec.name] = await ensureJob(nex, appId, jobs, spec, spec.status);
  const schedule = await ensureTickSchedule(nex, jobIds[TICK_JOB_NAME]!, schedules);
  await recordRuntimeJobs(nex, store);
  return { jobIds, jobId: jobIds[TICK_JOB_NAME]!, scheduleId: schedule.id, scheduleEnabled: schedule.enabled };
}

/**
 * onDeactivate (also the first step of every upgrade): park ONLY the tick, which stops its schedule.
 * The step jobs stay active, so accepted delayed Runs are not orphaned (and cancelled by hygiene)
 * during an upgrade's deactivate, upgrade, activate sequence.
 */
export async function pauseSequencesWork(nex: NexClient): Promise<void> {
  const jobs = await listAll((params) => nex.jobs.list(params), "jobs");
  for (const job of jobs.filter((row) => asString(row.name) === TICK_JOB_NAME)) {
    if (asString(job.status) !== "inactive") await nex.jobs.update({ id: asString(job.id), status: "inactive" });
  }
}

/** onUninstall: disable the schedule and park every job; definitions and run history stay. */
export async function retireSequencesWork(nex: NexClient): Promise<void> {
  const schedules = await listAll((params) => nex.schedules.list(params), "schedules");
  for (const schedule of schedules.filter((row) => asString(row.name) === TICK_SCHEDULE_NAME)) {
    if (isEnabled(schedule.enabled)) await nex.schedules.update({ id: asString(schedule.id), enabled: false });
  }
  const jobs = await listAll((params) => nex.jobs.list(params), "jobs");
  for (const job of jobs.filter((row) => JOB_NAMES.includes(asString(row.name)))) {
    if (asString(job.status) !== "inactive") await nex.jobs.update({ id: asString(job.id), status: "inactive" });
  }
}
