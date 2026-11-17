import { createHash } from "node:crypto";
import { assertShopifyRecordFamily, shopifyRecordSourceMetadata } from "./shopify-record-family.js";

type RuntimeRow = Record<string, unknown>;

const PROJECTOR_VERSION = "moonsleep-commerce-shopify-orders-v1";
const SHA256_RE = /^[0-9a-f]{64}$/;
const DECIMAL_RE = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const NUMERIC_ID_RE = /^[1-9][0-9]*$/;

export type ShopifyCommerceClient = {
  records?: {
    get(params: { id: string }): Promise<unknown>;
    get_many(params: { ids: string[] }): Promise<unknown>;
  };
  contacts: {
    observe(params: ShopifyOrderCustomerObservation): Promise<unknown>;
    resolve(params: {
      platform: "shopify";
      space_id: string;
      contact_id: string;
    }): Promise<unknown>;
  };
  entities: {
    resolve(params: { entity_id: string }): Promise<unknown>;
  };
  commerce: {
    orders: {
      observe(params: RuntimeRow): Promise<unknown>;
      observe_many?(params: { observations: RuntimeRow[] }): Promise<unknown>;
      get(params: { platform: "shopify"; space_id: string; order_id: string }): Promise<unknown>;
    };
    "line-items": {
      observe(params: RuntimeRow): Promise<unknown>;
      observe_many?(params: { observations: RuntimeRow[] }): Promise<unknown>;
    };
  };
};

export type ShopifyCommerceJobContext = {
  input: RuntimeRow;
  nex: ShopifyCommerceClient & {
    records: {
      get(params: { id: string }): Promise<unknown>;
      get_many(params: { ids: string[] }): Promise<unknown>;
    };
  };
};

export type ParsedShopifyCommerceRecord =
  | {
      family: "order";
      sourceRecordId: string;
      input: RuntimeRow;
      customerObservation: ShopifyOrderCustomerObservation | null;
    }
  | {
      family: "line_item";
      sourceRecordId: string;
      orderId: string;
      inputWithoutCurrency: RuntimeRow;
    };

type ShopifyOrderCustomerObservation = {
  platform: "shopify";
  space_id: string;
  contact_id: string;
  source_observation_id: string;
  observed_at: number;
  contact_name: string;
  entity_name: string;
  tags: ["Customer", "Shopify"];
};

function asRecord(value: unknown): RuntimeRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RuntimeRow) : {};
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

function exactProviderEnvelope(payload: RuntimeRow): {
  sourceObject: RuntimeRow;
} {
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
  const sourceObject = asRecord(decoded);
  if (Object.keys(sourceObject).length === 0) {
    throw new Error("Shopify commerce provider_object_json must contain an object");
  }
  // Provider IDs are deliberately not read from the decoded object: Shopify's
  // integer IDs exceed JavaScript's safe range. The exact JSON remains the
  // immutable evidence; lossless string anchors come from the adapter metadata.
  return { sourceObject };
}

function orderCustomerName(sourceObject: RuntimeRow, customerGid: string): string {
  const customer = asRecord(sourceObject.customer);
  if (Object.keys(customer).length === 0) {
    throw new Error("Shopify order with a customer anchor requires an embedded customer object");
  }
  const combined = [
    asString(customer.first_name) || asString(customer.firstName),
    asString(customer.last_name) || asString(customer.lastName),
  ]
    .filter(Boolean)
    .join(" ");
  return combined || `Shopify customer ${customerGid.replace(/^gid:\/\/shopify\/Customer\//, "")}`;
}

function exactAddress(
  value: unknown,
  field: string,
): {
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

function commonRecord(
  record: RuntimeRow,
  expectedFamily: "order" | "line_item",
  options: { allowLegacyText?: boolean } = {},
) {
  const sourceContract = assertShopifyRecordFamily(record, expectedFamily, options);
  const metadata = shopifyRecordSourceMetadata(record);
  const row = asRecord(metadata.row);
  const providerIds = asRecord(metadata.provider_ids);
  const shopDomain = requireString(row, "shop_domain");
  if (asString(record.source_space_id) !== shopDomain) {
    throw new Error("Shopify commerce record space does not match its shop domain");
  }
  const sourceRecordId = requireString(record, "id");
  const sourceRecordPayloadSha256 = requireSha256(record, "payload_sha256");
  const sourceProviderRecordId = requireString(record, "provider_record_id");
  const providerAccountRef = requireString(record, "provider_account_ref");
  const payload = asRecord(record.payload);
  const sourceMetadata = asRecord(payload.source_metadata);
  const sourceObject =
    sourceContract === "canonical"
      ? exactProviderEnvelope(asRecord(sourceMetadata.provider_payload)).sourceObject
      : { customer: { first_name: "", last_name: "" } };
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
    sourceRecordPayloadSha256,
    sourceProviderRecordId,
    commerceSpaceId: sourceContract === "canonical" ? providerAccountRef : shopDomain,
    sourceObject,
    observedAt,
  };
}

export function parseShopifyOrderRecord(
  recordValue: unknown,
  options: { allowLegacyText?: boolean } = {},
): ParsedShopifyCommerceRecord {
  const record = asRecord(recordValue);
  const common = commonRecord(record, "order", options);
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
    space_id: common.commerceSpaceId,
    order_id: gid("Order", orderNumericId),
    order_name: asOptionalString(common.row.name),
    source_record_id: common.sourceRecordId,
    source_payload_sha256: sha256(stableJson(common.row)),
    source_record_payload_sha256: common.sourceRecordPayloadSha256,
    source_provider_record_id: common.sourceProviderRecordId,
    projector_version: PROJECTOR_VERSION,
    observed_at: common.observedAt,
    customer_shopify_gid: customerId
      ? gid("Customer", requireNumericId(customerId, "customer_id"))
      : null,
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
  const customerGid = asOptionalString(input.customer_shopify_gid);
  const customerObservation: ShopifyOrderCustomerObservation | null = customerGid
    ? {
        platform: "shopify",
        space_id: common.shopDomain,
        contact_id: customerGid,
        source_observation_id: `moonsleep-commerce:shopify-order-customer:v1:${common.sourceRecordId}`,
        observed_at: common.observedAt,
        contact_name: orderCustomerName(common.sourceObject, customerGid),
        entity_name: orderCustomerName(common.sourceObject, customerGid),
        tags: ["Customer", "Shopify"],
      }
    : null;
  return {
    family: "order",
    sourceRecordId: common.sourceRecordId,
    input,
    customerObservation,
  };
}

export function parseShopifyLineItemRecord(
  recordValue: unknown,
  options: { allowLegacyText?: boolean } = {},
): ParsedShopifyCommerceRecord {
  const record = asRecord(recordValue);
  const common = commonRecord(record, "line_item", options);
  const orderNumericId = requireNumericId(common.row.order_id, "order_id");
  const lineNumericId = requireNumericId(common.row.line_item_id, "line_item_id");
  if (
    requireNumericId(common.providerIds.order_id, "provider order_id") !== orderNumericId ||
    requireNumericId(common.providerIds.line_item_id, "provider line_item_id") !== lineNumericId
  ) {
    throw new Error("Shopify line-item anchors disagree");
  }
  const title = requireString(common.row, "title");
  const quantity = requireSafeQuantity(common.row.quantity);
  const price = requireDecimal(common.row.price, "price");
  const sourcePayloadSha256 = sha256(stableJson(common.row));
  const inputWithoutCurrency: RuntimeRow = {
    platform: "shopify",
    space_id: common.commerceSpaceId,
    order_id: gid("Order", orderNumericId),
    line_item_id: gid("LineItem", lineNumericId),
    source_record_id: common.sourceRecordId,
    source_payload_sha256: sourcePayloadSha256,
    source_record_payload_sha256: common.sourceRecordPayloadSha256,
    source_provider_record_id: common.sourceProviderRecordId,
    projector_version: PROJECTOR_VERSION,
    observed_at: common.observedAt,
    product_id: asOptionalString(common.row.product_id),
    variant_id: asOptionalString(common.row.variant_id),
    sku: asOptionalString(common.row.sku),
    title,
    quantity,
    price,
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
    asString(result.source_record_payload_sha256) !==
      asString(
        parsed.family === "order"
          ? parsed.input.source_record_payload_sha256
          : parsed.inputWithoutCurrency.source_record_payload_sha256,
      )
  ) {
    throw new Error("Nex committed an unexpected Shopify commerce observation receipt");
  }
  return result;
}

async function prepareShopifyOrderInput(
  nex: ShopifyCommerceClient,
  parsed: Extract<ParsedShopifyCommerceRecord, { family: "order" }>,
): Promise<RuntimeRow> {
  const input = { ...parsed.input };
  const customerGid = asOptionalString(input.customer_shopify_gid);
  delete input.customer_shopify_gid;
  if (customerGid) {
    const observation = parsed.customerObservation;
    if (!observation || observation.contact_id !== customerGid) {
      throw new Error(`Shopify order customer contact is not projected: ${customerGid}`);
    }
    let resolved = unwrapPayload(
      await nex.contacts.resolve({
        platform: "shopify",
        space_id: observation.space_id,
        contact_id: customerGid,
      }),
    );
    if (resolved.found !== true) {
      const observed = unwrapPayload(await nex.contacts.observe(observation));
      const observedContact = asRecord(observed.contact);
      const committedObservation = asRecord(observed.observation);
      const observedEntity = asRecord(observed.entity);
      const observedEntityId = asString(observedEntity.id);
      const canonicalEntityId = asString(observed.canonical_entity_id);
      if (
        asString(observedContact.platform) !== observation.platform ||
        asString(observedContact.space_id) !== observation.space_id ||
        asString(observedContact.contact_id) !== observation.contact_id ||
        asString(committedObservation.source_observation_id) !==
          observation.source_observation_id ||
        !observedEntityId ||
        !canonicalEntityId
      ) {
        throw new Error("Nex committed a different Shopify order-customer observation");
      }
      const entityResolution = unwrapPayload(
        await nex.entities.resolve({ entity_id: observedEntityId }),
      );
      if (asString(entityResolution.canonical_id) !== canonicalEntityId) {
        throw new Error(
          "Nex canonical entity resolution disagrees with order-customer observation",
        );
      }
      resolved = unwrapPayload(
        await nex.contacts.resolve({
          platform: "shopify",
          space_id: observation.space_id,
          contact_id: customerGid,
        }),
      );
    }
    const contact = asRecord(resolved.contact);
    if (
      resolved.found !== true ||
      !asString(contact.id) ||
      !asString(contact.canonical_entity_id)
    ) {
      throw new Error(`Shopify order customer contact is not projected: ${customerGid}`);
    }
    input.customer_contact_id = asString(contact.id);
    input.customer_entity_id = asString(contact.canonical_entity_id);
  }
  return input;
}

function validateOrderObservationResult(
  resultValue: unknown,
  parsed: Extract<ParsedShopifyCommerceRecord, { family: "order" }>,
): RuntimeRow {
  const result = validateObservationResult(resultValue, parsed);
  const rowId = asString(result.row_id);
  if (!/^commerce_order_[0-9a-f]{64}$/.test(rowId)) {
    throw new Error("Nex committed an invalid canonical Commerce Order row id");
  }
  return {
    ...result,
    canonical_order_target: {
      subject_class: "moonsleep.commerce_order",
      target_id: rowId,
      adapter_contract_id: "moonsleep.commerce-order.target-adapter.v1",
    },
  };
}

function commerceProjectionReceipt(
  family: "order" | "line_item",
  recordId: string,
  result: RuntimeRow,
): RuntimeRow {
  const terminal = {
    projection_receipt_id: commerceProjectionReceiptId(family, recordId),
    projector: "moonsleep-commerce.shopify-order-commerce",
    family,
    record_id: recordId,
    status: "completed",
    target_id: requireString(result, "row_id"),
    source_record_payload_sha256: requireSha256(result, "source_record_payload_sha256"),
    projection_payload_sha256: requireSha256(result, "projection_payload_sha256"),
  };
  return { ...terminal, result_sha256: sha256(stableJson(terminal)) };
}

function commerceProjectionReceiptId(family: "order" | "line_item", recordId: string): string {
  return `shopify_commerce_projection_${sha256(
    stableJson({
      projector: "moonsleep-commerce.shopify-order-commerce",
      family,
      record_id: recordId,
    }),
  ).slice(0, 32)}`;
}

function commerceProjectionQuarantine(
  family: "order" | "line_item",
  recordId: string,
  error: unknown,
): RuntimeRow {
  const terminal = {
    projection_receipt_id: commerceProjectionReceiptId(family, recordId),
    projector: "moonsleep-commerce.shopify-order-commerce",
    family,
    record_id: recordId,
    status: "quarantined",
    error_code: "invalid_commerce_record",
    error: error instanceof Error ? error.message : "invalid Shopify commerce Record",
  };
  return { ...terminal, result_sha256: sha256(stableJson(terminal)) };
}

export async function projectParsedShopifyOrder(
  nex: ShopifyCommerceClient,
  parsed: Extract<ParsedShopifyCommerceRecord, { family: "order" }>,
): Promise<RuntimeRow> {
  const input = await prepareShopifyOrderInput(nex, parsed);
  return validateOrderObservationResult(await nex.commerce.orders.observe(input), parsed);
}

export async function projectParsedShopifyLineItem(
  nex: ShopifyCommerceClient,
  parsed: Extract<ParsedShopifyCommerceRecord, { family: "line_item" }>,
  knownParentCurrency?: string,
): Promise<RuntimeRow> {
  const currency = await resolveLineItemCurrency(nex, parsed, knownParentCurrency);
  return validateObservationResult(
    await nex.commerce["line-items"].observe({ ...parsed.inputWithoutCurrency, currency }),
    parsed,
  );
}

async function resolveLineItemCurrency(
  nex: ShopifyCommerceClient,
  parsed: Extract<ParsedShopifyCommerceRecord, { family: "line_item" }>,
  knownParentCurrency?: string,
): Promise<string> {
  let currency = asString(knownParentCurrency);
  if (!currency) {
    const parent = unwrapPayload(
      await nex.commerce.orders.get({
        platform: "shopify",
        space_id: asString(parsed.inputWithoutCurrency.space_id),
        order_id: parsed.orderId,
      }),
    );
    const revision = asRecord(parent.revision);
    currency = asString(revision.currency);
    if (parent.found !== true || !/^[A-Z]{3}$/.test(currency)) {
      throw new Error(`Shopify line item parent order is not projected: ${parsed.orderId}`);
    }
  } else if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error(`Shopify line item parent currency is invalid: ${parsed.orderId}`);
  }
  return currency;
}

function lineItemObservationInput(
  parsed: Extract<ParsedShopifyCommerceRecord, { family: "line_item" }>,
  currencyValue: unknown,
): RuntimeRow {
  const currency = asString(currencyValue);
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error(`Shopify line item parent currency is invalid: ${parsed.orderId}`);
  }
  return { ...parsed.inputWithoutCurrency, currency };
}

function eventRecordId(input: RuntimeRow): string {
  const event = asRecord(input.event);
  const properties = asRecord(event.properties);
  return asString(properties.record_id) || asString(input.record_id);
}

async function projectShopifyCommerceEvent(ctx: ShopifyCommerceJobContext): Promise<RuntimeRow> {
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
  const family = asString(shopifyRecordSourceMetadata(record).family);
  if (family === "order") {
    let parsed: Extract<ParsedShopifyCommerceRecord, { family: "order" }>;
    try {
      parsed = parseShopifyOrderRecord(record);
    } catch (error) {
      return {
        projected: false,
        record_id: recordId,
        completed: 0,
        quarantined: 1,
        projection_receipts: [commerceProjectionQuarantine("order", recordId, error)],
      };
    }
    const result = await projectParsedShopifyOrder(ctx.nex, parsed);
    return {
      projected: true,
      family,
      record_id: recordId,
      ...result,
      completed: 1,
      quarantined: 0,
      projection_receipts: [commerceProjectionReceipt("order", recordId, result)],
    };
  }
  if (family === "line_item") {
    let parsed: Extract<ParsedShopifyCommerceRecord, { family: "line_item" }>;
    try {
      parsed = parseShopifyLineItemRecord(record);
    } catch (error) {
      return {
        projected: false,
        record_id: recordId,
        completed: 0,
        quarantined: 1,
        projection_receipts: [commerceProjectionQuarantine("line_item", recordId, error)],
      };
    }
    const result = await projectParsedShopifyLineItem(ctx.nex, parsed);
    return {
      projected: true,
      family,
      record_id: recordId,
      ...result,
      completed: 1,
      quarantined: 0,
      projection_receipts: [commerceProjectionReceipt("line_item", recordId, result)],
    };
  }
  return { projected: false, reason: "not_order_or_line_item", record_id: recordId };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (next < values.length) {
        const index = next++;
        output[index] = await mapper(values[index]!);
      }
    }),
  );
  return output;
}

export default async function shopifyOrderCommerceJob(
  ctx: ShopifyCommerceJobContext,
): Promise<RuntimeRow> {
  const events = Array.isArray(ctx.input.events) ? ctx.input.events.map(asRecord) : [];
  if (events.length === 0) return await projectShopifyCommerceEvent(ctx);
  const startedAt = performance.now();
  const recordIds = events.map((event) => eventRecordId({ event }));
  if (recordIds.some((recordId) => !recordId) || new Set(recordIds).size !== recordIds.length) {
    throw new Error("Shopify commerce batch contains missing or duplicate record_id");
  }
  const read = unwrapPayload(await ctx.nex.records.get_many({ ids: recordIds }));
  const records = Array.isArray(read.records) ? read.records.map(asRecord) : [];
  if (records.length !== recordIds.length) {
    throw new Error("Shopify commerce batch did not load every immutable Record");
  }
  const byId = new Map(records.map((record) => [asString(record.id), record]));
  const loaded = recordIds.map((recordId) => {
    if (!recordId) throw new Error("Shopify commerce batch event is missing record_id");
    const record = byId.get(recordId) ?? {};
    if (asString(record.platform) !== "shopify") {
      return { family: "ignored" as const, recordId, parsed: null };
    }
    const family = asString(shopifyRecordSourceMetadata(record).family);
    if (family === "order") {
      try {
        return { family, recordId, parsed: parseShopifyOrderRecord(record), quarantine: null };
      } catch (error) {
        return {
          family: "quarantined" as const,
          recordId,
          parsed: null,
          quarantine: commerceProjectionQuarantine("order", recordId, error),
        };
      }
    }
    if (family === "line_item") {
      try {
        return { family, recordId, parsed: parseShopifyLineItemRecord(record), quarantine: null };
      } catch (error) {
        return {
          family: "quarantined" as const,
          recordId,
          parsed: null,
          quarantine: commerceProjectionQuarantine("line_item", recordId, error),
        };
      }
    }
    return { family: "ignored" as const, recordId, parsed: null };
  });
  const orders = loaded.filter(
    (
      entry,
    ): entry is typeof entry & {
      family: "order";
      parsed: Extract<ParsedShopifyCommerceRecord, { family: "order" }>;
    } => entry.family === "order" && entry.parsed?.family === "order",
  );
  const lineItems = loaded.filter(
    (
      entry,
    ): entry is typeof entry & {
      family: "line_item";
      parsed: Extract<ParsedShopifyCommerceRecord, { family: "line_item" }>;
    } => entry.family === "line_item" && entry.parsed?.family === "line_item",
  );
  const quarantined = loaded.filter(
    (entry): entry is typeof entry & { family: "quarantined"; quarantine: RuntimeRow } =>
      entry.family === "quarantined" && Boolean(entry.quarantine),
  );
  const loadedAt = performance.now();
  const preparedOrders = await mapWithConcurrency(orders, 32, async (entry) => ({
    entry,
    input: await prepareShopifyOrderInput(ctx.nex, entry.parsed),
  }));
  let orderResults: RuntimeRow[] = [];
  if (preparedOrders.length > 0 && ctx.nex.commerce.orders.observe_many) {
    const payload = unwrapPayload(
      await ctx.nex.commerce.orders.observe_many({
        observations: preparedOrders.map(({ input }) => input),
      }),
    );
    const results = Array.isArray(payload.results) ? payload.results : [];
    if (results.length !== preparedOrders.length) {
      throw new Error("Nex returned an incomplete Shopify order observation batch");
    }
    orderResults = results.map((result, index) =>
      validateOrderObservationResult(result, preparedOrders[index]!.entry.parsed),
    );
  } else {
    orderResults = await mapWithConcurrency(preparedOrders, 32, async ({ entry, input }) =>
      validateOrderObservationResult(await ctx.nex.commerce.orders.observe(input), entry.parsed),
    );
  }
  const ordersAt = performance.now();
  const orderCurrencyById = new Map(
    orders.map((entry) => [
      asString(entry.parsed.input.order_id),
      asString(entry.parsed.input.currency),
    ]),
  );
  const missingParents = new Map<
    string,
    Extract<ParsedShopifyCommerceRecord, { family: "line_item" }>
  >();
  for (const entry of lineItems) {
    if (!orderCurrencyById.has(entry.parsed.orderId)) {
      missingParents.set(entry.parsed.orderId, entry.parsed);
    }
  }
  await mapWithConcurrency([...missingParents.entries()], 32, async ([orderId, parsed]) => {
    orderCurrencyById.set(orderId, await resolveLineItemCurrency(ctx.nex, parsed));
  });
  const preparedLineItems = lineItems.map((entry) => ({
    entry,
    input: lineItemObservationInput(entry.parsed, orderCurrencyById.get(entry.parsed.orderId)),
  }));
  let lineItemResults: RuntimeRow[] = [];
  if (preparedLineItems.length > 0 && ctx.nex.commerce["line-items"].observe_many) {
    const payload = unwrapPayload(
      await ctx.nex.commerce["line-items"].observe_many({
        observations: preparedLineItems.map(({ input }) => input),
      }),
    );
    const results = Array.isArray(payload.results) ? payload.results : [];
    if (results.length !== preparedLineItems.length) {
      throw new Error("Nex returned an incomplete Shopify line-item observation batch");
    }
    lineItemResults = results.map((result, index) =>
      validateObservationResult(result, preparedLineItems[index]!.entry.parsed),
    );
  } else {
    lineItemResults = await mapWithConcurrency(preparedLineItems, 32, async ({ entry, input }) =>
      validateObservationResult(await ctx.nex.commerce["line-items"].observe(input), entry.parsed),
    );
  }
  const finishedAt = performance.now();
  const projectionReceipts = [
    ...orderResults.map((result, index) =>
      commerceProjectionReceipt("order", orders[index]!.recordId, result),
    ),
    ...lineItemResults.map((result, index) =>
      commerceProjectionReceipt("line_item", lineItems[index]!.recordId, result),
    ),
    ...quarantined.map((entry) => entry.quarantine),
  ];
  return {
    projected: true,
    records: events.length,
    orders: orders.length,
    line_items: lineItems.length,
    ignored: loaded.length - orders.length - lineItems.length - quarantined.length,
    completed: orderResults.length + lineItemResults.length,
    quarantined: quarantined.length,
    projection_receipts: projectionReceipts,
    timing_ms: {
      load: Math.round(loadedAt - startedAt),
      orders: Math.round(ordersAt - loadedAt),
      line_items: Math.round(finishedAt - ordersAt),
      total: Math.round(finishedAt - startedAt),
    },
  };
}
