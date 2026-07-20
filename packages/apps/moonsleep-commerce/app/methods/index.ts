import { createHash } from "node:crypto";
import type { NexAppMethodHandler } from "../../../../../nex/src/runtime/domains/apps/context.js";
import {
  buildShopifyCustomerObservation,
  projectShopifyCustomerIdentity,
} from "../jobs/shopify-customer-identity.js";

type RuntimeRow = Record<string, unknown>;

const MAX_COHORT_RECORDS = 50;
const MAX_BACKFILL_RECORDS = 20_000;

function asRecord(value: unknown): RuntimeRow {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RuntimeRow)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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
      throw new Error(`record_ids[${index}] must be a trimmed non-empty string of at most 512 bytes`);
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

export function shopifyCustomerRecordSetSha256(recordIds: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify(recordIds), "utf8").digest("hex");
}

function requireBackfillRecordIds(params: RuntimeRow): string[] {
  const ids = requireRecordIds(params, MAX_BACKFILL_RECORDS, true);
  const expectedSha256 = asString(params.record_set_sha256);
  if (!/^[0-9a-f]{64}$/.test(expectedSha256)) {
    throw new Error("record_set_sha256 must be a lowercase SHA-256 digest");
  }
  if (shopifyCustomerRecordSetSha256(ids) !== expectedSha256) {
    throw new Error("record_set_sha256 does not match the exact ordered record_ids");
  }
  return ids;
}

const healthcheck: NexAppMethodHandler = async (ctx) => ({
  status: "ok",
  app: {
    id: ctx.app.id,
    version: ctx.app.version,
  },
  projectors: {
    shopify_customer_identity: "dormant_pending_event_handoff",
    shopify_customer_cohort: "available_bounded_manual_replay",
    shopify_customer_backfill: "available_explicit_manual_replay",
    shopify_order_commerce: "not_implemented",
  },
  provider_write_authority: false,
});

export const projectShopifyCustomerCohort: NexAppMethodHandler = async (ctx) => {
  const recordIds = requireCohortRecordIds(ctx.params);

  // Validate the entire requested cohort before the first identity observation.
  // The observation itself is replay-safe, so a retry after a downstream failure
  // cannot create a second entity, contact, or observation for the same record.
  const records: Array<{ id: string; record: RuntimeRow }> = [];
  for (const id of recordIds) {
    const response = unwrapPayload(await ctx.nex.records.get({ id }));
    const record = asRecord(response.record);
    buildShopifyCustomerObservation(record);
    records.push({ id, record });
  }

  const results: RuntimeRow[] = [];
  const identityClient = ctx.nex as unknown as Parameters<typeof projectShopifyCustomerIdentity>[0];
  for (const entry of records) {
    const projected = await projectShopifyCustomerIdentity(identityClient, entry.record);
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

export const projectShopifyCustomerBackfill: NexAppMethodHandler = async (ctx) => {
  const recordIds = requireBackfillRecordIds(ctx.params);

  // The complete explicit record set is fetched and validated before the first
  // identity observation. A mid-apply retry is safe because contacts.observe is
  // bound to the immutable Shopify source observation ID.
  const records: Array<{ id: string; record: RuntimeRow }> = [];
  for (const id of recordIds) {
    const response = unwrapPayload(await ctx.nex.records.get({ id }));
    const record = asRecord(response.record);
    buildShopifyCustomerObservation(record);
    records.push({ id, record });
  }

  let createdEntities = 0;
  let createdContacts = 0;
  let replayed = 0;
  const resultHash = createHash("sha256");
  const identityClient = ctx.nex as unknown as Parameters<typeof projectShopifyCustomerIdentity>[0];
  for (const entry of records) {
    const projected = await projectShopifyCustomerIdentity(identityClient, entry.record);
    createdEntities += projected.created_entity === true ? 1 : 0;
    createdContacts += projected.created_contact === true ? 1 : 0;
    replayed += projected.replayed === true ? 1 : 0;
    resultHash.update(
      [
        entry.id,
        asString(projected.source_observation_id),
        asString(projected.contact_id),
        asString(projected.canonical_entity_id),
      ].join("\u0000") + "\n",
      "utf8",
    );
  }

  return {
    state: "succeeded",
    records_requested: recordIds.length,
    records_projected: records.length,
    record_set_sha256: shopifyCustomerRecordSetSha256(recordIds),
    projection_result_sha256: resultHash.digest("hex"),
    first_record_id: recordIds[0],
    last_record_id: recordIds.at(-1),
    created_entities: createdEntities,
    created_contacts: createdContacts,
    replayed,
    provider_write_authority: false,
  };
};

export default {
  "moonsleep-commerce.healthcheck": healthcheck,
  "moonsleep-commerce.shopify-customers.project-cohort": projectShopifyCustomerCohort,
  "moonsleep-commerce.shopify-customers.project-backfill": projectShopifyCustomerBackfill,
};
