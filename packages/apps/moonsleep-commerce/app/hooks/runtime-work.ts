import { fileURLToPath } from "node:url";
import type { NexClient } from "../../../../../nex/src/runtime/internal-runtime-client.js";

type RuntimeRow = Record<string, unknown>;

const EVENT_TYPE = "record.ingested";
const JOB_NAME = "moonsleep-commerce.shopify-customer-identity";
const JOB_DESCRIPTION =
  "Observe Shopify customer contacts and verify canonical MoonSleep customer entities";
const JOB_SCRIPT_PATH = fileURLToPath(
  new URL("../jobs/shopify-customer-identity.ts", import.meta.url),
);
const SHOPIFY_MATCH = Object.freeze({ platform: "shopify" });
const SHOPIFY_MATCH_JSON = JSON.stringify(SHOPIFY_MATCH);

function asRecord(value: unknown): RuntimeRow {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RuntimeRow)
    : {};
}

function asArray(value: unknown): RuntimeRow[] {
  return Array.isArray(value)
    ? value.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry)) as RuntimeRow[]
    : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function unwrapPayload(value: unknown): RuntimeRow {
  const row = asRecord(value);
  const payload = asRecord(row.payload);
  return Object.keys(payload).length > 0 ? payload : row;
}

async function listJobs(runtime: NexClient): Promise<RuntimeRow[]> {
  return asArray(unwrapPayload(await runtime.jobs.list({})).jobs);
}

async function listSubscriptions(runtime: NexClient, jobDefinitionId: string): Promise<RuntimeRow[]> {
  return asArray(
    unwrapPayload(
      await runtime.events.subscriptions.list({
        event_type: EVENT_TYPE,
        job_definition_id: jobDefinitionId,
      }),
    ).subscriptions,
  );
}

async function ensureJob(runtime: NexClient, appId: string): Promise<string> {
  const existing = (await listJobs(runtime)).find((row) => asString(row.name) === JOB_NAME);
  if (existing) {
    const id = asString(existing.id);
    const needsUpdate =
      asString(existing.description) !== JOB_DESCRIPTION ||
      asString(existing.script_path) !== JOB_SCRIPT_PATH ||
      asString(existing.status) !== "active";
    if (!needsUpdate) {
      return id;
    }
    const updated = unwrapPayload(
      await runtime.jobs.update({
        id,
        description: JOB_DESCRIPTION,
        script_path: JOB_SCRIPT_PATH,
        status: "active",
        created_by: appId,
      }),
    );
    return asString(asRecord(updated.job).id) || id;
  }

  const created = unwrapPayload(
    await runtime.jobs.create({
      name: JOB_NAME,
      description: JOB_DESCRIPTION,
      script_path: JOB_SCRIPT_PATH,
      status: "active",
      created_by: appId,
    }),
  );
  const id = asString(asRecord(created.job).id);
  if (!id) {
    throw new Error("MoonSleep commerce job creation did not return an id");
  }
  return id;
}

async function ensureSubscription(runtime: NexClient, jobDefinitionId: string): Promise<string> {
  const subscriptions = await listSubscriptions(runtime, jobDefinitionId);
  for (const row of subscriptions) {
    if (asString(row.match_json) !== SHOPIFY_MATCH_JSON) {
      throw new Error("MoonSleep commerce job has an unexpected event subscription");
    }
  }
  const existing = subscriptions.find(
    (row) =>
      asString(row.event_type) === EVENT_TYPE &&
      asString(row.job_definition_id) === jobDefinitionId &&
      asString(row.match_json) === SHOPIFY_MATCH_JSON,
  );
  if (existing) {
    const id = asString(existing.id);
    if (asInteger(existing.enabled) !== 1) {
      const updated = unwrapPayload(
        await runtime.events.subscriptions.update({
          id,
          match: SHOPIFY_MATCH,
          enabled: true,
        }),
      );
      return asString(asRecord(updated.subscription).id) || id;
    }
    return id;
  }
  const created = unwrapPayload(
    await runtime.events.subscriptions.create({
      job_definition_id: jobDefinitionId,
      event_type: EVENT_TYPE,
      match: SHOPIFY_MATCH,
      enabled: true,
    }),
  );
  const id = asString(asRecord(created.subscription).id);
  if (!id) {
    throw new Error("MoonSleep commerce subscription creation did not return an id");
  }
  return id;
}

export async function ensureMoonSleepCommerceRuntimeWork(params: {
  runtime: NexClient;
  appId: string;
}): Promise<{ jobDefinitionId: string; subscriptionId: string }> {
  const jobDefinitionId = await ensureJob(params.runtime, params.appId);
  const subscriptionId = await ensureSubscription(params.runtime, jobDefinitionId);
  return { jobDefinitionId, subscriptionId };
}

export async function disableMoonSleepCommerceRuntimeWork(runtime: NexClient): Promise<void> {
  const job = (await listJobs(runtime)).find((row) => asString(row.name) === JOB_NAME);
  if (!job) {
    return;
  }
  const jobId = asString(job.id);
  for (const subscription of await listSubscriptions(runtime, jobId)) {
    if (asInteger(subscription.enabled) !== 0) {
      await runtime.events.subscriptions.update({
        id: asString(subscription.id),
        enabled: false,
      });
    }
  }
  if (asString(job.status) !== "inactive") {
    await runtime.jobs.update({ id: jobId, status: "inactive" });
  }
}

export async function removeMoonSleepCommerceRuntimeWork(runtime: NexClient): Promise<void> {
  const job = (await listJobs(runtime)).find((row) => asString(row.name) === JOB_NAME);
  if (!job) {
    return;
  }
  const jobId = asString(job.id);
  for (const subscription of await listSubscriptions(runtime, jobId)) {
    await runtime.events.subscriptions.delete({ id: asString(subscription.id) });
  }
  await runtime.jobs.delete({ id: jobId });
}
