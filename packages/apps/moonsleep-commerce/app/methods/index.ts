import { createHash } from "node:crypto";
import type { NexAppMethodHandler } from "../../../../../nex/src/runtime/domains/apps/context.js";
import {
  buildShopifyCustomerObservation,
  projectShopifyCustomerIdentity,
} from "../jobs/shopify-customer-identity.js";
import {
  parseShopifyLineItemRecord,
  parseShopifyOrderRecord,
  projectParsedShopifyLineItem,
  projectParsedShopifyOrder,
  type ParsedShopifyCommerceRecord,
  type ShopifyCommerceClient,
} from "../jobs/shopify-order-commerce.js";
import {
  SHOPIFY_SOURCE_SCHEDULES,
  type ShopifySourceFamily,
} from "../jobs/shopify-source-schedules.js";
import { shopifyRecordSourceMetadata } from "../jobs/shopify-record-family.js";

type RuntimeRow = Record<string, unknown>;

const MAX_COHORT_RECORDS = 50;
const MAX_BACKFILL_BATCH_RECORDS = 250;
const MAX_COMMERCE_BATCH_RECORDS = 50;
const MAX_INSPECTED_CUSTOMER_RECORDS = 20_000;
const MAX_INSPECTED_COMMERCE_RECORDS = 40_000;
const RECORD_SCAN_PAGE_SIZE = 100;
const MAX_RECORDS_SCANNED = 100_000;
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

function asNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
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

export function shopifyCustomerRecordSetSha256(recordIds: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify(recordIds), "utf8").digest("hex");
}

export const shopifyCommerceRecordSetSha256 = shopifyCustomerRecordSetSha256;

function requireBackfillRecordIds(params: RuntimeRow): string[] {
  const ids = requireRecordIds(params, MAX_BACKFILL_BATCH_RECORDS, true);
  const expectedSha256 = asString(params.record_set_sha256);
  if (!/^[0-9a-f]{64}$/.test(expectedSha256)) {
    throw new Error("record_set_sha256 must be a lowercase SHA-256 digest");
  }
  if (shopifyCustomerRecordSetSha256(ids) !== expectedSha256) {
    throw new Error("record_set_sha256 does not match the exact ordered record_ids");
  }
  return ids;
}

function requireCommerceRecordIds(params: RuntimeRow): string[] {
  // Commerce manifests are dependency-ordered, not globally lexical: every
  // order Record precedes its line-item Records. The exact ordered set remains
  // hash-bound and unique.
  const ids = requireRecordIds(params, MAX_COMMERCE_BATCH_RECORDS, false);
  const expectedSha256 = asString(params.record_set_sha256);
  if (!/^[0-9a-f]{64}$/.test(expectedSha256)) {
    throw new Error("record_set_sha256 must be a lowercase SHA-256 digest");
  }
  if (shopifyCommerceRecordSetSha256(ids) !== expectedSha256) {
    throw new Error("record_set_sha256 does not match the exact ordered record_ids");
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

type HistoricalSourceContract = "legacy_current_prefix" | "legacy_double_prefix";

function requireSourceContract(value: unknown): "canonical" | HistoricalSourceContract {
  const sourceContract = value === undefined ? "canonical" : asString(value);
  if (
    sourceContract !== "canonical" &&
    sourceContract !== "legacy_current_prefix" &&
    sourceContract !== "legacy_double_prefix"
  ) {
    throw new Error("source_contract must name an exact supported Shopify Record contract");
  }
  return sourceContract;
}

function requirePageLimit(value: unknown): number {
  if (value === undefined) return RECORD_SCAN_PAGE_SIZE - 1;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 99) {
    throw new Error("limit must be an integer between 1 and 99");
  }
  return value;
}

async function scanLegacyShopifyFamilyPage(params: {
  nex: unknown;
  shopDomain: string;
  connectionId: string;
  family: "customer" | "order" | "line_item";
  sourceContract: HistoricalSourceContract;
  limit: number;
  cursor: { providerRecordId?: unknown; sourceTimestamp?: unknown; id?: unknown };
}): Promise<{
  recordIds: string[];
  nextProviderRecordId: string | null;
  nextSourceTimestamp: number | null;
  nextId: string | null;
  complete: boolean;
}> {
  const cursorValues = [
    params.cursor.providerRecordId,
    params.cursor.sourceTimestamp,
    params.cursor.id,
  ];
  const cursorPresent = cursorValues.map((value) => value !== undefined);
  if (cursorPresent.some(Boolean) && !cursorPresent.every(Boolean)) {
    throw new Error("legacy provider cursor requires all three exact cursor fields");
  }
  const afterProviderRecordId = cursorPresent[0] ? asString(params.cursor.providerRecordId) : "";
  const afterSourceTimestamp = cursorPresent[0]
    ? asNonNegativeInteger(params.cursor.sourceTimestamp)
    : 0;
  const afterId = cursorPresent[0] ? asString(params.cursor.id) : "";
  if (cursorPresent[0] && (!afterProviderRecordId || afterSourceTimestamp == null || !afterId)) {
    throw new Error("legacy provider cursor is invalid");
  }
  const providerAccountRef =
    params.sourceContract === "legacy_current_prefix" ? params.connectionId : params.shopDomain;
  const providerRecordIdPrefix =
    params.sourceContract === "legacy_current_prefix"
      ? `shopify:${params.connectionId}:${params.family}:`
      : `shopify:shopify:${params.connectionId}:${params.family}:`;
  const recordsClient = (
    params.nex as {
      records: {
        scan: (input: Record<string, unknown>) => Promise<unknown>;
      };
    }
  ).records;
  const scanInput: Record<string, unknown> = {
    after_scan_sequence: 0,
    platform: "shopify",
    connection_id: params.connectionId,
    source_record_type: "text",
    provider_account_ref: providerAccountRef,
    provider_record_id_prefix: providerRecordIdPrefix,
    limit: params.limit + 1,
  };
  if (cursorPresent[0]) {
    scanInput.after_provider_record_id = afterProviderRecordId;
    scanInput.after_source_timestamp = afterSourceTimestamp;
    scanInput.after_id = afterId;
  }
  const response = unwrapPayload(await recordsClient.scan(scanInput));
  if (!Array.isArray(response.records)) {
    throw new Error("records.scan did not return a records array");
  }
  const scannedRows = response.records.map(asRecord);
  const rows = scannedRows.slice(0, params.limit);
  const recordIds = rows.map((record) => {
    if (asString(record.source_space_id) !== params.shopDomain) {
      throw new Error("Legacy Shopify scan returned a foreign shop record");
    }
    if (params.family === "customer") {
      buildShopifyCustomerObservation(record, { allowLegacyText: true });
    } else if (params.family === "order") {
      parseShopifyOrderRecord(record, { allowLegacyText: true });
    } else {
      parseShopifyLineItemRecord(record, { allowLegacyText: true });
    }
    const id = asString(record.id);
    if (!id || Buffer.byteLength(id, "utf8") > 512) {
      throw new Error("Legacy Shopify scan returned an invalid record id");
    }
    return id;
  });
  if (new Set(recordIds).size !== recordIds.length) {
    throw new Error("Legacy Shopify scan returned duplicate record ids");
  }
  const lastRow = rows.at(-1);
  const nextProviderRecordId = lastRow ? asString(lastRow.provider_record_id) : null;
  const nextSourceTimestamp = lastRow ? asNonNegativeInteger(lastRow.timestamp) : null;
  const nextId = lastRow ? asString(lastRow.id) : null;
  if (rows.length > 0 && (!nextProviderRecordId || nextSourceTimestamp == null || !nextId)) {
    throw new Error("records.scan returned an invalid provider cursor");
  }
  return {
    recordIds,
    nextProviderRecordId,
    nextSourceTimestamp,
    nextId,
    complete: scannedRows.length <= params.limit,
  };
}

async function discoverShopifyCustomerRecordIds(params: {
  nex: unknown;
  shopDomain: string;
  connectionId: string;
}): Promise<{ recordIds: string[]; nextScanSequence: number }> {
  const recordsClient = (
    params.nex as {
      records: {
        scan: (input: {
          after_scan_sequence: number;
          platform: "shopify";
          connection_id: string;
          source_record_type: "shopify.customer";
          limit: number;
        }) => Promise<unknown>;
      };
    }
  ).records;
  const customerIds: string[] = [];
  let scanned = 0;
  let afterScanSequence = 0;

  while (scanned < MAX_RECORDS_SCANNED) {
    const response = unwrapPayload(
      await recordsClient.scan({
        after_scan_sequence: afterScanSequence,
        platform: "shopify",
        connection_id: params.connectionId,
        source_record_type: "shopify.customer",
        limit: RECORD_SCAN_PAGE_SIZE,
      }),
    );
    if (!Array.isArray(response.records)) {
      throw new Error("records.scan did not return a records array");
    }
    const rows = response.records.map(asRecord);
    const nextScanSequence = asNonNegativeInteger(response.next_scan_sequence);
    if (nextScanSequence == null || nextScanSequence < afterScanSequence) {
      throw new Error("records.scan returned an invalid next_scan_sequence");
    }
    scanned += rows.length;
    if (scanned > MAX_RECORDS_SCANNED) {
      throw new Error(`Shopify record scan exceeds ${MAX_RECORDS_SCANNED} rows`);
    }
    for (const record of rows) {
      if (asString(record.source_record_type) !== "shopify.customer") {
        throw new Error("Shopify customer scan returned a foreign source Record type");
      }
      const metadata = shopifyRecordSourceMetadata(record);
      if (asString(metadata.family) !== "customer") {
        throw new Error("Shopify customer scan returned a foreign family record");
      }
      if (asString(record.platform) !== "shopify") {
        throw new Error("Shopify customer scan returned a foreign platform record");
      }
      if (asString(record.source_space_id) !== params.shopDomain) {
        throw new Error("Shopify customer scan returned a foreign shop record");
      }
      buildShopifyCustomerObservation(record);
      const id = asString(record.id);
      if (!id || Buffer.byteLength(id, "utf8") > 512) {
        throw new Error("Shopify customer scan returned an invalid record id");
      }
      customerIds.push(id);
    }
    if (rows.length === 0 || rows.length < RECORD_SCAN_PAGE_SIZE) {
      afterScanSequence = nextScanSequence;
      break;
    }
    if (nextScanSequence <= afterScanSequence) {
      throw new Error("records.scan cursor did not advance");
    }
    afterScanSequence = nextScanSequence;
    if (scanned >= MAX_RECORDS_SCANNED) {
      throw new Error(`Shopify record scan reached the ${MAX_RECORDS_SCANNED}-row guard`);
    }
  }

  customerIds.sort((left, right) => left.localeCompare(right));
  if (customerIds.length < 1 || customerIds.length > MAX_INSPECTED_CUSTOMER_RECORDS) {
    throw new Error(
      `Shopify customer record set must contain between 1 and ${MAX_INSPECTED_CUSTOMER_RECORDS} records`,
    );
  }
  if (new Set(customerIds).size !== customerIds.length) {
    throw new Error("Shopify customer record scan returned duplicate record ids");
  }
  return { recordIds: customerIds, nextScanSequence: afterScanSequence };
}

async function scanShopifyCommerceFamily(params: {
  recordsClient: {
    scan(input: {
      after_scan_sequence: number;
      platform: "shopify";
      connection_id: string;
      source_record_type: "shopify.order" | "shopify.line_item";
      limit: number;
    }): Promise<unknown>;
  };
  shopDomain: string;
  connectionId: string;
  family: "order" | "line_item";
  remainingScanBudget: number;
}): Promise<{ recordIds: string[]; nextScanSequence: number; scanned: number }> {
  const sourceRecordType = `shopify.${params.family}` as const;
  const recordIds: string[] = [];
  let afterScanSequence = 0;
  let scanned = 0;
  while (scanned < params.remainingScanBudget) {
    const response = unwrapPayload(
      await params.recordsClient.scan({
        after_scan_sequence: afterScanSequence,
        platform: "shopify",
        connection_id: params.connectionId,
        source_record_type: sourceRecordType,
        limit: RECORD_SCAN_PAGE_SIZE,
      }),
    );
    if (!Array.isArray(response.records)) {
      throw new Error("records.scan did not return a records array");
    }
    const rows = response.records.map(asRecord);
    const nextScanSequence = asNonNegativeInteger(response.next_scan_sequence);
    if (nextScanSequence == null || nextScanSequence < afterScanSequence) {
      throw new Error("records.scan returned an invalid next_scan_sequence");
    }
    scanned += rows.length;
    if (scanned > params.remainingScanBudget) {
      throw new Error(`Shopify record scan exceeds ${MAX_RECORDS_SCANNED} rows`);
    }
    for (const record of rows) {
      if (asString(record.source_record_type) !== sourceRecordType) {
        throw new Error("Shopify commerce scan returned a foreign source Record type");
      }
      if (asString(shopifyRecordSourceMetadata(record).family) !== params.family) {
        throw new Error("Shopify commerce scan returned a foreign family record");
      }
      if (asString(record.platform) !== "shopify") {
        throw new Error("Shopify commerce scan returned a foreign platform record");
      }
      if (asString(record.source_space_id) !== params.shopDomain) {
        throw new Error("Shopify commerce scan returned a foreign shop record");
      }
      if (params.family === "order") {
        parseShopifyOrderRecord(record);
      } else {
        parseShopifyLineItemRecord(record);
      }
      const id = asString(record.id);
      if (!id || Buffer.byteLength(id, "utf8") > 512) {
        throw new Error("Shopify commerce scan returned an invalid record id");
      }
      recordIds.push(id);
    }
    if (rows.length === 0 || rows.length < RECORD_SCAN_PAGE_SIZE) {
      afterScanSequence = nextScanSequence;
      break;
    }
    if (nextScanSequence <= afterScanSequence) {
      throw new Error("records.scan cursor did not advance");
    }
    afterScanSequence = nextScanSequence;
    if (scanned >= params.remainingScanBudget) {
      throw new Error(`Shopify record scan reached the ${MAX_RECORDS_SCANNED}-row guard`);
    }
  }
  return { recordIds, nextScanSequence: afterScanSequence, scanned };
}

async function discoverShopifyCommerceRecordIds(params: {
  nex: unknown;
  shopDomain: string;
  connectionId: string;
}): Promise<{
  recordIds: string[];
  orderNextScanSequence: number;
  lineItemNextScanSequence: number;
}> {
  const recordsClient = (
    params.nex as {
      records: {
        scan: (input: {
          after_scan_sequence: number;
          platform: "shopify";
          connection_id: string;
          source_record_type: "shopify.order" | "shopify.line_item";
          limit: number;
        }) => Promise<unknown>;
      };
    }
  ).records;
  const orders = await scanShopifyCommerceFamily({
    recordsClient,
    shopDomain: params.shopDomain,
    connectionId: params.connectionId,
    family: "order",
    remainingScanBudget: MAX_RECORDS_SCANNED,
  });
  const lineItems = await scanShopifyCommerceFamily({
    recordsClient,
    shopDomain: params.shopDomain,
    connectionId: params.connectionId,
    family: "line_item",
    remainingScanBudget: MAX_RECORDS_SCANNED - orders.scanned,
  });
  const orderRecordIds = orders.recordIds;
  const lineItemRecordIds = lineItems.recordIds;

  // This order is part of the manifest contract. Sorting one combined set can
  // put line-item batches ahead of their parent-order batches. Keep each family
  // deterministic, but place every order revision before every line item.
  orderRecordIds.sort((left, right) => left.localeCompare(right));
  lineItemRecordIds.sort((left, right) => left.localeCompare(right));
  const recordIds = [...orderRecordIds, ...lineItemRecordIds];
  if (recordIds.length < 1 || recordIds.length > MAX_INSPECTED_COMMERCE_RECORDS) {
    throw new Error(
      `Shopify commerce record set must contain between 1 and ${MAX_INSPECTED_COMMERCE_RECORDS} records`,
    );
  }
  if (new Set(recordIds).size !== recordIds.length) {
    throw new Error("Shopify commerce record scan returned duplicate record ids");
  }
  return {
    recordIds,
    orderNextScanSequence: orders.nextScanSequence,
    lineItemNextScanSequence: lineItems.nextScanSequence,
  };
}

export const inspectShopifyCustomerBackfill: NexAppMethodHandler = async (ctx) => {
  const shopDomain = requireShopDomain(ctx.params.shop_domain);
  const connectionId = requireConnectionId(ctx.params.connection_id);
  const sourceContract = requireSourceContract(ctx.params.source_contract);
  if (sourceContract !== "canonical") {
    const page = await scanLegacyShopifyFamilyPage({
      nex: ctx.nex,
      shopDomain,
      connectionId,
      family: "customer",
      sourceContract,
      limit: requirePageLimit(ctx.params.limit),
      cursor: {
        providerRecordId: ctx.params.after_provider_record_id,
        sourceTimestamp: ctx.params.after_source_timestamp,
        id: ctx.params.after_id,
      },
    });
    if (page.recordIds.length < 1) {
      throw new Error("Exact legacy Shopify customer page is empty");
    }
    return {
      state: "ready",
      shop_domain: shopDomain,
      connection_id: connectionId,
      source_contract: sourceContract,
      family: "customer",
      record_count: page.recordIds.length,
      record_ids: page.recordIds,
      record_set_sha256: shopifyCustomerRecordSetSha256(page.recordIds),
      first_record_id: page.recordIds[0],
      last_record_id: page.recordIds.at(-1),
      complete: page.complete,
      next_provider_record_id: page.nextProviderRecordId,
      next_source_timestamp: page.nextSourceTimestamp,
      next_id: page.nextId,
      provider_read_authority: false,
      provider_write_authority: false,
    };
  }
  const discovery = await discoverShopifyCustomerRecordIds({
    nex: ctx.nex,
    shopDomain,
    connectionId,
  });
  const recordIds = discovery.recordIds;
  return {
    state: "ready",
    shop_domain: shopDomain,
    connection_id: connectionId,
    record_count: recordIds.length,
    record_ids: recordIds,
    record_set_sha256: shopifyCustomerRecordSetSha256(recordIds),
    first_record_id: recordIds[0],
    last_record_id: recordIds.at(-1),
    next_scan_sequence: discovery.nextScanSequence,
    provider_write_authority: false,
  };
};

export const inspectShopifyCommerceBackfill: NexAppMethodHandler = async (ctx) => {
  const shopDomain = requireShopDomain(ctx.params.shop_domain);
  const connectionId = requireConnectionId(ctx.params.connection_id);
  const sourceContract = requireSourceContract(ctx.params.source_contract);
  if (sourceContract !== "canonical") {
    const family = asString(ctx.params.family);
    if (family !== "order" && family !== "line_item") {
      throw new Error("legacy commerce inspection requires exact order or line_item family");
    }
    const page = await scanLegacyShopifyFamilyPage({
      nex: ctx.nex,
      shopDomain,
      connectionId,
      family,
      sourceContract,
      limit: requirePageLimit(ctx.params.limit),
      cursor: {
        providerRecordId: ctx.params.after_provider_record_id,
        sourceTimestamp: ctx.params.after_source_timestamp,
        id: ctx.params.after_id,
      },
    });
    if (page.recordIds.length < 1) {
      throw new Error("Exact legacy Shopify commerce page is empty");
    }
    return {
      state: "ready",
      shop_domain: shopDomain,
      connection_id: connectionId,
      source_contract: sourceContract,
      family,
      record_count: page.recordIds.length,
      record_ids: page.recordIds,
      record_set_sha256: shopifyCommerceRecordSetSha256(page.recordIds),
      first_record_id: page.recordIds[0],
      last_record_id: page.recordIds.at(-1),
      complete: page.complete,
      next_provider_record_id: page.nextProviderRecordId,
      next_source_timestamp: page.nextSourceTimestamp,
      next_id: page.nextId,
      provider_read_authority: false,
      provider_write_authority: false,
    };
  }
  const discovery = await discoverShopifyCommerceRecordIds({
    nex: ctx.nex,
    shopDomain,
    connectionId,
  });
  const recordIds = discovery.recordIds;
  return {
    state: "ready",
    shop_domain: shopDomain,
    connection_id: connectionId,
    record_count: recordIds.length,
    record_ids: recordIds,
    record_set_sha256: shopifyCommerceRecordSetSha256(recordIds),
    first_record_id: recordIds[0],
    last_record_id: recordIds.at(-1),
    scan_cursors: {
      order: discovery.orderNextScanSequence,
      line_item: discovery.lineItemNextScanSequence,
    },
    provider_read_authority: false,
    provider_write_authority: false,
  };
};

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
    shopify_customer_backfill: "available_bounded_checkpointed_batches",
    shopify_customer_complete_backfill: "removed_unbounded_operation",
    shopify_order_commerce: "dormant_bounded_checkpointed_batches",
  },
  provider_write_authority: false,
});

export const triggerShopifySource: NexAppMethodHandler = async (ctx) => {
  const family = asString(ctx.params.family) as keyof typeof SOURCE_JOB_NAMES;
  const connectionId = asString(ctx.params.connection_id);
  const requestId = asString(ctx.params.request_id);
  const jobName = SOURCE_JOB_NAMES[family];
  if (!jobName) {
    throw new Error("family is not an installed Shopify source job");
  }
  if (!SOURCE_CONNECTION_ID_RE.test(connectionId)) {
    throw new Error("connection_id is malformed");
  }
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
      input: { family, connection_id: connectionId },
      trigger_source: "moonsleep-commerce-manual",
      max_attempts: 3,
      idempotency_key: `shopify-source:${family}:${requestId}`,
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

export const projectShopifyCustomerBackfill: NexAppMethodHandler = async (ctx) => {
  const recordIds = requireBackfillRecordIds(ctx.params);

  // Each explicit batch is fetched and validated before its first identity
  // observation. Production runners persist a checkpoint after every successful
  // batch. A retry is safe because contacts.observe is bound to the immutable
  // Shopify source observation ID.
  const records: Array<{ id: string; record: RuntimeRow }> = [];
  for (const id of recordIds) {
    const response = unwrapPayload(await ctx.nex.records.get({ id }));
    const record = asRecord(response.record);
    buildShopifyCustomerObservation(record, { allowLegacyText: true });
    records.push({ id, record });
  }

  let createdEntities = 0;
  let createdContacts = 0;
  let replayed = 0;
  let acceptedCustomerObservations = 0;
  let replayedCustomerObservations = 0;
  let adoptedCustomerObservations = 0;
  let attachedCustomerFacets = 0;
  let adoptedCustomerFacets = 0;
  const resultHash = createHash("sha256");
  const identityClient = ctx.nex as unknown as Parameters<typeof projectShopifyCustomerIdentity>[0];
  for (const entry of records) {
    const projected = await projectShopifyCustomerIdentity(identityClient, entry.record, {
      allowLegacyText: true,
    });
    createdEntities += projected.created_entity === true ? 1 : 0;
    createdContacts += projected.created_contact === true ? 1 : 0;
    replayed += projected.replayed === true ? 1 : 0;
    acceptedCustomerObservations += projected.customer_observation_outcome === "accepted" ? 1 : 0;
    replayedCustomerObservations += projected.customer_observation_outcome === "replayed" ? 1 : 0;
    adoptedCustomerObservations +=
      projected.customer_observation_outcome === "adopted_existing" ? 1 : 0;
    attachedCustomerFacets += projected.customer_facet_outcome === "attached" ? 1 : 0;
    adoptedCustomerFacets += projected.customer_facet_outcome === "adopted_existing" ? 1 : 0;
    resultHash.update(
      [
        entry.id,
        asString(projected.source_observation_id),
        asString(projected.contact_id),
        asString(projected.canonical_entity_id),
        asString(projected.customer_observation_id),
        asString(projected.customer_facet_attachment_id),
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
    accepted_customer_observations: acceptedCustomerObservations,
    replayed_customer_observations: replayedCustomerObservations,
    adopted_customer_observations: adoptedCustomerObservations,
    attached_customer_facets: attachedCustomerFacets,
    adopted_customer_facets: adoptedCustomerFacets,
    provider_write_authority: false,
  };
};

export const projectShopifyCommerceBackfill: NexAppMethodHandler = async (ctx) => {
  const recordIds = requireCommerceRecordIds(ctx.params);

  // Fetch and validate every immutable record in the explicit batch before the
  // first commerce write. Orders are then committed before line items so a
  // line-item revision can only bind to an existing stable parent order.
  const parsed: ParsedShopifyCommerceRecord[] = [];
  for (const id of recordIds) {
    const response = unwrapPayload(await ctx.nex.records.get({ id }));
    const record = asRecord(response.record);
    const family = asString(shopifyRecordSourceMetadata(record).family);
    const entry =
      family === "order"
        ? parseShopifyOrderRecord(record, { allowLegacyText: true })
        : family === "line_item"
          ? parseShopifyLineItemRecord(record, { allowLegacyText: true })
          : null;
    if (!entry) {
      throw new Error(`Shopify commerce batch contains unsupported record family: ${family}`);
    }
    if (entry.sourceRecordId !== id) {
      throw new Error("records.get returned a different internal record id");
    }
    parsed.push(entry);
  }

  const client = ctx.nex as unknown as ShopifyCommerceClient;
  const resultHash = createHash("sha256");
  let created = 0;
  let replayed = 0;
  let becameCurrent = 0;
  let ordersProjected = 0;
  let lineItemsProjected = 0;

  for (const entry of parsed.filter(
    (row): row is Extract<ParsedShopifyCommerceRecord, { family: "order" }> =>
      row.family === "order",
  )) {
    const result = await projectParsedShopifyOrder(client, entry);
    created += result.created === true ? 1 : 0;
    replayed += result.replayed === true ? 1 : 0;
    becameCurrent += result.became_current === true ? 1 : 0;
    ordersProjected += 1;
    resultHash.update(
      [
        entry.sourceRecordId,
        asString(result.revision_id),
        asString(result.projection_payload_sha256),
      ].join("\u0000") + "\n",
      "utf8",
    );
  }
  for (const entry of parsed.filter(
    (row): row is Extract<ParsedShopifyCommerceRecord, { family: "line_item" }> =>
      row.family === "line_item",
  )) {
    const result = await projectParsedShopifyLineItem(client, entry);
    created += result.created === true ? 1 : 0;
    replayed += result.replayed === true ? 1 : 0;
    becameCurrent += result.became_current === true ? 1 : 0;
    lineItemsProjected += 1;
    resultHash.update(
      [
        entry.sourceRecordId,
        asString(result.revision_id),
        asString(result.projection_payload_sha256),
      ].join("\u0000") + "\n",
      "utf8",
    );
  }

  return {
    state: "succeeded",
    records_requested: recordIds.length,
    records_projected: parsed.length,
    orders_projected: ordersProjected,
    line_items_projected: lineItemsProjected,
    record_set_sha256: shopifyCommerceRecordSetSha256(recordIds),
    projection_result_sha256: resultHash.digest("hex"),
    first_record_id: recordIds[0],
    last_record_id: recordIds.at(-1),
    created,
    replayed,
    became_current: becameCurrent,
    provider_read_authority: false,
    provider_write_authority: false,
  };
};

export default {
  "moonsleep-commerce.healthcheck": healthcheck,
  "moonsleep-commerce.shopify-source.seed-identities": seedShopifySourceIdentities,
  "moonsleep-commerce.shopify-source.trigger": triggerShopifySource,
  "moonsleep-commerce.shopify-source.configure-schedules": configureShopifySourceSchedules,
  "moonsleep-commerce.shopify-projections.configure": configureShopifyProjections,
  "moonsleep-commerce.shopify-customers.inspect-backfill": inspectShopifyCustomerBackfill,
  "moonsleep-commerce.shopify-customers.project-cohort": projectShopifyCustomerCohort,
  "moonsleep-commerce.shopify-customers.project-backfill": projectShopifyCustomerBackfill,
  "moonsleep-commerce.shopify-commerce.inspect-backfill": inspectShopifyCommerceBackfill,
  "moonsleep-commerce.shopify-commerce.project-backfill": projectShopifyCommerceBackfill,
};
