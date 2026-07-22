import { createHash } from "node:crypto";

type RuntimeRow = Record<string, unknown>;

const PROJECTOR_VERSION = "moonsleep-commerce-shopify-orders-v1";
const SHA256_RE = /^[0-9a-f]{64}$/;
const LEGACY_REVISION_TOKEN_RE = /^[0-9a-f]{16}$/;
const LEGACY_REVISION_DIGEST_DOMAIN = "nex-commerce-source-revision-token-v1\0";
const DECIMAL_RE = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const NUMERIC_ID_RE = /^[1-9][0-9]*$/;

export type ShopifyCommerceClient = {
  records?: {
    get(params: { id: string }): Promise<unknown>;
  };
  contacts: {
    resolve(params: {
      platform: "shopify";
      space_id: string;
      contact_id: string;
    }): Promise<unknown>;
  };
  commerce: {
    orders: {
      observe(params: RuntimeRow): Promise<unknown>;
      get(params: { platform: "shopify"; space_id: string; order_id: string }): Promise<unknown>;
    };
    "line-items": {
      observe(params: RuntimeRow): Promise<unknown>;
    };
  };
};

export type ShopifyCommerceJobContext = {
  input: RuntimeRow;
  nex: ShopifyCommerceClient & { records: { get(params: { id: string }): Promise<unknown> } };
};

export type ParsedShopifyCommerceRecord =
  | { family: "order"; sourceRecordId: string; input: RuntimeRow }
  | {
      family: "line_item";
      sourceRecordId: string;
      orderId: string;
      inputWithoutCurrency: RuntimeRow;
    };

function asRecord(value: unknown): RuntimeRow {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RuntimeRow)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asOptionalString(value: unknown): string | null {
  const text = asString(value);
  return text || null;
}

function requireString(row: RuntimeRow, field: string): string {
  const value = asString(row[field]);
  if (!value) {
    throw new Error(`Shopify commerce projection requires ${field}`);
  }
  return value;
}

function requireSha256(row: RuntimeRow, field: string): string {
  const value = requireString(row, field);
  if (!SHA256_RE.test(value)) {
    throw new Error(`Shopify commerce ${field} is malformed`);
  }
  return value;
}

function sourceRevisionDigest(metadata: RuntimeRow): string {
  const value = requireString(metadata, "revision_hash");
  if (SHA256_RE.test(value)) {
    return value;
  }
  if (!LEGACY_REVISION_TOKEN_RE.test(value)) {
    throw new Error("Shopify commerce revision_hash is malformed");
  }
  return sha256(LEGACY_REVISION_DIGEST_DOMAIN + value);
}

function requireNumericId(value: unknown, field: string): string {
  const text = asString(value);
  if (!NUMERIC_ID_RE.test(text)) {
    throw new Error(`Shopify commerce ${field} must be an exact positive decimal identifier`);
  }
  return text;
}

function requireDecimal(value: unknown, field: string): string {
  const text = asString(value);
  if (!DECIMAL_RE.test(text) || text.length > 128) {
    throw new Error(`Shopify commerce ${field} must be an exact non-negative decimal string`);
  }
  return text;
}

function requireSafeQuantity(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("Shopify commerce line-item quantity must be a non-negative safe integer");
  }
  return value;
}

function stableJsonValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
      throw new Error("Shopify commerce snapshots require finite JSON-safe numbers");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(stableJsonValue);
  }
  if (value && typeof value === "object") {
    const output: RuntimeRow = {};
    for (const key of Object.keys(value as RuntimeRow).toSorted()) {
      const entry = (value as RuntimeRow)[key];
      if (entry !== undefined) {
        output[key] = stableJsonValue(entry);
      }
    }
    return output;
  }
  throw new Error(`Shopify commerce snapshots do not support ${typeof value} values`);
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableJsonValue(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function exactProviderEnvelope(payload: RuntimeRow): { payloadSha256: string } {
  const sourceJson = requireString(payload, "provider_object_json");
  const payloadSha256 = requireSha256(payload, "provider_object_sha256");
  if (sha256(sourceJson) !== payloadSha256) {
    throw new Error("Shopify commerce provider object hash does not match exact JSON");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(sourceJson);
  } catch {
    throw new Error("Shopify commerce provider_object_json is invalid JSON");
  }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new Error("Shopify commerce provider_object_json must contain an object");
  }
  // Provider IDs are deliberately not read from the decoded object: Shopify's
  // integer IDs exceed JavaScript's safe range. The exact JSON remains the
  // immutable evidence; lossless string anchors come from the adapter metadata.
  return { payloadSha256 };
}

function exactAddress(value: unknown, field: string): {
  address: RuntimeRow | null;
  digest: string | null;
} {
  if (value === null || value === undefined) {
    return { address: null, digest: null };
  }
  const address = asRecord(value);
  if (Object.keys(address).length === 0) {
    throw new Error(`Shopify commerce ${field} must be a non-empty object or null`);
  }
  return { address, digest: sha256(stableJson(address)) };
}

function gid(resource: "Customer" | "Order" | "LineItem", numericId: string): string {
  return `gid://shopify/${resource}/${numericId}`;
}

function commonRecord(record: RuntimeRow, expectedFamily: "order" | "line_item") {
  if (asString(record.platform) !== "shopify") {
    throw new Error("Shopify commerce projector only accepts Shopify records");
  }
  const metadata = asRecord(record.metadata);
  if (asString(metadata.family) !== expectedFamily) {
    throw new Error(`Shopify commerce projector expected ${expectedFamily} record`);
  }
  const row = asRecord(metadata.row);
  const providerIds = asRecord(metadata.provider_ids);
  const shopDomain = requireString(row, "shop_domain");
  if (asString(record.space_id) !== shopDomain) {
    throw new Error("Shopify commerce record space does not match its shop domain");
  }
  const sourceRecordId = requireString(record, "id");
  const sourceRevisionSha256 = sourceRevisionDigest(metadata);
  const { payloadSha256 } = exactProviderEnvelope(asRecord(record.payload));
  const observedAt = record.timestamp;
  if (typeof observedAt !== "number" || !Number.isSafeInteger(observedAt) || observedAt < 0) {
    throw new Error("Shopify commerce record timestamp must be a non-negative safe integer");
  }
  return {
    metadata,
    row,
    providerIds,
    shopDomain,
    sourceRecordId,
    sourceRevisionSha256,
    payloadSha256,
    observedAt,
  };
}

export function parseShopifyOrderRecord(recordValue: unknown): ParsedShopifyCommerceRecord {
  const record = asRecord(recordValue);
  const common = commonRecord(record, "order");
  const orderNumericId = requireNumericId(common.row.order_id, "order_id");
  if (requireNumericId(common.providerIds.order_id, "provider order_id") !== orderNumericId) {
    throw new Error("Shopify order anchors disagree");
  }
  const customerId = asOptionalString(common.row.customer_id);
  const providerCustomerId = asOptionalString(common.providerIds.customer_id);
  if (customerId !== providerCustomerId) {
    throw new Error("Shopify order customer anchors disagree");
  }
  const billing = exactAddress(common.row.billing_address, "billing_address");
  const shipping = exactAddress(common.row.shipping_address, "shipping_address");
  const currency = requireString(common.row, "currency");
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Shopify order currency must be an uppercase ISO currency code");
  }
  const input: RuntimeRow = {
    platform: "shopify",
    space_id: common.shopDomain,
    order_id: gid("Order", orderNumericId),
    order_name: asOptionalString(common.row.name),
    source_record_id: common.sourceRecordId,
    source_payload_sha256: common.payloadSha256,
    source_revision_sha256: common.sourceRevisionSha256,
    projector_version: PROJECTOR_VERSION,
    observed_at: common.observedAt,
    customer_shopify_gid: customerId ? gid("Customer", requireNumericId(customerId, "customer_id")) : null,
    currency,
    financial_status: asOptionalString(common.row.financial_status),
    fulfillment_status: asOptionalString(common.row.fulfillment_status),
    subtotal_price:
      common.row.subtotal_price === undefined || common.row.subtotal_price === null
        ? null
        : requireDecimal(common.row.subtotal_price, "subtotal_price"),
    total_price: requireDecimal(common.row.total_price, "total_price"),
    billing_address: billing.address,
    billing_address_sha256: billing.digest,
    shipping_address: shipping.address,
    shipping_address_sha256: shipping.digest,
  };
  return { family: "order", sourceRecordId: common.sourceRecordId, input };
}

export function parseShopifyLineItemRecord(recordValue: unknown): ParsedShopifyCommerceRecord {
  const record = asRecord(recordValue);
  const common = commonRecord(record, "line_item");
  const orderNumericId = requireNumericId(common.row.order_id, "order_id");
  const lineNumericId = requireNumericId(common.row.line_item_id, "line_item_id");
  if (
    requireNumericId(common.providerIds.order_id, "provider order_id") !== orderNumericId ||
    requireNumericId(common.providerIds.line_item_id, "provider line_item_id") !== lineNumericId
  ) {
    throw new Error("Shopify line-item anchors disagree");
  }
  const inputWithoutCurrency: RuntimeRow = {
    platform: "shopify",
    space_id: common.shopDomain,
    order_id: gid("Order", orderNumericId),
    line_item_id: gid("LineItem", lineNumericId),
    source_record_id: common.sourceRecordId,
    source_payload_sha256: common.payloadSha256,
    source_revision_sha256: common.sourceRevisionSha256,
    projector_version: PROJECTOR_VERSION,
    observed_at: common.observedAt,
    product_id: asOptionalString(common.row.product_id),
    variant_id: asOptionalString(common.row.variant_id),
    sku: asOptionalString(common.row.sku),
    title: requireString(common.row, "title"),
    quantity: requireSafeQuantity(common.row.quantity),
    price: requireDecimal(common.row.price, "price"),
  };
  return {
    family: "line_item",
    sourceRecordId: common.sourceRecordId,
    orderId: asString(inputWithoutCurrency.order_id),
    inputWithoutCurrency,
  };
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

function validateObservationResult(resultValue: unknown, parsed: ParsedShopifyCommerceRecord) {
  const result = unwrapPayload(resultValue);
  if (
    asString(result.source_record_id) !== parsed.sourceRecordId ||
    !SHA256_RE.test(asString(result.projection_payload_sha256)) ||
    !SHA256_RE.test(asString(result.source_revision_sha256))
  ) {
    throw new Error("Nex committed an unexpected Shopify commerce observation receipt");
  }
  return result;
}

export async function projectParsedShopifyOrder(
  nex: ShopifyCommerceClient,
  parsed: Extract<ParsedShopifyCommerceRecord, { family: "order" }>,
): Promise<RuntimeRow> {
  const input = { ...parsed.input };
  const customerGid = asOptionalString(input.customer_shopify_gid);
  delete input.customer_shopify_gid;
  if (customerGid) {
    const resolved = unwrapPayload(
      await nex.contacts.resolve({
        platform: "shopify",
        space_id: asString(input.space_id),
        contact_id: customerGid,
      }),
    );
    const contact = asRecord(resolved.contact);
    if (resolved.found !== true || !asString(contact.id) || !asString(contact.canonical_entity_id)) {
      throw new Error(`Shopify order customer contact is not projected: ${customerGid}`);
    }
    input.customer_contact_id = asString(contact.id);
    input.customer_entity_id = asString(contact.canonical_entity_id);
  }
  return validateObservationResult(await nex.commerce.orders.observe(input), parsed);
}

export async function projectParsedShopifyLineItem(
  nex: ShopifyCommerceClient,
  parsed: Extract<ParsedShopifyCommerceRecord, { family: "line_item" }>,
): Promise<RuntimeRow> {
  const parent = unwrapPayload(
    await nex.commerce.orders.get({
      platform: "shopify",
      space_id: asString(parsed.inputWithoutCurrency.space_id),
      order_id: parsed.orderId,
    }),
  );
  const revision = asRecord(parent.revision);
  const currency = asString(revision.currency);
  if (parent.found !== true || !/^[A-Z]{3}$/.test(currency)) {
    throw new Error(`Shopify line item parent order is not projected: ${parsed.orderId}`);
  }
  return validateObservationResult(
    await nex.commerce["line-items"].observe({ ...parsed.inputWithoutCurrency, currency }),
    parsed,
  );
}

function eventRecordId(input: RuntimeRow): string {
  const event = asRecord(input.event);
  const properties = asRecord(event.properties);
  return asString(properties.record_id) || asString(input.record_id);
}

export default async function shopifyOrderCommerceJob(
  ctx: ShopifyCommerceJobContext,
): Promise<RuntimeRow> {
  const event = asRecord(ctx.input.event);
  const eventType = asString(event.type);
  if (eventType && eventType !== "record.ingested") {
    return { projected: false, reason: "not_record_ingested" };
  }
  const properties = asRecord(event.properties);
  const platform = asString(properties.platform);
  if (platform && platform !== "shopify") {
    return { projected: false, reason: "not_shopify" };
  }
  const recordId = eventRecordId(ctx.input);
  if (!recordId) {
    throw new Error("Shopify commerce job is missing record_id");
  }
  const response = unwrapPayload(await ctx.nex.records.get({ id: recordId }));
  const record = asRecord(response.record);
  if (asString(record.platform) !== "shopify") {
    return { projected: false, reason: "not_shopify", record_id: recordId };
  }
  const family = asString(asRecord(record.metadata).family);
  if (family === "order") {
    const parsed = parseShopifyOrderRecord(record);
    return {
      projected: true,
      family,
      record_id: recordId,
      ...(await projectParsedShopifyOrder(ctx.nex, parsed)),
    };
  }
  if (family === "line_item") {
    const parsed = parseShopifyLineItemRecord(record);
    return {
      projected: true,
      family,
      record_id: recordId,
      ...(await projectParsedShopifyLineItem(ctx.nex, parsed)),
    };
  }
  return { projected: false, reason: "not_order_or_line_item", record_id: recordId };
}
