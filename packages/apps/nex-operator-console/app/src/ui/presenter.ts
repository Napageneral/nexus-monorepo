import type { ScheduleJob, RuntimeSessionRow, PresenceEntry } from "./types.ts";
import { formatRelativeTimestamp, formatMs } from "./format.ts";

export function formatPresenceSummary(entry: PresenceEntry): string {
  const host = entry.host ?? "unknown";
  const ip = entry.ip ? `(${entry.ip})` : "";
  const mode = entry.mode ?? "";
  const version = entry.version ?? "";
  return `${host} ${ip} ${mode} ${version}`.trim();
}

export function formatPresenceAge(entry: PresenceEntry): string {
  const ts = entry.ts ?? null;
  return ts ? formatRelativeTimestamp(ts) : "n/a";
}

export function formatNextRun(ms?: number | null) {
  if (!ms) {
    return "n/a";
  }
  return `${formatMs(ms)} (${formatRelativeTimestamp(ms)})`;
}

export function formatSessionTokens(row: RuntimeSessionRow) {
  if (row.totalTokens == null) {
    return "n/a";
  }
  const total = row.totalTokens ?? 0;
  const ctx = row.contextTokens ?? 0;
  return ctx ? `${total} / ${ctx}` : String(total);
}

export function formatEventPayload(payload: unknown): string {
  if (payload == null) {
    return "";
  }
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    // oxlint-disable typescript/no-base-to-string
    return String(payload);
  }
}

export function formatScheduleState(job: ScheduleJob) {
  const next = job.next_run_at ? formatMs(Date.parse(job.next_run_at)) : "n/a";
  const last = job.last_run_at ? formatMs(Date.parse(job.last_run_at)) : "n/a";
  return `${job.enabled ? "enabled" : "disabled"} · next ${next} · last ${last}`;
}

export function formatScheduleSpec(job: ScheduleJob) {
  const timezone = job.timezone?.trim();
  return `Schedule ${job.expression}${timezone ? ` (${timezone})` : ""}`;
}

export function formatSchedulePayload(job: ScheduleJob) {
  const jobName = job.job_name?.trim();
  return jobName ? `Job: ${jobName}` : `Job definition: ${job.job_definition_id}`;
}
