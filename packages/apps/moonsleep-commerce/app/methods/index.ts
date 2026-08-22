import { createHash } from "node:crypto";
import type { NexAppMethodHandler } from "../../../../../nex/src/runtime/domains/apps/context.js";
import {
  buildShopifyCustomerObservation,
  projectShopifyCustomerIdentity,
} from "../jobs/shopify-customer-identity.js";
import {
  SHOPIFY_SOURCE_SCHEDULES,
  type ShopifySourceFamily,
} from "../jobs/shopify-source-schedules.js";

type RuntimeRow = Record<string, unknown>;

const MAX_COHORT_RECORDS = 50;
const SHOPIFY_SOURCE_IDENTITY_OBSERVED_AT = Date.UTC(2026, 6, 20);
const MOONSLEEP_OPS_ENTITY_ID = "entity_moonsleep_ops";
const SOURCE_JOB_NAMES = Object.freeze({
  "orders.delta": "moonsleep-commerce.shopify-source.orders-delta",
  "customers.delta": "moonsleep-commerce.shopify-source.customers-delta",
  "inventory.hot": "moonsleep-commerce.shopify-source.inventory-hot",
  "inventory.reconcile": "moonsleep-commerce.shopify-source.inventory-reconcile",
  "fulfillment.delta": "moonsleep-commerce.shopify-source.fulfillment-delta",
  "discounts.delta": "moonsleep-commerce.shopify-source.discounts-delta",
  "finance.transactions": "moonsleep-commerce.shopify-source.finance-transactions",
  "disputes.delta": "moonsleep-commerce.shopify-source.disputes-delta",
  "products.delta": "moonsleep-commerce.shopify-source.products-delta",
  "catalog.delta": "moonsleep-commerce.shopify-source.catalog-delta",
  "marketing.delta": "moonsleep-commerce.shopify-source.marketing-delta",
  "payouts.delta": "moonsleep-commerce.shopify-source.payouts-delta",
});
const SOURCE_SCHEDULE_CONFIRMATION = "CONFIGURE_MOONSLEEP_SHOPIFY_SOURCE_SCHEDULES";
const PROJECTION_CONFIRMATION = "CONFIGURE_MOONSLEEP_SHOPIFY_PROJECTIONS";
const PROJECTION_SPECS = Object.freeze({
  customer_identity: {
    job_name: "moonsleep-commerce.shopify-customer-identity",
    matches: [{ platform: "shopify", container_id: "customer" }],
  },
  order_commerce: {
    job_name: "moonsleep-commerce.shopify-order-commerce",
    matches: [
      { platform: "shopify", container_id: "order" },
      { platform: "shopify", container_id: "line_item" },
    ],
  },
});
const SOURCE_REQUEST_ID_RE = /^[a-zA-Z0-9._:-]{1,128}$/;
const SOURCE_CONNECTION_ID_RE = /^[a-zA-Z0-9._-]{1,128}$/;
const PROJECTION_WORK_ID_RE = /^channelprojection_[0-9a-f]{32}$/;
const OBSERVATION_RECEIPT_ID_RE = /^channelobs_[0-9a-f]{32}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const OBSERVATION_STREAM_FAMILIES = Object.freeze({
  "orders/paid": "orders.delta",
  "orders/updated": "orders.delta",
  "orders/cancelled": "orders.delta",
  "customers/created": "customers.delta",
  "customers/updated": "customers.delta",
});

type ShopifySourceIdentityObservation = {
  role: "store" | "integration";
  platform: "shopify";
  space_id: string;
  contact_id: string;
  source_observation_id: string;
  observed_at: number;
  contact_name: string;
  entity_name: string;
  entity_type: "store" | "integration";
  tags: string[];
};
function asRecord(value: unknown): RuntimeRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RuntimeRow) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requireExactObservationString(
  row: RuntimeRow,
  field: string,
  maximum = 512,
): string {
  const value = asString(row[field]);
  if (!value || row[field] !== value || Buffer.byteLength(value, "utf8") > maximum) {
    throw new Error(`observation.${field} must be a trimmed non-empty string`);
  }
  return value;
}

function requireShopifyObservation(value: unknown, family: string): RuntimeRow | null {
  if (value === undefined) return null;
  const observation = asRecord(value);
  if (Object.keys(observation).length === 0) {
    throw new Error("observation must be an object");
  }
  const projectionWorkId = requireExactObservationString(
    observation,
    "projection_work_id",
    50,
  );
  const observationReceiptId = requireExactObservationString(
    observation,
    "observation_receipt_id",
    43,
  );
  if (!PROJECTION_WORK_ID_RE.test(projectionWorkId)) {
    throw new Error("observation.projection_work_id is malformed");
  }
  if (!OBSERVATION_RECEIPT_ID_RE.test(observationReceiptId)) {
    throw new Error("observation.observation_receipt_id is malformed");
  }
  if (requireExactObservationString(observation, "projection_target", 16) !== "nex") {
    throw new Error("observation.projection_target must be nex");
  }
  if (requireExactObservationString(observation, "source_system", 16) !== "shopify") {
    throw new Error("observation.source_system must be shopify");
  }
  if (requireExactObservationString(observation, "source_account_ref", 64) !== "moonsleep") {
    throw new Error("observation.source_account_ref must be moonsleep");
  }
  const sourceStream = requireExactObservationString(observation, "source_stream", 64);
  if (
    OBSERVATION_STREAM_FAMILIES[
      sourceStream as keyof typeof OBSERVATION_STREAM_FAMILIES
    ] !== family
  ) {
    throw new Error("observation.source_stream does not match family");
  }
  requireExactObservationString(observation, "external_receipt_id");
  requireExactObservationString(observation, "semantic_revision_id");
  if (
    requireExactObservationString(observation, "verification_issuer", 64) !==
    "shopify-hmac-sha256"
  ) {
    throw new Error("observation.verification_issuer must be shopify-hmac-sha256");
  }
  for (const field of [
    "raw_body_sha256",
    "verification_receipt_sha256",
    "observation_sha256",
    "immutable_facts_sha256",
  ]) {
    if (!SHA256_RE.test(requireExactObservationString(observation, field, 64))) {
      throw new Error(`observation.${field} must be a lowercase SHA-256 digest`);
    }
  }
  if (Object.keys(asRecord(observation.immutable_facts)).length === 0) {
    throw new Error("observation.immutable_facts must be a non-empty object");
  }
  return observation;
}

function unwrapPayload(value: unknown): RuntimeRow {
  const row = asRecord(value);
  if (row.ok === false) {
    const error = asRecord(row.error);
    throw new Error(asString(error.message) || "Nex operation failed");
  }
  const payload = asRecord(row.payload);
  return Object.keys(payload).length > 0 ? payload : row;
}

function requireCohortRecordIds(params: RuntimeRow): string[] {
  return requireRecordIds(params, MAX_COHORT_RECORDS, false);
}

function requireRecordIds(params: RuntimeRow, maximum: number, requireSorted: boolean): string[] {
  if (!Array.isArray(params.record_ids)) {
    throw new Error("record_ids must be an array");
  }
  if (params.record_ids.length < 1 || params.record_ids.length > maximum) {
    throw new Error(`record_ids must contain between 1 and ${maximum} entries`);
  }
  const ids = params.record_ids.map((value, index) => {
    const id = asString(value);
    if (!id || Buffer.byteLength(id, "utf8") > 512 || value !== id) {
      throw new Error(
        `record_ids[${index}] must be a trimmed non-empty string of at most 512 bytes`,
      );
    }
    return id;
  });
  if (new Set(ids).size !== ids.length) {
    throw new Error("record_ids must be unique");
  }
  if (requireSorted && ids.some((id, index) => index > 0 && ids[index - 1]! >= id)) {
    throw new Error("record_ids must be strictly sorted in ascending lexical order");
  }
  return ids;
}

function requireShopDomain(value: unknown): string {
  const domain = asString(value);
  if (
    value !== domain ||
    domain.length > 255 ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/.test(domain)
  ) {
    throw new Error("shop_domain must be an exact lowercase *.myshopify.com domain");
  }
  return domain;
}

function requireConnectionId(value: unknown): string {
  const connectionId = asString(value);
  if (value !== connectionId || !/^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/.test(connectionId)) {
    throw new Error("connection_id must be an exact lowercase Nex connection identifier");
  }
  return connectionId;
}

export function buildShopifySourceIdentityObservations(
  params: RuntimeRow,
): ShopifySourceIdentityObservation[] {
  const shopDomain = requireShopDomain(params.shop_domain);
  const connectionId = requireConnectionId(params.connection_id);
  return [
    {
      role: "store",
      platform: "shopify",
      space_id: shopDomain,
      contact_id: shopDomain,
      source_observation_id: `moonsleep-commerce:shopify-source:store:v1:${shopDomain}`,
      observed_at: SHOPIFY_SOURCE_IDENTITY_OBSERVED_AT,
      contact_name: "MoonSleep Shopify Store",
      entity_name: "MoonSleep Shopify Store",
      entity_type: "store",
      tags: ["MoonSleep", "Shopify", "Store"],
    },
    {
      role: "integration",
      platform: "shopify",
      space_id: shopDomain,
      contact_id: connectionId,
      source_observation_id: `moonsleep-commerce:shopify-source:integration:v2:${shopDomain}:${connectionId}`,
      observed_at: SHOPIFY_SOURCE_IDENTITY_OBSERVED_AT,
      contact_name: "MoonSleep Shopify Integration",
      entity_name: "MoonSleep Shopify Integration",
      entity_type: "integration",
      tags: ["Integration", "MoonSleep", "Shopify"],
    },
  ];
}

function shopifySourceIdentityContractSha256(
  observations: readonly ShopifySourceIdentityObservation[],
): string {
  return createHash("sha256").update(JSON.stringify(observations), "utf8").digest("hex");
}

async function ensureShopifyReceiverGrounding(params: {
  client: {
    contacts: {
      resolve: (input: RuntimeRow) => Promise<unknown>;
      create: (input: RuntimeRow) => Promise<unknown>;
      update: (input: RuntimeRow) => Promise<unknown>;
    };
    entities: {
      get: (input: { id: string }) => Promise<unknown>;
      resolve: (input: { entity_id: string }) => Promise<unknown>;
    };
  };
  connectionId: string;
}): Promise<RuntimeRow> {
  const resolution = unwrapPayload(
    await params.client.entities.resolve({ entity_id: MOONSLEEP_OPS_ENTITY_ID }),
  );
  if (asString(resolution.canonical_id) !== MOONSLEEP_OPS_ENTITY_ID) {
    throw new Error("MoonSleep Ops receiver entity is not canonical");
  }
  const entityResult = unwrapPayload(
    await params.client.entities.get({ id: MOONSLEEP_OPS_ENTITY_ID }),
  );
  const entity = asRecord(entityResult.entity);
  if (
    asString(entity.id) !== MOONSLEEP_OPS_ENTITY_ID ||
    entity.is_agent !== true ||
    entity.deleted_at != null
  ) {
    throw new Error("MoonSleep Ops receiver entity is not active");
  }

  const anchor = {
    platform: "shopify",
    space_id: "",
    contact_id: params.connectionId,
  };
  const before = unwrapPayload(await params.client.contacts.resolve(anchor));
  const beforeContact = asRecord(before.contact);
  let outcome = "unchanged";
  if (before.found !== true) {
    const created = unwrapPayload(
      await params.client.contacts.create({
        entity_id: MOONSLEEP_OPS_ENTITY_ID,
        ...anchor,
        contact_name: "MoonSleep Ops",
        origin: "moonsleep-commerce",
      }),
    );
    if (asString(asRecord(created.contact).id) === "") {
      throw new Error("MoonSleep Ops receiver contact was not created");
    }
    outcome = "created";
  } else if (asString(beforeContact.canonical_entity_id) !== MOONSLEEP_OPS_ENTITY_ID) {
    const contactId = asString(beforeContact.id);
    if (!contactId) {
      throw new Error("Shopify receiver contact is missing its row id");
    }
    const updated = unwrapPayload(
      await params.client.contacts.update({
        id: contactId,
        entity_id: MOONSLEEP_OPS_ENTITY_ID,
        contact_name: "MoonSleep Ops",
      }),
    );
    if (asString(asRecord(updated.contact).id) === "") {
      throw new Error("Shopify receiver contact was not updated");
    }
    outcome = "updated";
  }

  const after = unwrapPayload(await params.client.contacts.resolve(anchor));
  const afterContact = asRecord(after.contact);
  if (
    after.found !== true ||
    asString(afterContact.platform) !== anchor.platform ||
    asString(afterContact.space_id) !== anchor.space_id ||
    asString(afterContact.contact_id) !== anchor.contact_id ||
    asString(afterContact.canonical_entity_id) !== MOONSLEEP_OPS_ENTITY_ID
  ) {
    throw new Error("Shopify receiver contact is not grounded to MoonSleep Ops");
  }
  return {
    outcome,
    platform: anchor.platform,
    space_id: anchor.space_id,
    contact_id: anchor.contact_id,
    canonical_entity_id: MOONSLEEP_OPS_ENTITY_ID,
  };
}

export const seedShopifySourceIdentities: NexAppMethodHandler = async (ctx) => {
  const observations = buildShopifySourceIdentityObservations(ctx.params);
  const connectionId = requireConnectionId(ctx.params.connection_id);
  const identityClient = ctx.nex as unknown as {
    contacts: {
      observe: (input: RuntimeRow) => Promise<unknown>;
      resolve: (input: RuntimeRow) => Promise<unknown>;
      create: (input: RuntimeRow) => Promise<unknown>;
      update: (input: RuntimeRow) => Promise<unknown>;
    };
    entities: {
      get: (input: { id: string }) => Promise<unknown>;
      resolve: (input: { entity_id: string }) => Promise<unknown>;
      tags: { list: (input: { entity_id: string }) => Promise<unknown> };
    };
  };
  const results: RuntimeRow[] = [];

  for (const observation of observations) {
    const { role, ...input } = observation;
    const observed = unwrapPayload(await identityClient.contacts.observe(input));
    const contact = asRecord(observed.contact);
    const entity = asRecord(observed.entity);
    const observedEntityId = asString(entity.id);
    const canonicalEntityId = asString(observed.canonical_entity_id);
    if (
      asString(contact.platform) !== input.platform ||
      asString(contact.space_id) !== input.space_id ||
      asString(contact.contact_id) !== input.contact_id ||
      !observedEntityId ||
      !canonicalEntityId
    ) {
      throw new Error(`Shopify ${role} identity observation returned an unexpected binding`);
    }
    const resolved = unwrapPayload(
      await identityClient.entities.resolve({ entity_id: observedEntityId }),
    );
    if (asString(resolved.canonical_id) !== canonicalEntityId) {
      throw new Error(`Shopify ${role} identity did not resolve to its observed canonical entity`);
    }
    const listed = unwrapPayload(
      await identityClient.entities.tags.list({ entity_id: canonicalEntityId }),
    );
    const tags = Array.isArray(listed.tags)
      ? listed.tags.map(asString).filter(Boolean).toSorted()
      : [];
    if (!input.tags.every((tag) => tags.includes(tag))) {
      throw new Error(`Shopify ${role} identity is missing a required source tag`);
    }
    results.push({
      role,
      contact_id: input.contact_id,
      space_id: input.space_id,
      source_observation_id: input.source_observation_id,
      observed_entity_id: observedEntityId,
      canonical_entity_id: canonicalEntityId,
      created_entity: observed.created_entity === true,
      created_contact: observed.created_contact === true,
      replayed: observed.replayed === true,
    });
  }

  const receiverGrounding = await ensureShopifyReceiverGrounding({
    client: identityClient,
    connectionId,
  });

  return {
    state: "succeeded",
    source_identity_contract_sha256: shopifySourceIdentityContractSha256(observations),
    identities_observed: results.length,
    created_entities: results.filter((row) => row.created_entity === true).length,
    created_contacts: results.filter((row) => row.created_contact === true).length,
    replayed: results.filter((row) => row.replayed === true).length,
    results,
    receiver_grounding: receiverGrounding,
    provider_write_authority: false,
  };
};

const healthcheck: NexAppMethodHandler = async (ctx) => ({
  status: "ok",
  app: {
    id: ctx.app.id,
    version: ctx.app.version,
  },
  projectors: {
    shopify_source_identity: "available_replay_safe_public_operation",
    shopify_customer_identity: "dormant_ready_full_postgres_activation_gates",
    shopify_customer_cohort: "available_bounded_manual_replay",
    shopify_order_commerce: "available_event_projector",
  },
  provider_write_authority: false,
});

export const triggerShopifySource: NexAppMethodHandler = async (ctx) => {
  const family = asString(ctx.params.family) as keyof typeof SOURCE_JOB_NAMES;
  const connectionId = asString(ctx.params.connection_id);
  const jobName = SOURCE_JOB_NAMES[family];
  if (!jobName) {
    throw new Error("family is not an installed Shopify source job");
  }
  if (!SOURCE_CONNECTION_ID_RE.test(connectionId)) {
    throw new Error("connection_id is malformed");
  }
  const observation = requireShopifyObservation(ctx.params.observation, family);
  const projectionWorkId = observation
    ? asString(observation.projection_work_id)
    : "";
  const requestId = asString(ctx.params.request_id) || projectionWorkId;
  if (!SOURCE_REQUEST_ID_RE.test(requestId)) {
    throw new Error("request_id is malformed");
  }
  const listed = unwrapPayload(await ctx.nex.jobs.list({}));
  const jobs = Array.isArray(listed.jobs) ? listed.jobs.map(asRecord) : [];
  const matches = jobs.filter((job) => asString(job.name) === jobName);
  if (matches.length !== 1) {
    throw new Error("Shopify source job is missing or duplicated");
  }
  const job = matches[0]!;
  if (asString(job.status) !== "active") {
    throw new Error("Shopify source job is not active for manual invocation");
  }
  const jobId = asString(job.id);
  if (!jobId) {
    throw new Error("Shopify source job is missing its id");
  }
  const invoked = unwrapPayload(
    await ctx.nex.jobs.invoke({
      job_id: jobId,
      input: {
        family,
        connection_id: connectionId,
        ...(observation ? { observation } : {}),
      },
      trigger_source: observation
        ? "moonsleep-commerce-shopify-observation"
        : "moonsleep-commerce-manual",
      max_attempts: 3,
      idempotency_key: observation
        ? `shopify-observation:${projectionWorkId}`
        : `shopify-source:${family}:${requestId}`,
    }),
  );
  const run = asRecord(invoked.run);
  const runId = asString(run.id);
  if (!runId) {
    throw new Error("Shopify source job invocation did not return a run id");
  }
  return {
    queued: true,
    family,
    connection_id: connectionId,
    request_id: requestId,
    ...(observation
      ? {
          projection_work_id: projectionWorkId,
          observation_receipt_id: asString(observation.observation_receipt_id),
        }
      : {}),
    job_definition_id: jobId,
    run_id: runId,
    provider_write_authority: false,
  };
};

function requireSourceFamilies(value: unknown): ShopifySourceFamily[] {
  if (!Array.isArray(value)) {
    throw new Error("enabled_families must be an array");
  }
  const families = value.map((entry, index) => {
    const family = asString(entry) as ShopifySourceFamily;
    if (entry !== family || !SOURCE_JOB_NAMES[family]) {
      throw new Error(`enabled_families[${index}] is not an installed Shopify source family`);
    }
    return family;
  });
  if (new Set(families).size !== families.length) {
    throw new Error("enabled_families must be unique");
  }
  return [...families].sort();
}

function sourceSchedulePlan(connectionId: string, enabledFamilies: ShopifySourceFamily[]) {
  const enabled = new Set(enabledFamilies);
  const schedules = (Object.keys(SOURCE_JOB_NAMES) as ShopifySourceFamily[])
    .sort()
    .map((family) => ({
      family,
      job_name: SOURCE_JOB_NAMES[family],
      schedule_name: SOURCE_JOB_NAMES[family],
      expression: SHOPIFY_SOURCE_SCHEDULES[family],
      timezone: "UTC",
      enabled: enabled.has(family),
    }));
  const plan = {
    version: 1,
    connection_id: connectionId,
    enabled_families: enabledFamilies,
    schedules,
    provider_write_authority: false,
  };
  return {
    ...plan,
    plan_sha256: createHash("sha256").update(JSON.stringify(plan), "utf8").digest("hex"),
  };
}

export const configureShopifySourceSchedules: NexAppMethodHandler = async (ctx) => {
  const mode = asString(ctx.params.mode);
  if (mode !== "plan" && mode !== "apply") {
    throw new Error("mode must be plan or apply");
  }
  const connectionId = requireConnectionId(ctx.params.connection_id);
  const enabledFamilies = requireSourceFamilies(ctx.params.enabled_families);
  const plan = sourceSchedulePlan(connectionId, enabledFamilies);
  if (mode === "plan") {
    return { state: "planned", ...plan };
  }
  if (asString(ctx.params.expected_plan_sha256) !== plan.plan_sha256) {
    throw new Error("expected_plan_sha256 does not match the exact Shopify source schedule plan");
  }
  if (asString(ctx.params.confirmation) !== SOURCE_SCHEDULE_CONFIRMATION) {
    throw new Error("confirmation does not authorize Shopify source schedule configuration");
  }

  const listedJobs = unwrapPayload(await ctx.nex.jobs.list({}));
  const jobs = Array.isArray(listedJobs.jobs) ? listedJobs.jobs.map(asRecord) : [];
  const listedSchedules = unwrapPayload(await ctx.nex.schedules.list({}));
  const schedules = Array.isArray(listedSchedules.schedules)
    ? listedSchedules.schedules.map(asRecord)
    : [];

  for (const target of plan.schedules) {
    const jobMatches = jobs.filter((job) => asString(job.name) === target.job_name);
    if (jobMatches.length !== 1) {
      throw new Error(`Shopify source job ${target.family} is missing or duplicated`);
    }
    const job = jobMatches[0]!;
    const jobId = asString(job.id);
    if (!jobId || asString(job.status) !== "active") {
      throw new Error(`Shopify source job ${target.family} is not active`);
    }
    const scheduleMatches = schedules.filter(
      (schedule) => asString(schedule.name) === target.schedule_name,
    );
    if (scheduleMatches.length !== 1) {
      throw new Error(`Shopify source schedule ${target.family} is missing or duplicated`);
    }
    const schedule = scheduleMatches[0]!;
    if (asString(schedule.job_definition_id) !== jobId) {
      throw new Error(`Shopify source schedule ${target.family} is bound to another job`);
    }
  }
  const sourceSchedules = plan.schedules.map(
    (target) => schedules.find((schedule) => asString(schedule.name) === target.schedule_name)!,
  );

  try {
    // Disable only this app's exact source schedules first. A failed
    // reconfiguration can leave updated job metadata, but it can never leave a
    // partially activated family set or mutate another package's schedule.
    for (const schedule of sourceSchedules) {
      await ctx.nex.schedules.update({ id: asString(schedule.id), enabled: false });
    }
    for (const target of plan.schedules) {
      const job = jobs.find((entry) => asString(entry.name) === target.job_name)!;
      const schedule = schedules.find((entry) => asString(entry.name) === target.schedule_name)!;
      await ctx.nex.jobs.update({
        id: asString(job.id),
        config_json: JSON.stringify({ family: target.family, connection_id: connectionId }),
      });
      await ctx.nex.schedules.update({
        id: asString(schedule.id),
        expression: target.expression,
        timezone: target.timezone,
        enabled: false,
      });
    }
    for (const target of plan.schedules.filter((entry) => entry.enabled)) {
      const schedule = schedules.find((entry) => asString(entry.name) === target.schedule_name)!;
      await ctx.nex.schedules.update({ id: asString(schedule.id), enabled: true });
    }
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const schedule of sourceSchedules) {
      try {
        await ctx.nex.schedules.update({ id: asString(schedule.id), enabled: false });
      } catch (rollbackError) {
        rollbackErrors.push(
          rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        );
      }
    }
    if (rollbackErrors.length > 0) {
      throw new Error(
        `Shopify source schedule configuration failed and disable rollback failed: ${rollbackErrors.join("; ")}`,
        { cause: error },
      );
    }
    throw error;
  }

  const verifiedJobs = unwrapPayload(await ctx.nex.jobs.list({}));
  const verifiedSchedules = unwrapPayload(await ctx.nex.schedules.list({}));
  const jobRows = Array.isArray(verifiedJobs.jobs) ? verifiedJobs.jobs.map(asRecord) : [];
  const scheduleRows = Array.isArray(verifiedSchedules.schedules)
    ? verifiedSchedules.schedules.map(asRecord)
    : [];
  for (const target of plan.schedules) {
    const job = jobRows.find((entry) => asString(entry.name) === target.job_name);
    const schedule = scheduleRows.find((entry) => asString(entry.name) === target.schedule_name);
    if (
      !job ||
      asString(job.config_json) !==
        JSON.stringify({ family: target.family, connection_id: connectionId }) ||
      !schedule ||
      asString(schedule.expression) !== target.expression ||
      asString(schedule.timezone) !== target.timezone ||
      (schedule.enabled === true || schedule.enabled === 1) !== target.enabled
    ) {
      throw new Error(`Shopify source schedule ${target.family} failed exact readback`);
    }
  }
  return { state: "applied", ...plan };
};

type ShopifyProjection = keyof typeof PROJECTION_SPECS;

function requireProjections(value: unknown): ShopifyProjection[] {
  if (!Array.isArray(value)) {
    throw new Error("enabled_projections must be an array");
  }
  const projections = value.map((entry, index) => {
    const projection = asString(entry) as ShopifyProjection;
    if (entry !== projection || !PROJECTION_SPECS[projection]) {
      throw new Error(`enabled_projections[${index}] is not an installed Shopify projection`);
    }
    return projection;
  });
  if (new Set(projections).size !== projections.length) {
    throw new Error("enabled_projections must be unique");
  }
  return [...projections].sort();
}

function projectionPlan(enabledProjections: ShopifyProjection[]) {
  const enabled = new Set(enabledProjections);
  const projections = (Object.keys(PROJECTION_SPECS) as ShopifyProjection[])
    .sort()
    .map((projection) => ({
      projection,
      job_name: PROJECTION_SPECS[projection].job_name,
      matches: PROJECTION_SPECS[projection].matches,
      enabled: enabled.has(projection),
    }));
  const plan = {
    version: 1,
    enabled_projections: enabledProjections,
    projections,
    provider_read_authority: false,
    provider_write_authority: false,
  };
  return {
    ...plan,
    plan_sha256: createHash("sha256").update(JSON.stringify(plan), "utf8").digest("hex"),
  };
}

export const configureShopifyProjections: NexAppMethodHandler = async (ctx) => {
  const mode = asString(ctx.params.mode);
  if (mode !== "plan" && mode !== "apply") {
    throw new Error("mode must be plan or apply");
  }
  const enabledProjections = requireProjections(ctx.params.enabled_projections);
  const plan = projectionPlan(enabledProjections);
  if (mode === "plan") {
    return { state: "planned", ...plan };
  }
  if (asString(ctx.params.expected_plan_sha256) !== plan.plan_sha256) {
    throw new Error("expected_plan_sha256 does not match the exact Shopify projection plan");
  }
  if (asString(ctx.params.confirmation) !== PROJECTION_CONFIRMATION) {
    throw new Error("confirmation does not authorize Shopify projection configuration");
  }

  const listedJobs = unwrapPayload(await ctx.nex.jobs.list({}));
  const jobs = Array.isArray(listedJobs.jobs) ? listedJobs.jobs.map(asRecord) : [];
  const bound: Array<{
    projection: ShopifyProjection;
    job: RuntimeRow;
    subscriptions: RuntimeRow[];
  }> = [];
  for (const target of plan.projections) {
    const jobMatches = jobs.filter((job) => asString(job.name) === target.job_name);
    if (jobMatches.length !== 1) {
      throw new Error(`Shopify projection ${target.projection} job is missing or duplicated`);
    }
    const job = jobMatches[0]!;
    const jobId = asString(job.id);
    if (!jobId) {
      throw new Error(`Shopify projection ${target.projection} job is missing its id`);
    }
    const listedSubscriptions = unwrapPayload(
      await ctx.nex.events.subscriptions.list({
        event_type: "record.ingested",
        job_definition_id: jobId,
      }),
    );
    const subscriptions = Array.isArray(listedSubscriptions.subscriptions)
      ? listedSubscriptions.subscriptions.map(asRecord)
      : [];
    const expectedMatches = target.matches.map((match) => JSON.stringify(match)).sort();
    const actualMatches = subscriptions.map((row) => asString(row.match_json)).sort();
    if (
      subscriptions.length !== expectedMatches.length ||
      actualMatches.some((value, index) => value !== expectedMatches[index])
    ) {
      throw new Error(`Shopify projection ${target.projection} subscription contract drifted`);
    }
    bound.push({ projection: target.projection, job, subscriptions });
  }

  try {
    for (const target of bound) {
      for (const subscription of target.subscriptions) {
        await ctx.nex.events.subscriptions.update({
          id: asString(subscription.id),
          enabled: false,
        });
      }
      await ctx.nex.jobs.update({ id: asString(target.job.id), status: "inactive" });
    }
    for (const target of bound.filter((entry) => enabledProjections.includes(entry.projection))) {
      await ctx.nex.jobs.update({ id: asString(target.job.id), status: "active" });
      for (const subscription of target.subscriptions) {
        await ctx.nex.events.subscriptions.update({
          id: asString(subscription.id),
          enabled: true,
        });
      }
    }
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const target of bound) {
      for (const subscription of target.subscriptions) {
        try {
          await ctx.nex.events.subscriptions.update({
            id: asString(subscription.id),
            enabled: false,
          });
        } catch (rollbackError) {
          rollbackErrors.push(
            rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          );
        }
      }
      try {
        await ctx.nex.jobs.update({ id: asString(target.job.id), status: "inactive" });
      } catch (rollbackError) {
        rollbackErrors.push(
          rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        );
      }
    }
    if (rollbackErrors.length > 0) {
      throw new Error(
        `Shopify projection configuration failed and disable rollback failed: ${rollbackErrors.join("; ")}`,
        { cause: error },
      );
    }
    throw error;
  }

  const verifiedJobs = unwrapPayload(await ctx.nex.jobs.list({}));
  const jobRows = Array.isArray(verifiedJobs.jobs) ? verifiedJobs.jobs.map(asRecord) : [];
  for (const target of plan.projections) {
    const enabled = target.enabled;
    const job = jobRows.find((row) => asString(row.name) === target.job_name);
    if (!job || (asString(job.status) === "active") !== enabled) {
      throw new Error(`Shopify projection ${target.projection} job failed exact readback`);
    }
    const listedSubscriptions = unwrapPayload(
      await ctx.nex.events.subscriptions.list({
        event_type: "record.ingested",
        job_definition_id: asString(job.id),
      }),
    );
    const subscriptions = Array.isArray(listedSubscriptions.subscriptions)
      ? listedSubscriptions.subscriptions.map(asRecord)
      : [];
    if (
      subscriptions.length !== target.matches.length ||
      subscriptions.some(
        (subscription) => (subscription.enabled === true || subscription.enabled === 1) !== enabled,
      )
    ) {
      throw new Error(
        `Shopify projection ${target.projection} subscriptions failed exact readback`,
      );
    }
  }
  return { state: "applied", ...plan };
};

export const projectShopifyCustomerCohort: NexAppMethodHandler = async (ctx) => {
  const recordIds = requireCohortRecordIds(ctx.params);

  // Validate the entire requested cohort before the first identity observation.
  // The observation itself is replay-safe, so a retry after a downstream failure
  // cannot create a second entity, contact, or observation for the same record.
  const records: Array<{ id: string; record: RuntimeRow }> = [];
  for (const id of recordIds) {
    const response = unwrapPayload(await ctx.nex.records.get({ id }));
    const record = asRecord(response.record);
    buildShopifyCustomerObservation(record, { allowLegacyText: true });
    records.push({ id, record });
  }

  const results: RuntimeRow[] = [];
  const identityClient = ctx.nex as unknown as Parameters<typeof projectShopifyCustomerIdentity>[0];
  for (const entry of records) {
    const projected = await projectShopifyCustomerIdentity(identityClient, entry.record, {
      allowLegacyText: true,
    });
    results.push({ record_id: entry.id, ...projected });
  }

  return {
    state: "succeeded",
    records_requested: recordIds.length,
    records_projected: results.length,
    created_entities: results.filter((row) => row.created_entity === true).length,
    created_contacts: results.filter((row) => row.created_contact === true).length,
    replayed: results.filter((row) => row.replayed === true).length,
    results,
    provider_write_authority: false,
  };
};

export default {
  "moonsleep-commerce.healthcheck": healthcheck,
  "moonsleep-commerce.shopify-source.seed-identities": seedShopifySourceIdentities,
  "moonsleep-commerce.shopify-source.trigger": triggerShopifySource,
  "moonsleep-commerce.shopify-source.configure-schedules": configureShopifySourceSchedules,
  "moonsleep-commerce.shopify-projections.configure": configureShopifyProjections,
  "moonsleep-commerce.shopify-customers.project-cohort": projectShopifyCustomerCohort,
};
