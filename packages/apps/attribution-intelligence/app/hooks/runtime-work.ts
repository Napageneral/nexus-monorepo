import { fileURLToPath } from "node:url";
import type { NexClient } from "../../../../../nex/src/runtime/internal-runtime-client.js";

type RuntimeRow = Record<string, unknown>;

const ATTRIBUTION_RECORD_INGESTED_EVENT_TYPE = "record.ingested";
const ATTRIBUTION_RECORD_INGESTED_JOB_NAME = "attribution.record_ingested";
const ATTRIBUTION_RECORD_INGESTED_JOB_DESCRIPTION =
  "Load ingested acquisition and backend records and hand them to the attribution processor";
const ATTRIBUTION_RECORD_INGESTED_JOB_SCRIPT_PATH = fileURLToPath(
  new URL("../jobs/record-ingested.ts", import.meta.url),
);
const ATTRIBUTION_ACQUISITION_PLATFORMS = [
  "meta-ads",
  "google-ads",
  "tiktok-business",
] as const;
const ATTRIBUTION_BACKEND_PLATFORMS = [
  "shopify",
  "patient-now-emr",
] as const;
const ATTRIBUTION_WEBSITE_PLATFORMS = [
  "website-input",
  "website-tracking",
] as const;
const ATTRIBUTION_RECORD_INGESTED_PLATFORMS = [
  ...ATTRIBUTION_ACQUISITION_PLATFORMS,
  ...ATTRIBUTION_BACKEND_PLATFORMS,
  ...ATTRIBUTION_WEBSITE_PLATFORMS,
] as const;

function asRecord(value: unknown): RuntimeRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RuntimeRow) : {};
}

function asArray(value: unknown): RuntimeRow[] {
  return Array.isArray(value)
    ? value.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry)) as RuntimeRow[]
    : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asInt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
}

function desiredMatch(platform: string): { platform: string } {
  return { platform };
}

function desiredMatchJson(platform: string): string {
  return JSON.stringify(desiredMatch(platform));
}

function unwrapPayload(value: unknown): RuntimeRow {
  const record = asRecord(value);
  const payload = asRecord(record.payload);
  return Object.keys(payload).length > 0 ? payload : record;
}

async function listJobs(runtime: NexClient): Promise<RuntimeRow[]> {
  const response = await runtime.jobs.list({});
  return asArray(unwrapPayload(response).jobs);
}

async function listSubscriptions(runtime: NexClient, jobDefinitionId?: string): Promise<RuntimeRow[]> {
  const response = await runtime.events.subscriptions.list({
    event_type: ATTRIBUTION_RECORD_INGESTED_EVENT_TYPE,
    ...(jobDefinitionId ? { job_definition_id: jobDefinitionId } : {}),
  });
  return asArray(unwrapPayload(response).subscriptions);
}

async function ensureJob(runtime: NexClient, appId: string, dataDir: string): Promise<{ id: string; name: string }> {
  const jobs = await listJobs(runtime);
  const existing = jobs.find((job) => asString(job.name) === ATTRIBUTION_RECORD_INGESTED_JOB_NAME);
  const configJson = JSON.stringify({ data_dir: dataDir });

  if (existing) {
    const id = asString(existing.id);
    const needsUpdate =
      asString(existing.script_path) !== ATTRIBUTION_RECORD_INGESTED_JOB_SCRIPT_PATH ||
      asString(existing.description) !== ATTRIBUTION_RECORD_INGESTED_JOB_DESCRIPTION ||
      asString(existing.status) !== "active" ||
      asString(existing.config_json) !== configJson;

    if (needsUpdate) {
      const updated = unwrapPayload(
        await runtime.jobs.update({
          id,
          description: ATTRIBUTION_RECORD_INGESTED_JOB_DESCRIPTION,
          script_path: ATTRIBUTION_RECORD_INGESTED_JOB_SCRIPT_PATH,
          config_json: configJson,
          status: "active",
          created_by: appId,
        }),
      );
      return {
        id: asString(asRecord(updated.job).id) || id,
        name: ATTRIBUTION_RECORD_INGESTED_JOB_NAME,
      };
    }

    return { id, name: ATTRIBUTION_RECORD_INGESTED_JOB_NAME };
  }

  try {
    const created = unwrapPayload(
      await runtime.jobs.create({
        name: ATTRIBUTION_RECORD_INGESTED_JOB_NAME,
        description: ATTRIBUTION_RECORD_INGESTED_JOB_DESCRIPTION,
        script_path: ATTRIBUTION_RECORD_INGESTED_JOB_SCRIPT_PATH,
        config_json: configJson,
        status: "active",
        created_by: appId,
      }),
    );
    return {
      id: asString(asRecord(created.job).id),
      name: ATTRIBUTION_RECORD_INGESTED_JOB_NAME,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/UNIQUE constraint failed: job_definitions\.name/i.test(message)) {
      throw error;
    }

    const afterConflict = await listJobs(runtime);
    const conflicted = afterConflict.find((job) => asString(job.name) === ATTRIBUTION_RECORD_INGESTED_JOB_NAME);
    if (!conflicted) {
      throw error;
    }

    return {
      id: asString(conflicted.id),
      name: ATTRIBUTION_RECORD_INGESTED_JOB_NAME,
    };
  }
}

async function ensureSubscription(
  runtime: NexClient,
  jobDefinitionId: string,
  platform: string,
): Promise<{ id: string }> {
  const match = desiredMatch(platform);
  const matchJson = desiredMatchJson(platform);
  const subscriptions = await listSubscriptions(runtime, jobDefinitionId);
  const existing = subscriptions.find(
    (subscription) =>
      asString(subscription.job_definition_id) === jobDefinitionId &&
      asString(subscription.event_type) === ATTRIBUTION_RECORD_INGESTED_EVENT_TYPE &&
      asString(subscription.match_json) === matchJson,
  );

  if (existing) {
    const id = asString(existing.id);
    if (asInt(existing.enabled) !== 1) {
      const updated = unwrapPayload(
        await runtime.events.subscriptions.update({
          id,
          match,
          enabled: true,
        }),
      );
      return {
        id: asString(asRecord(updated.subscription).id) || id,
      };
    }

    return { id };
  }

  const created = unwrapPayload(
    await runtime.events.subscriptions.create({
      job_definition_id: jobDefinitionId,
      event_type: ATTRIBUTION_RECORD_INGESTED_EVENT_TYPE,
      match,
      enabled: true,
    }),
  );
  return {
    id: asString(asRecord(created.subscription).id),
  };
}

export async function ensureAttributionRuntimeWork(params: {
  runtime: NexClient;
  appId: string;
  dataDir: string;
}): Promise<{ jobDefinitionId: string; subscriptionIds: string[] }> {
  const job = await ensureJob(params.runtime, params.appId, params.dataDir);
  const subscriptions = await listSubscriptions(params.runtime, job.id);
  const desiredMatchJsons = new Set(
    ATTRIBUTION_RECORD_INGESTED_PLATFORMS.map((platform) => desiredMatchJson(platform)),
  );

  for (const subscription of subscriptions) {
    const matchJson = asString(subscription.match_json);
    if (!desiredMatchJsons.has(matchJson)) {
      await params.runtime.events.subscriptions.delete({
        id: asString(subscription.id),
      });
    }
  }

  const subscriptionIds: string[] = [];
  for (const platform of ATTRIBUTION_RECORD_INGESTED_PLATFORMS) {
    const subscription = await ensureSubscription(params.runtime, job.id, platform);
    if (subscription.id) {
      subscriptionIds.push(subscription.id);
    }
  }

  return {
    jobDefinitionId: job.id,
    subscriptionIds,
  };
}

export async function disableAttributionRuntimeWork(params: { runtime: NexClient }): Promise<void> {
  const jobs = await listJobs(params.runtime);
  const job = jobs.find((entry) => asString(entry.name) === ATTRIBUTION_RECORD_INGESTED_JOB_NAME);
  if (!job) {
    return;
  }

  const subscriptions = await listSubscriptions(params.runtime, asString(job.id));
  for (const subscription of subscriptions) {
    if (asInt(subscription.enabled) !== 0) {
      await params.runtime.events.subscriptions.update({
        id: asString(subscription.id),
        enabled: false,
      });
    }
  }
}

export async function removeAttributionRuntimeWork(params: { runtime: NexClient }): Promise<void> {
  const jobs = await listJobs(params.runtime);
  const job = jobs.find((entry) => asString(entry.name) === ATTRIBUTION_RECORD_INGESTED_JOB_NAME);
  if (!job) {
    return;
  }

  const jobDefinitionId = asString(job.id);
  const subscriptions = await listSubscriptions(params.runtime, jobDefinitionId);
  for (const subscription of subscriptions) {
    await params.runtime.events.subscriptions.delete({
      id: asString(subscription.id),
    });
  }

  await params.runtime.jobs.delete({
    id: jobDefinitionId,
  });
}
