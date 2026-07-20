import { createHash } from "node:crypto";

type RuntimeRow = Record<string, unknown>;

type NexIdentityClient = {
  records: {
    get(params: { id: string }): Promise<unknown>;
  };
  contacts: {
    observe(params: ShopifyContactObservation): Promise<unknown>;
  };
  entities: {
    resolve(params: { entity_id: string }): Promise<unknown>;
    tags: {
      list(params: { entity_id: string }): Promise<unknown>;
    };
  };
};

export type ShopifyContactObservation = {
  platform: "shopify";
  space_id: string;
  contact_id: string;
  source_observation_id: string;
  observed_at: number;
  contact_name: string;
  entity_name: string;
  tags: ["Customer", "Shopify"];
};

export type ShopifyCustomerIdentityContext = {
  input: RuntimeRow;
  nex: NexIdentityClient;
};

function asRecord(value: unknown): RuntimeRow {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RuntimeRow)
    : {};
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

function requireString(row: RuntimeRow, field: string): string {
  const value = asString(row[field]);
  if (!value) {
    throw new Error(`Shopify customer identity projection requires ${field}`);
  }
  return value;
}

function exactSourceObject(payload: RuntimeRow): RuntimeRow {
  const sourceJson = requireString(payload, "provider_object_json");
  const expectedSha = requireString(payload, "provider_object_sha256");
  if (!/^[0-9a-f]{64}$/.test(expectedSha)) {
    throw new Error("Shopify customer provider_object_sha256 is malformed");
  }
  const actualSha = createHash("sha256").update(sourceJson, "utf8").digest("hex");
  if (actualSha !== expectedSha) {
    throw new Error("Shopify customer provider object hash does not match exact JSON");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(sourceJson);
  } catch {
    throw new Error("Shopify customer provider_object_json is invalid JSON");
  }
  const sourceObject = asRecord(parsed);
  if (Object.keys(sourceObject).length === 0) {
    throw new Error("Shopify customer provider_object_json must contain an object");
  }
  return sourceObject;
}

function observationName(sourceObject: RuntimeRow, customerGid: string): string {
  const explicit = asString(sourceObject.displayName);
  if (explicit) {
    return explicit;
  }
  const combined = [asString(sourceObject.firstName), asString(sourceObject.lastName)]
    .filter(Boolean)
    .join(" ");
  if (combined) {
    return combined;
  }
  return `Shopify customer ${customerGid.replace(/^gid:\/\/shopify\/Customer\//, "")}`;
}

export function buildShopifyCustomerObservation(recordValue: unknown): ShopifyContactObservation {
  const record = asRecord(recordValue);
  if (asString(record.platform) !== "shopify") {
    throw new Error("Shopify customer identity projector only accepts Shopify records");
  }
  const metadata = asRecord(record.metadata);
  if (asString(metadata.family) !== "customer") {
    throw new Error("Shopify customer identity projector only accepts customer records");
  }
  const payload = asRecord(record.payload);
  const sourceObject = exactSourceObject(payload);
  const row = asRecord(metadata.row);
  const providerIds = asRecord(metadata.provider_ids);
  const shopDomain = requireString(row, "shop_domain");
  if (asString(record.space_id) !== shopDomain) {
    throw new Error("Shopify customer record space does not match the normalized shop domain");
  }
  const customerGid = requireString(row, "customer_gid");
  if (asString(providerIds.customer_gid) !== customerGid || asString(sourceObject.id) !== customerGid) {
    throw new Error("Shopify customer identity anchors disagree");
  }
  const sourceObservationId = requireString(record, "record_id");
  const observedAt = asNonNegativeInteger(record.timestamp);
  if (observedAt == null) {
    throw new Error("Shopify customer record timestamp must be a non-negative safe integer");
  }
  const name = observationName(sourceObject, customerGid);
  return {
    platform: "shopify",
    space_id: shopDomain,
    contact_id: customerGid,
    source_observation_id: sourceObservationId,
    observed_at: observedAt,
    contact_name: name,
    entity_name: name,
    tags: ["Customer", "Shopify"],
  };
}

function extractEvent(input: RuntimeRow): RuntimeRow {
  return asRecord(input.event);
}

function extractRecordId(input: RuntimeRow): string {
  const event = extractEvent(input);
  const properties = asRecord(event.properties);
  return asString(properties.record_id) || asString(input.record_id);
}

function eventPlatform(input: RuntimeRow): string {
  const properties = asRecord(extractEvent(input).properties);
  return asString(properties.platform);
}

export async function projectShopifyCustomerIdentity(
  nex: NexIdentityClient,
  record: unknown,
): Promise<RuntimeRow> {
  const observation = buildShopifyCustomerObservation(record);
  const observed = unwrapPayload(await nex.contacts.observe(observation));
  const entity = asRecord(observed.entity);
  const contact = asRecord(observed.contact);
  const committedObservation = asRecord(observed.observation);
  const observedEntityId = requireString(entity, "id");
  const canonicalEntityId = requireString(observed, "canonical_entity_id");

  if (
    asString(contact.platform) !== observation.platform ||
    asString(contact.space_id) !== observation.space_id ||
    asString(contact.contact_id) !== observation.contact_id ||
    asString(committedObservation.source_observation_id) !== observation.source_observation_id
  ) {
    throw new Error("Nex committed a different Shopify contact observation");
  }

  const resolution = unwrapPayload(await nex.entities.resolve({ entity_id: observedEntityId }));
  if (asString(resolution.canonical_id) !== canonicalEntityId) {
    throw new Error("Nex canonical entity resolution disagrees with contact observation");
  }

  const listed = unwrapPayload(await nex.entities.tags.list({ entity_id: canonicalEntityId }));
  const tags = Array.isArray(listed.tags) ? listed.tags.map(asString).filter(Boolean) : [];
  for (const requiredTag of observation.tags) {
    if (!tags.includes(requiredTag)) {
      throw new Error(`Nex canonical customer entity is missing ${requiredTag} tag`);
    }
  }

  return {
    projected: true,
    replayed: observed.replayed === true,
    created_entity: observed.created_entity === true,
    created_contact: observed.created_contact === true,
    contact_id: requireString(contact, "id"),
    observed_entity_id: observedEntityId,
    canonical_entity_id: canonicalEntityId,
    shop_domain: observation.space_id,
    shopify_customer_gid: observation.contact_id,
    source_observation_id: observation.source_observation_id,
    tags: [...observation.tags],
  };
}

export default async function shopifyCustomerIdentityJob(
  ctx: ShopifyCustomerIdentityContext,
): Promise<RuntimeRow> {
  const event = extractEvent(ctx.input);
  const eventType = asString(event.type);
  if (eventType && eventType !== "record.ingested") {
    return { projected: false, reason: "not_record_ingested" };
  }
  const platform = eventPlatform(ctx.input);
  if (platform && platform !== "shopify") {
    return { projected: false, reason: "not_shopify" };
  }
  const recordId = extractRecordId(ctx.input);
  if (!recordId) {
    throw new Error("Shopify customer identity job is missing record_id");
  }
  const recordResponse = unwrapPayload(await ctx.nex.records.get({ id: recordId }));
  const record = asRecord(recordResponse.record);
  if (asString(record.platform) !== "shopify") {
    return { projected: false, reason: "not_shopify", record_id: recordId };
  }
  if (asString(asRecord(record.metadata).family) !== "customer") {
    return { projected: false, reason: "not_customer", record_id: recordId };
  }
  const projected = await projectShopifyCustomerIdentity(ctx.nex, record);
  return { ...projected, record_id: recordId };
}
