import type { NexAppMethodHandler } from "../../../../../nex/src/runtime/domains/apps/context.js";
import {
  buildShopifyCustomerObservation,
  projectShopifyCustomerIdentity,
} from "../jobs/shopify-customer-identity.js";

type RuntimeRow = Record<string, unknown>;

const MAX_COHORT_RECORDS = 50;

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
  if (!Array.isArray(params.record_ids)) {
    throw new Error("record_ids must be an array");
  }
  if (params.record_ids.length < 1 || params.record_ids.length > MAX_COHORT_RECORDS) {
    throw new Error(`record_ids must contain between 1 and ${MAX_COHORT_RECORDS} entries`);
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

export default {
  "moonsleep-commerce.healthcheck": healthcheck,
  "moonsleep-commerce.shopify-customers.project-cohort": projectShopifyCustomerCohort,
};
