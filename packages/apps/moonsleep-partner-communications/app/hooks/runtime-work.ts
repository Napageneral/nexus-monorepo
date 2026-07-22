import { fileURLToPath } from "node:url";
import type { NexClient } from "../../../../../nex/src/runtime/internal-runtime-client.js";

type Row = Record<string, unknown>;

const EVENT_TYPE = "record.ingested";
const JOB_NAME = "moonsleep-partner-desk.alibaba-open-loop-projection";
const JOB_DESCRIPTION = "Project reviewed Alibaba communication evidence into Partner Desk open loops";
const SCRIPT_PATH = fileURLToPath(new URL("../jobs/alibaba-open-loop-projection.ts", import.meta.url));
const MATCH = Object.freeze({ platform: "alibaba" });
const MATCH_JSON = JSON.stringify(MATCH);

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
  const existing = (await listJobs(runtime)).find((entry) => text(entry.name) === JOB_NAME);
  if (existing) {
    const id = text(existing.id);
    if (
      text(existing.description) === JOB_DESCRIPTION &&
      text(existing.script_path) === SCRIPT_PATH &&
      text(existing.status) === "inactive"
    ) return id;
    const updated = payload(await runtime.jobs.update({
      id,
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

async function ensureSubscription(runtime: NexClient, jobId: string): Promise<string> {
  const subscriptions = await listSubscriptions(runtime, jobId);
  for (const subscription of subscriptions) {
    if (text(subscription.match_json) !== MATCH_JSON) {
      throw new Error("Partner Desk job has an unexpected event subscription");
    }
  }
  const existing = subscriptions.find((entry) => text(entry.match_json) === MATCH_JSON);
  if (existing) {
    const id = text(existing.id);
    if (Number(existing.enabled) !== 0) {
      await runtime.events.subscriptions.update({ id, match: MATCH, enabled: false });
    }
    return id;
  }
  const created = payload(await runtime.events.subscriptions.create({
    job_definition_id: jobId,
    event_type: EVENT_TYPE,
    match: MATCH,
    enabled: false,
  }));
  const id = text(row(created.subscription).id);
  if (!id) throw new Error("Partner Desk subscription creation did not return an id");
  return id;
}

export async function ensurePartnerDeskRuntimeWork(params: {
  runtime: NexClient;
  appId: string;
}): Promise<{ jobDefinitionId: string; subscriptionId: string }> {
  const jobDefinitionId = await ensureJob(params.runtime, params.appId);
  const subscriptionId = await ensureSubscription(params.runtime, jobDefinitionId);
  return { jobDefinitionId, subscriptionId };
}

export async function disablePartnerDeskRuntimeWork(runtime: NexClient): Promise<void> {
  const job = (await listJobs(runtime)).find((entry) => text(entry.name) === JOB_NAME);
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
  const job = (await listJobs(runtime)).find((entry) => text(entry.name) === JOB_NAME);
  if (!job) return;
  const jobId = text(job.id);
  for (const subscription of await listSubscriptions(runtime, jobId)) {
    await runtime.events.subscriptions.delete({ id: text(subscription.id) });
  }
  await runtime.jobs.delete({ id: jobId });
}
