import { createHash } from "node:crypto";
import { assertShopifyRecordFamily, shopifyRecordSourceMetadata } from "./shopify-record-family.js";

type RuntimeRow = Record<string, unknown>;

type NexIdentityClient = {
  records: {
    get(params: { id: string }): Promise<unknown>;
    get_many(params: { ids: string[] }): Promise<unknown>;
  };
  contacts: {
    observe(params: ShopifyContactObservation): Promise<unknown>;
  };
  memory: {
    evidence: {
      profiles: {
        list(params: Record<string, never>): Promise<unknown>;
        register(params: RuntimeRow): Promise<unknown>;
      };
    };
  };
  semantics: {
    apply(params: RuntimeRow): Promise<unknown>;
  };
  facets: {
    attachments: {
      get(params: { id: string }): Promise<unknown>;
      create(params: RuntimeRow): Promise<unknown>;
    };
  };
};

const CUSTOMER_FACT_PROFILE_ID = "commerce.customer.reference_fact.v1";
const CUSTOMER_OBSERVATION_PROFILE_ID = "commerce.customer.current.v1";
const CUSTOMER_PROFILE_VERSION = "1.0.0";
const CUSTOMER_PROFILE_OWNER = "@moonsleep/continuous-evidence";
const CUSTOMER_PROFILE_SOURCE_MANIFEST_SHA256 =
  "4cd81823b8380e5414d278d3f67e89fae037a20f8c31d2df29f33660048bf93c";
const CUSTOMER_FACET_DEFINITION_ID = "moonsleep.customer.v1";
const CUSTOMER_FACET_DEFINITION_VERSION = 1;
const CUSTOMER_FACET_DOMAIN_SCOPE = "moonsleep";
const CUSTOMER_FACET_ATTACHMENT_SLOT = "customer";
const CUSTOMER_PROJECTOR_VERSION = "1.0.0";

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

function requireString(row: RuntimeRow, field: string): string {
  const value = asString(row[field]);
  if (!value) {
    throw new Error(`Shopify customer identity projection requires ${field}`);
  }
  return value;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("canonical JSON does not support non-finite numbers");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const row = value as RuntimeRow;
    return `{${Object.keys(row)
      .filter((key) => row[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(row[key])}`)
      .join(",")}}`;
  }
  throw new TypeError(`canonical JSON does not support ${typeof value}`);
}

function sha256CanonicalJson(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function immutableSourceRef(record: RuntimeRow): {
  recordId: string;
  payloadSha256: string;
} {
  const recordId = requireString(record, "id");
  const payloadSha256 = requireString(record, "payload_sha256");
  if (!/^[0-9a-f]{64}$/.test(payloadSha256)) {
    throw new Error("Shopify customer immutable Record payload_sha256 is malformed");
  }
  return { recordId, payloadSha256 };
}

function profileRows(value: unknown): RuntimeRow[] {
  const payload = unwrapPayload(value);
  return Array.isArray(payload.items) ? payload.items.map(asRecord) : [];
}

const CUSTOMER_EVIDENCE_PROFILES = [
  {
    profileId: CUSTOMER_FACT_PROFILE_ID,
    elementType: "fact",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["customer_ref", "identity_state"],
      properties: {
        customer_ref: { type: "string", minLength: 1 },
        identity_state: { type: "string", enum: ["source_anchored", "reviewed"] },
      },
    },
  },
  {
    profileId: CUSTOMER_OBSERVATION_PROFILE_ID,
    elementType: "observation",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["customer_ref", "current_state", "review_state"],
      properties: {
        customer_ref: { type: "string", minLength: 1 },
        current_state: { type: "string", minLength: 1 },
        review_state: { type: "string", minLength: 1 },
      },
    },
  },
] as const;

function assertCustomerEvidenceProfile(
  item: RuntimeRow,
  profileId: string,
  elementType: "fact" | "observation",
): void {
  if (
    asString(item.profile_id) !== profileId ||
    asString(item.profile_version) !== CUSTOMER_PROFILE_VERSION ||
    asString(item.element_type) !== elementType ||
    asString(item.owner_package) !== CUSTOMER_PROFILE_OWNER ||
    asString(item.source_manifest_sha256) !== CUSTOMER_PROFILE_SOURCE_MANIFEST_SHA256 ||
    asString(item.status) !== "active"
  ) {
    throw new Error(`canonical Shopify customer evidence profile mismatch: ${profileId}`);
  }
}

async function ensureCustomerEvidenceProfiles(nex: NexIdentityClient): Promise<void> {
  for (const profile of CUSTOMER_EVIDENCE_PROFILES) {
    const registered = unwrapPayload(
      await nex.memory.evidence.profiles.register({
        profileId: profile.profileId,
        profileVersion: CUSTOMER_PROFILE_VERSION,
        elementType: profile.elementType,
        schema: profile.schema,
        ownerPackage: CUSTOMER_PROFILE_OWNER,
        sourceManifestSha256: CUSTOMER_PROFILE_SOURCE_MANIFEST_SHA256,
        compatibility: {
          compatibility_mode: "initial",
          previous_profile_version: null,
        },
      }),
    );
    assertCustomerEvidenceProfile(
      asRecord(registered.item),
      profile.profileId,
      profile.elementType,
    );
  }
  const rows = profileRows(await nex.memory.evidence.profiles.list({}));
  for (const [profileId, elementType] of [
    [CUSTOMER_FACT_PROFILE_ID, "fact"],
    [CUSTOMER_OBSERVATION_PROFILE_ID, "observation"],
  ] as const) {
    const matches = rows.filter(
      (row) =>
        asString(row.profile_id) === profileId &&
        asString(row.profile_version) === CUSTOMER_PROFILE_VERSION,
    );
    if (matches.length !== 1) {
      throw new Error(`canonical Shopify customer evidence profile mismatch: ${profileId}`);
    }
    assertCustomerEvidenceProfile(matches[0]!, profileId, elementType);
  }
}

function assertCanonicalCustomerFacet(attachment: RuntimeRow, entityId: string): void {
  const observationRefs = Array.isArray(attachment.observation_refs)
    ? attachment.observation_refs.map(asString)
    : [];
  const redactedFields = Array.isArray(attachment.redacted_fields)
    ? attachment.redacted_fields.map(asString)
    : [];
  const basis = asRecord(attachment.basis);
  const basisObservationId = asString(basis.observation_id);
  const observationReferenceIsVisible = observationRefs.includes(basisObservationId);
  const observationReferenceIsGovernedRedaction =
    observationRefs.length === 0 && redactedFields.includes("observation_refs");
  if (
    asString(attachment.facet_definition_id) !== CUSTOMER_FACET_DEFINITION_ID ||
    attachment.definition_version !== CUSTOMER_FACET_DEFINITION_VERSION ||
    asString(attachment.subject_class) !== "nex.entity" ||
    asString(attachment.subject_id) !== entityId ||
    asString(attachment.domain_scope) !== CUSTOMER_FACET_DOMAIN_SCOPE ||
    asString(attachment.attachment_slot) !== CUSTOMER_FACET_ATTACHMENT_SLOT ||
    attachment.instance_key != null ||
    asString(attachment.lifecycle_state) !== "active" ||
    asString(attachment.privacy_class) !== "restricted" ||
    asString(basis.basis_type) !== "accepted_observation" ||
    !basisObservationId ||
    (!observationReferenceIsVisible && !observationReferenceIsGovernedRedaction) ||
    Object.keys(asRecord(attachment.values)).length !== 0 ||
    (Array.isArray(attachment.relationships) ? attachment.relationships.length : -1) !== 0
  ) {
    throw new Error("active MoonSleep Customer Facet differs from the canonical v1 attachment");
  }
}

function customerFacetAttachmentId(canonicalEntityId: string): string {
  return `facet-attachment:moonsleep.customer.v1:${sha256CanonicalJson({
    facet_definition_id: CUSTOMER_FACET_DEFINITION_ID,
    canonical_entity_id: canonicalEntityId,
    domain_scope: CUSTOMER_FACET_DOMAIN_SCOPE,
    attachment_slot: CUSTOMER_FACET_ATTACHMENT_SLOT,
  }).slice(0, 32)}`;
}

function isFacetAttachmentNotFound(error: unknown): boolean {
  const message = String(error);
  return message.includes("Facet ") && message.includes(" not found");
}

type PreparedCustomerIdentity = {
  record: RuntimeRow;
  observation: ShopifyContactObservation;
  observed: RuntimeRow;
  entity: RuntimeRow;
  contact: RuntimeRow;
  canonicalEntityId: string;
};

async function existingCustomerRole(
  nex: NexIdentityClient,
  canonicalEntityId: string,
): Promise<RuntimeRow | null> {
  const attachmentId = customerFacetAttachmentId(canonicalEntityId);
  try {
    const exactPayload = unwrapPayload(await nex.facets.attachments.get({ id: attachmentId }));
    const existing = asRecord(
      exactPayload.attachment ?? exactPayload.item ?? exactPayload.value,
    );
    assertCanonicalCustomerFacet(existing, canonicalEntityId);
    return {
      customer_observation_outcome: "adopted_existing",
      customer_observation_id: asString(asRecord(existing.basis).observation_id),
      customer_facet_outcome: "adopted_existing",
      customer_facet_attachment_id: requireString(existing, "id"),
    };
  } catch (error) {
    if (!isFacetAttachmentNotFound(error)) {
      throw error;
    }
  }
  return null;
}

function semanticCustomerRoleInput(customers: PreparedCustomerIdentity[]): RuntimeRow {
  const ordered = [...customers].sort((left, right) =>
    immutableSourceRef(left.record).recordId.localeCompare(immutableSourceRef(right.record).recordId),
  );
  const cohortKey = sha256CanonicalJson(
    ordered.map((customer) => immutableSourceRef(customer.record)),
  );
  const records: RuntimeRow = {};
  const facts: RuntimeRow[] = [];
  const observations: RuntimeRow[] = [];
  const objects: RuntimeRow[] = [];
  ordered.forEach((customer, index) => {
    const recordRef = `customer${index}`;
    const factRef = `fact${index}`;
    const observationRef = `observation${index}`;
    records[recordRef] = immutableSourceRef(customer.record);
    facts.push({
      ref: factRef,
      profileId: CUSTOMER_FACT_PROFILE_ID,
      profileVersion: CUSTOMER_PROFILE_VERSION,
      subject: { subjectType: "commerce_customer", subjectId: customer.observation.contact_id },
      payload: {
        customer_ref: customer.observation.contact_id,
        identity_state: "source_anchored",
      },
      summary: `Shopify identifies ${customer.observation.contact_id} as a MoonSleep customer.`,
      evidence: [recordRef],
      asOf: customer.observation.observed_at,
    });
    observations.push({
      ref: observationRef,
      profileId: CUSTOMER_OBSERVATION_PROFILE_ID,
      profileVersion: CUSTOMER_PROFILE_VERSION,
      headKey: `moonsleep.commerce:shopify-customer:${customer.observation.space_id}:${customer.observation.contact_id}`,
      subject: { subjectType: "commerce_customer", subjectId: customer.observation.contact_id },
      facts: [{ ref: factRef, disposition: "supports" }],
      payload: {
        customer_ref: customer.observation.contact_id,
        current_state: "customer",
        review_state: "source_anchored",
      },
      summary: `${customer.observation.contact_id} has the MoonSleep customer role.`,
      previous: null,
      asOf: customer.observation.observed_at,
    });
    objects.push({
      ref: `facet${index}`,
      objectType: "facet_attachment",
      id: customerFacetAttachmentId(customer.canonicalEntityId),
      attributes: {
        facetDefinitionId: CUSTOMER_FACET_DEFINITION_ID,
        definitionVersion: CUSTOMER_FACET_DEFINITION_VERSION,
        subject: { subjectClass: "nex.entity", subjectId: customer.canonicalEntityId },
        domainScope: CUSTOMER_FACET_DOMAIN_SCOPE,
        attachmentSlot: CUSTOMER_FACET_ATTACHMENT_SLOT,
        effectiveFrom: customer.observation.observed_at,
        values: {},
        observationRefs: [observationRef],
        privacyClass: "restricted",
      },
      basisObservation: observationRef,
    });
  });
  return {
    idempotencyKey: `moonsleep-commerce:shopify-customers:${cohortKey}:v1`,
    actorRef: `job:moonsleep-commerce.shopify-customer-identity@${CUSTOMER_PROJECTOR_VERSION}`,
    policyRef: "policy:moonsleep-commerce-shopify-customer-role-v1",
    records,
    episode: {
      ref: "shopifyCustomerCohort",
      title: `Shopify customer role evidence cohort (${ordered.length})`,
      purpose: "Project immutable Shopify customer Records into canonical customer-role evidence",
      metadata: { platform: "shopify", customers: ordered.length },
    },
    facts,
    observations,
    objects,
  };
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

export function buildShopifyCustomerObservation(
  recordValue: unknown,
  options: { allowLegacyText?: boolean } = {},
): ShopifyContactObservation {
  const record = asRecord(recordValue);
  const sourceContract = assertShopifyRecordFamily(record, "customer", options);
  const metadata = shopifyRecordSourceMetadata(record);
  const payload = asRecord(record.payload);
  const sourceMetadata = asRecord(payload.source_metadata);
  const providerPayload = asRecord(sourceMetadata.provider_payload);
  const row = asRecord(metadata.row);
  const providerIds = asRecord(metadata.provider_ids);
  const shopDomain = requireString(row, "shop_domain");
  if (asString(record.source_space_id) !== shopDomain) {
    throw new Error("Shopify customer record space does not match the normalized shop domain");
  }
  const customerGid = requireString(row, "customer_gid");
  const sourceObject =
    sourceContract === "canonical"
      ? exactSourceObject(providerPayload)
      : {
          id: customerGid,
          displayName: asString(row.display_name),
          firstName: asString(row.first_name),
          lastName: asString(row.last_name),
        };
  if (
    asString(providerIds.customer_gid) !== customerGid ||
    asString(sourceObject.id) !== customerGid
  ) {
    throw new Error("Shopify customer identity anchors disagree");
  }
  const sourceRef = immutableSourceRef(record);
  const sourceObservationId = `${sourceRef.recordId}:${sourceRef.payloadSha256}`;
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
  options: { allowLegacyText?: boolean } = {},
): Promise<RuntimeRow> {
  const [projected] = await projectShopifyCustomerIdentities(nex, [record], options);
  return projected!;
}

async function prepareCustomerIdentity(
  nex: NexIdentityClient,
  recordValue: unknown,
  options: { allowLegacyText?: boolean },
): Promise<PreparedCustomerIdentity> {
  const record = asRecord(recordValue);
  const observation = buildShopifyCustomerObservation(record, options);
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
  return { record, observation, observed, entity, contact, canonicalEntityId };
}

async function applyCustomerRoles(
  nex: NexIdentityClient,
  customers: PreparedCustomerIdentity[],
): Promise<Map<string, RuntimeRow>> {
  const roles = new Map<string, RuntimeRow>();
  const inspected = await mapWithConcurrency(customers, 32, async (customer) => ({
    customer,
    existing: await existingCustomerRole(nex, customer.canonicalEntityId),
  }));
  const missing: PreparedCustomerIdentity[] = [];
  for (const { customer, existing } of inspected) {
    const recordId = immutableSourceRef(customer.record).recordId;
    if (existing) roles.set(recordId, existing);
    else missing.push(customer);
  }
  if (missing.length === 0) return roles;

  await ensureCustomerEvidenceProfiles(nex);
  const ordered = [...missing].sort((left, right) =>
    immutableSourceRef(left.record).recordId.localeCompare(immutableSourceRef(right.record).recordId),
  );
  const applied = unwrapPayload(await nex.semantics.apply(semanticCustomerRoleInput(ordered)));
  if (asString(applied.status) !== "committed" || applied.actionAuthority !== false) {
    throw new Error("Nex did not return a terminal non-authoritative semantic customer receipt");
  }
  const observations = asRecord(applied.observations);
  const objects = asRecord(applied.objects);
  ordered.forEach((customer, index) => {
    const observation = asRecord(observations[`observation${index}`]);
    const object = asRecord(objects[`facet${index}`]);
    const customerObservationId = requireString(observation, "observationId");
    const attachmentId = requireString(object, "objectId");
    const expectedAttachmentId = customerFacetAttachmentId(customer.canonicalEntityId);
    if (attachmentId !== expectedAttachmentId || asString(object.objectType) !== "facet_attachment") {
      throw new Error("Nex semantic customer receipt returned a different canonical Facet");
    }
    roles.set(immutableSourceRef(customer.record).recordId, {
      customer_observation_outcome: observation.reused === true ? "replayed" : "accepted",
      customer_observation_id: customerObservationId,
      customer_facet_outcome: object.reused === true ? "adopted_existing" : "attached",
      customer_facet_attachment_id: attachmentId,
    });
  });
  return roles;
}

export async function projectShopifyCustomerIdentities(
  nex: NexIdentityClient,
  records: unknown[],
  options: { allowLegacyText?: boolean } = {},
): Promise<RuntimeRow[]> {
  const customers = await mapWithConcurrency(records, 32, (record) =>
    prepareCustomerIdentity(nex, record, options),
  );
  const roles = await applyCustomerRoles(nex, customers);
  return customers.map(({ record, observation, observed, entity, contact, canonicalEntityId }) => {
    const customerRole = roles.get(immutableSourceRef(record).recordId);
    if (!customerRole) throw new Error("Nex omitted a Shopify customer semantic receipt");
    const observedEntityId = requireString(entity, "id");
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
      tag_contract: "compatibility_hint",
      ...customerRole,
    };
  });
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

export default async function shopifyCustomerIdentityJob(
  ctx: ShopifyCustomerIdentityContext,
): Promise<RuntimeRow> {
  const events = Array.isArray(ctx.input.events) ? ctx.input.events.map(asRecord) : [];
  if (events.length > 0) {
    const startedAt = performance.now();
    const recordIds = events.map((event) => extractRecordId({ event }));
    if (recordIds.some((recordId) => !recordId) || new Set(recordIds).size !== recordIds.length) {
      throw new Error("Shopify customer identity batch contains missing or duplicate record_id");
    }
    const response = unwrapPayload(await ctx.nex.records.get_many({ ids: recordIds }));
    const records = Array.isArray(response.records) ? response.records.map(asRecord) : [];
    if (records.length !== recordIds.length) {
      throw new Error("Shopify customer identity batch did not load every immutable Record");
    }
    const byId = new Map(records.map((record) => [asString(record.id), record]));
    const customers = recordIds
      .map((recordId) => ({ recordId, record: byId.get(recordId) ?? {} }))
      .filter(
        ({ record }) =>
          asString(record.platform) === "shopify" &&
          asString(shopifyRecordSourceMetadata(record).family) === "customer",
      );
    const loadedAt = performance.now();
    await projectShopifyCustomerIdentities(
      ctx.nex,
      customers.map(({ record }) => record),
    );
    const finishedAt = performance.now();
    return {
      projected: true,
      records: events.length,
      customers: customers.length,
      ignored: events.length - customers.length,
      timing_ms: {
        load: Math.round(loadedAt - startedAt),
        customers: Math.round(finishedAt - loadedAt),
        total: Math.round(finishedAt - startedAt),
      },
    };
  }
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
  if (asString(shopifyRecordSourceMetadata(record).family) !== "customer") {
    return { projected: false, reason: "not_customer", record_id: recordId };
  }
  const projected = await projectShopifyCustomerIdentity(ctx.nex, record);
  return { ...projected, record_id: recordId };
}
