import { fileURLToPath } from "node:url";
import type { NexClient } from "../../../../../nex/src/runtime/internal-runtime-client.js";

type RuntimeRow = Record<string, unknown>;

const EVENT_TYPE = "record.ingested";
const CUSTOMER_JOB_NAME = "moonsleep-commerce.shopify-customer-identity";
const CUSTOMER_JOB_DESCRIPTION =
  "Observe Shopify customer contacts and verify canonical MoonSleep customer entities";
const DORMANT_JOB_STATUS = "inactive";
const CUSTOMER_JOB_SCRIPT_PATH = fileURLToPath(
  new URL("../jobs/shopify-customer-identity.ts", import.meta.url),
);
const COMMERCE_JOB_NAME = "moonsleep-commerce.shopify-order-commerce";
const COMMERCE_JOB_DESCRIPTION =
  "Project committed Shopify order and line-item revisions into typed commerce state";
const COMMERCE_JOB_SCRIPT_PATH = fileURLToPath(
  new URL("../jobs/shopify-order-commerce.ts", import.meta.url),
);
const JOB_SPECS = Object.freeze([
  {
    name: CUSTOMER_JOB_NAME,
    description: CUSTOMER_JOB_DESCRIPTION,
    scriptPath: CUSTOMER_JOB_SCRIPT_PATH,
    matches: [{ platform: "shopify", container_id: "customer" }],
  },
  {
    name: COMMERCE_JOB_NAME,
    description: COMMERCE_JOB_DESCRIPTION,
    scriptPath: COMMERCE_JOB_SCRIPT_PATH,
    matches: [
      { platform: "shopify", container_id: "order" },
      { platform: "shopify", container_id: "line_item" },
    ],
  },
]);
const LEGACY_SHOPIFY_MATCH_JSON = JSON.stringify({ platform: "shopify" });

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

async function ensureJob(
  runtime: NexClient,
  appId: string,
  spec: (typeof JOB_SPECS)[number],
): Promise<string> {
  const existing = (await listJobs(runtime)).find((row) => asString(row.name) === spec.name);
  if (existing) {
    const id = asString(existing.id);
    const needsUpdate =
      asString(existing.description) !== spec.description ||
      asString(existing.script_path) !== spec.scriptPath ||
      asString(existing.status) !== DORMANT_JOB_STATUS;
    if (!needsUpdate) {
      return id;
    }
    const updated = unwrapPayload(
      await runtime.jobs.update({
        id,
        description: spec.description,
        script_path: spec.scriptPath,
        status: DORMANT_JOB_STATUS,
        created_by: appId,
      }),
    );
    return asString(asRecord(updated.job).id) || id;
  }

  const created = unwrapPayload(
    await runtime.jobs.create({
      name: spec.name,
      description: spec.description,
      script_path: spec.scriptPath,
      status: DORMANT_JOB_STATUS,
      created_by: appId,
    }),
  );
  const id = asString(asRecord(created.job).id);
  if (!id) {
    throw new Error("MoonSleep commerce job creation did not return an id");
  }
  return id;
}

async function ensureSubscriptions(
  runtime: NexClient,
  jobDefinitionId: string,
  matches: ReadonlyArray<Readonly<Record<string, string>>>,
): Promise<string[]> {
  const subscriptions = await listSubscriptions(runtime, jobDefinitionId);
  const expectedJson = matches.map((match) => JSON.stringify(match));
  for (const row of subscriptions) {
    const matchJson = asString(row.match_json);
    if (!expectedJson.includes(matchJson)) {
      if (matchJson === LEGACY_SHOPIFY_MATCH_JSON && asInteger(row.enabled) === 0) {
        await runtime.events.subscriptions.delete({ id: asString(row.id) });
        continue;
      }
      throw new Error("MoonSleep commerce job has an unexpected event subscription");
    }
  }

  const ids: string[] = [];
  for (const [index, match] of matches.entries()) {
    const matchesForContract = subscriptions.filter(
      (row) =>
        asString(row.event_type) === EVENT_TYPE &&
        asString(row.job_definition_id) === jobDefinitionId &&
        asString(row.match_json) === expectedJson[index],
    );
    if (matchesForContract.length > 1) {
      throw new Error("MoonSleep commerce job has duplicate event subscriptions");
    }
    const existing = matchesForContract[0];
    if (existing) {
      const id = asString(existing.id);
      if (asInteger(existing.enabled) !== 0) {
        const updated = unwrapPayload(
          await runtime.events.subscriptions.update({ id, match, enabled: false }),
        );
        ids.push(asString(asRecord(updated.subscription).id) || id);
      } else {
        ids.push(id);
      }
      continue;
    }
    const created = unwrapPayload(
      await runtime.events.subscriptions.create({
        job_definition_id: jobDefinitionId,
        event_type: EVENT_TYPE,
        match,
        enabled: false,
      }),
    );
    const id = asString(asRecord(created.subscription).id);
    if (!id) {
      throw new Error("MoonSleep commerce subscription creation did not return an id");
    }
    ids.push(id);
  }
  return ids;
}

export async function ensureMoonSleepCommerceRuntimeWork(params: {
  runtime: NexClient;
  appId: string;
}): Promise<{
  jobDefinitionId: string;
  subscriptionIds: string[];
  commerceJobDefinitionId: string;
  commerceSubscriptionIds: string[];
}> {
  const jobDefinitionId = await ensureJob(params.runtime, params.appId, JOB_SPECS[0]!);
  const subscriptionIds = await ensureSubscriptions(
    params.runtime,
    jobDefinitionId,
    JOB_SPECS[0]!.matches,
  );
  const commerceJobDefinitionId = await ensureJob(params.runtime, params.appId, JOB_SPECS[1]!);
  const commerceSubscriptionIds = await ensureSubscriptions(
    params.runtime,
    commerceJobDefinitionId,
    JOB_SPECS[1]!.matches,
  );
  return {
    jobDefinitionId,
    subscriptionIds,
    commerceJobDefinitionId,
    commerceSubscriptionIds,
  };
}

export async function disableMoonSleepCommerceRuntimeWork(runtime: NexClient): Promise<void> {
  const jobs = await listJobs(runtime);
  for (const spec of JOB_SPECS) {
    const job = jobs.find((row) => asString(row.name) === spec.name);
    if (!job) {
      continue;
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
}

export async function removeMoonSleepCommerceRuntimeWork(runtime: NexClient): Promise<void> {
  const jobs = await listJobs(runtime);
  for (const spec of JOB_SPECS) {
    const job = jobs.find((row) => asString(row.name) === spec.name);
    if (!job) {
      continue;
    }
    const jobId = asString(job.id);
    for (const subscription of await listSubscriptions(runtime, jobId)) {
      await runtime.events.subscriptions.delete({ id: asString(subscription.id) });
    }
    await runtime.jobs.delete({ id: jobId });
  }
}
