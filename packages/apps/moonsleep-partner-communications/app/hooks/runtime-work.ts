import { fileURLToPath } from "node:url";
import type { NexClient } from "../../../../../nex/src/runtime/internal-runtime-client.js";

type Row = Record<string, unknown>;

const EVENT_TYPE = "record.ingested";
const JOB_NAME = "moonsleep-partner-desk.reviewed-open-loop-projection";
const LEGACY_JOB_NAME = "moonsleep-partner-desk.alibaba-open-loop-projection";
const JOB_DESCRIPTION = "Project reviewed partner communication evidence into Partner Desk open loops";
const SCRIPT_PATH = fileURLToPath(new URL("../jobs/reviewed-open-loop-projection.ts", import.meta.url));
const MATCHES = [
  Object.freeze({ platform: "alibaba" }),
  Object.freeze({ platform: "gmail" }),
] as const;
const MATCH_JSON = new Set(MATCHES.map((match) => JSON.stringify(match)));

function row(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((entry) => Object.keys(row(entry)).length > 0) as Row[] : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function payload(value: unknown): Row {
  const valueRow = row(value);
  const nested = row(valueRow.payload);
  return Object.keys(nested).length > 0 ? nested : valueRow;
}

async function listJobs(runtime: NexClient): Promise<Row[]> {
  return rows(payload(await runtime.jobs.list({})).jobs);
}

async function listSubscriptions(runtime: NexClient, jobId: string): Promise<Row[]> {
  return rows(payload(await runtime.events.subscriptions.list({
    event_type: EVENT_TYPE,
    job_definition_id: jobId,
  })).subscriptions);
}

async function ensureJob(runtime: NexClient, appId: string): Promise<string> {
  const owned = (await listJobs(runtime)).filter((entry) => {
    const name = text(entry.name);
    return name === JOB_NAME || name === LEGACY_JOB_NAME;
  });
  if (owned.length > 1) throw new Error("Partner Desk has duplicate owned jobs");
  const existing = owned[0];
  if (existing) {
    const id = text(existing.id);
    if (
      text(existing.name) === JOB_NAME &&
      text(existing.description) === JOB_DESCRIPTION &&
      text(existing.script_path) === SCRIPT_PATH &&
      text(existing.status) === "inactive"
    ) return id;
    const updated = payload(await runtime.jobs.update({
      id,
      name: JOB_NAME,
      description: JOB_DESCRIPTION,
      script_path: SCRIPT_PATH,
      status: "inactive",
      created_by: appId,
    }));
    return text(row(updated.job).id) || id;
  }
  const created = payload(await runtime.jobs.create({
    name: JOB_NAME,
    description: JOB_DESCRIPTION,
    script_path: SCRIPT_PATH,
    status: "inactive",
    created_by: appId,
  }));
  const id = text(row(created.job).id);
  if (!id) throw new Error("Partner Desk job creation did not return an id");
  return id;
}

async function ensureSubscriptions(runtime: NexClient, jobId: string): Promise<string[]> {
  const subscriptions = await listSubscriptions(runtime, jobId);
  for (const subscription of subscriptions) {
    if (!MATCH_JSON.has(text(subscription.match_json))) {
      throw new Error("Partner Desk job has an unexpected event subscription");
    }
  }
  const ids: string[] = [];
  for (const match of MATCHES) {
    const matchJson = JSON.stringify(match);
    const matching = subscriptions.filter((entry) => text(entry.match_json) === matchJson);
    if (matching.length > 1) throw new Error(`Partner Desk has duplicate ${match.platform} subscriptions`);
    const existing = matching[0];
    if (existing) {
      const id = text(existing.id);
      if (Number(existing.enabled) !== 0) {
        await runtime.events.subscriptions.update({ id, match, enabled: false });
      }
      ids.push(id);
      continue;
    }
    const created = payload(await runtime.events.subscriptions.create({
      job_definition_id: jobId,
      event_type: EVENT_TYPE,
      match,
      enabled: false,
    }));
    const id = text(row(created.subscription).id);
    if (!id) throw new Error("Partner Desk subscription creation did not return an id");
    ids.push(id);
  }
  return ids;
}

export async function ensurePartnerDeskRuntimeWork(params: {
  runtime: NexClient;
  appId: string;
}): Promise<{ jobDefinitionId: string; subscriptionIds: string[] }> {
  const jobDefinitionId = await ensureJob(params.runtime, params.appId);
  const subscriptionIds = await ensureSubscriptions(params.runtime, jobDefinitionId);
  return { jobDefinitionId, subscriptionIds };
}

export async function disablePartnerDeskRuntimeWork(runtime: NexClient): Promise<void> {
  const job = (await listJobs(runtime)).find((entry) => [JOB_NAME, LEGACY_JOB_NAME].includes(text(entry.name)));
  if (!job) return;
  const jobId = text(job.id);
  for (const subscription of await listSubscriptions(runtime, jobId)) {
    if (Number(subscription.enabled) !== 0) {
      await runtime.events.subscriptions.update({ id: text(subscription.id), enabled: false });
    }
  }
  if (text(job.status) !== "inactive") {
    await runtime.jobs.update({ id: jobId, status: "inactive" });
  }
}

export async function removePartnerDeskRuntimeWork(runtime: NexClient): Promise<void> {
  const job = (await listJobs(runtime)).find((entry) => [JOB_NAME, LEGACY_JOB_NAME].includes(text(entry.name)));
  if (!job) return;
  const jobId = text(job.id);
  for (const subscription of await listSubscriptions(runtime, jobId)) {
    await runtime.events.subscriptions.delete({ id: text(subscription.id) });
  }
  await runtime.jobs.delete({ id: jobId });
}
