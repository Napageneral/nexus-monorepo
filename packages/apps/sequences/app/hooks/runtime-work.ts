// The app's runtime work: one job definition and one schedule, ensured idempotently by name.
// Install creates the schedule DISABLED; no hook ever enables it, so an install or upgrade never
// starts ticking by surprise. Enabling is a hash-confirmed plan/apply method (commerce pattern),
// and every hook keeps whatever enabled state that method set.
import { fileURLToPath } from "node:url";
import type { NexClient } from "../lib/types.js";

export const TICK_JOB_NAME = "sequences.tick";
export const TICK_SCHEDULE_NAME = "sequences.tick";
// 6-field cron (sec min hour dom mon dow), evaluated in UTC.
export const TICK_EXPRESSION = "0 * * * * *";
export const TICK_TIMEZONE = "UTC";
// Resolves inside the immutable release tree the hook is loaded from, which is where the worker's
// job-script fence (job-script-roots.ts) requires module scripts to live.
export const TICK_SCRIPT_PATH = fileURLToPath(new URL("../jobs/tick.ts", import.meta.url));
const TICK_DESCRIPTION = "Advance due Sequences steps once a minute";
const TICK_LANE_ID = "control";
const TICK_PROFILE_REVISION_ID = "job_profile_control_r1";
const TICK_TIMEOUT_MS = 50_000;
// A pinned list is required: with none the worker allows only runtime.health, and an empty
// intersection with the profile refuses the launch. List every runtime method the job calls.
const TICK_RUNTIME_METHOD_ALLOWLIST = JSON.stringify(["runtime.health"]);

type Row = Record<string, unknown>;

function asRecord(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
}
function unwrap(value: unknown): Row {
  const row = asRecord(value);
  return "payload" in row ? asRecord(row.payload) : "result" in row ? asRecord(row.result) : row;
}
function asArray(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// jobs.list filters internal definitions after pagination, so a short page does not mean the list
// ended: read until an empty page (moonsleep-site-bridge hooks/runtime-work.mjs).
async function listAll(call: (params: Row) => Promise<unknown>, key: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = asArray(unwrap(await call({ limit: 1000, offset }))[key]);
    if (page.length === 0) return rows;
    rows.push(...page);
  }
}

async function ensureTickJob(nex: NexClient, appId: string, jobs: Row[]): Promise<string> {
  const matches = jobs.filter((row) => asString(row.name) === TICK_JOB_NAME);
  if (matches.length > 1) throw new Error(`sequences: duplicate job definitions named ${TICK_JOB_NAME}`);
  const spec = {
    description: TICK_DESCRIPTION,
    script_path: TICK_SCRIPT_PATH,
    status: "active",
    timeout_ms: TICK_TIMEOUT_MS,
    lane_id: TICK_LANE_ID,
    execution_profile_revision_id: TICK_PROFILE_REVISION_ID,
    runtime_method_allowlist: TICK_RUNTIME_METHOD_ALLOWLIST,
  };
  const existing = matches[0];
  if (existing) {
    const id = asString(existing.id);
    const drifted =
      asString(existing.description) !== spec.description ||
      asString(existing.script_path) !== spec.script_path ||
      asString(existing.status) !== spec.status ||
      Number(existing.timeout_ms) !== spec.timeout_ms ||
      asString(existing.lane_id) !== spec.lane_id ||
      asString(existing.execution_profile_revision_id) !== spec.execution_profile_revision_id ||
      asString(existing.runtime_method_allowlist) !== spec.runtime_method_allowlist;
    if (drifted) await nex.jobs.update({ id, ...spec });
    return id;
  }
  const created = unwrap(await nex.jobs.create({ name: TICK_JOB_NAME, ...spec, created_by: `app:${appId}` }));
  const id = asString(asRecord(created.job).id) || asString(created.id);
  if (!id) throw new Error("sequences: jobs.create returned no id");
  return id;
}

async function ensureTickSchedule(
  nex: NexClient,
  jobId: string,
  schedules: Row[],
): Promise<{ id: string; enabled: boolean }> {
  const matches = schedules.filter((row) => asString(row.name) === TICK_SCHEDULE_NAME);
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
    return { id, enabled: Number(existing.enabled) === 1 || existing.enabled === true };
  }
  const created = unwrap(
    await nex.schedules.create({
      job_definition_id: jobId,
      name: TICK_SCHEDULE_NAME,
      expression: TICK_EXPRESSION,
      timezone: TICK_TIMEZONE,
      enabled: false,
    }),
  );
  const id = asString(asRecord(created.schedule).id) || asString(created.id);
  if (!id) throw new Error("sequences: schedules.create returned no id");
  return { id, enabled: false };
}

export async function ensureSequencesWork(
  nex: NexClient,
  appId: string,
): Promise<{ jobId: string; scheduleId: string; scheduleEnabled: boolean }> {
  const jobs = await listAll((params) => nex.jobs.list(params), "jobs");
  const schedules = await listAll((params) => nex.schedules.list(params), "schedules");
  const jobId = await ensureTickJob(nex, appId, jobs);
  const schedule = await ensureTickSchedule(nex, jobId, schedules);
  return { jobId, scheduleId: schedule.id, scheduleEnabled: schedule.enabled };
}

/** onDeactivate (also the first step of every upgrade): park the job, keep the schedule's state. */
export async function pauseSequencesWork(nex: NexClient): Promise<void> {
  const jobs = await listAll((params) => nex.jobs.list(params), "jobs");
  for (const job of jobs.filter((row) => asString(row.name) === TICK_JOB_NAME)) {
    if (asString(job.status) !== "inactive") await nex.jobs.update({ id: asString(job.id), status: "inactive" });
  }
}

/** onUninstall: disable the schedule and park the job; definitions and run history stay as evidence. */
export async function retireSequencesWork(nex: NexClient): Promise<void> {
  const schedules = await listAll((params) => nex.schedules.list(params), "schedules");
  for (const schedule of schedules.filter((row) => asString(row.name) === TICK_SCHEDULE_NAME)) {
    if (Number(schedule.enabled) === 1 || schedule.enabled === true) {
      await nex.schedules.update({ id: asString(schedule.id), enabled: false });
    }
  }
  await pauseSequencesWork(nex);
}
