import { createHash } from "node:crypto";
import {
  assertShopifyRecordFamily,
  shopifyRecordSourceMetadata,
} from "./shopify-record-family.js";

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
  };
  memory: {
    evidence: {
      profiles: {
        list(params: Record<string, never>): Promise<unknown>;
        register(params: RuntimeRow): Promise<unknown>;
      };
      episodes: {
        create(params: RuntimeRow): Promise<unknown>;
      };
      facts: {
        create_from_episode(params: RuntimeRow): Promise<unknown>;
      };
      observations: {
        head: {
          get(params: { headKey: string }): Promise<unknown>;
        };
        commit(params: RuntimeRow): Promise<unknown>;
      };
    };
    sets: {
      create(params: RuntimeRow): Promise<unknown>;
      members: {
        add(params: RuntimeRow): Promise<unknown>;
      };
      seal(params: RuntimeRow): Promise<unknown>;
    };
  };
  facets: {
    attachments: {
      get(params: { id: string }): Promise<unknown>;
      list(params: RuntimeRow): Promise<unknown>;
      create(params: RuntimeRow): Promise<unknown>;
    };
  };
};

const CUSTOMER_FACT_PROFILE_ID = "commerce.customer.reference_fact.v1";
const CUSTOMER_OBSERVATION_PROFILE_ID = "commerce.customer.current.v1";
const CUSTOMER_SET_PROFILE_ID = "commerce.customer.evidence_set.v1";
const CUSTOMER_PROFILE_VERSION = "1.0.0";
const CUSTOMER_PROFILE_OWNER = "@moonsleep/continuous-evidence";
const CUSTOMER_PROFILE_SOURCE_MANIFEST_SHA256 =
  "4cd81823b8380e5414d278d3f67e89fae037a20f8c31d2df29f33660048bf93c";
const CUSTOMER_RESOLVER_ID = "commerce-customer-current";
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

function activeCustomerFacetRows(value: unknown): RuntimeRow[] {
  const payload = unwrapPayload(value);
  const rows = Array.isArray(payload.items) ? payload.items.map(asRecord) : [];
  if (rows.length > 1 || payload.next_cursor) {
    throw new Error("canonical Entity has more than one active MoonSleep Customer Facet");
  }
  return rows;
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

function isFacetAttachmentCardinalityConflict(error: unknown): boolean {
  const reasonCode = asString(asRecord(error).reasonCode);
  const message = String(error);
  return (
    reasonCode === "facet_attachment_cardinality_conflict" ||
    message.includes("facet_attachment_cardinality_conflict") ||
    message.includes("canonical subject already has an active attachment in this slot")
  );
}

async function listActiveCustomerFacets(
  nex: NexIdentityClient,
  entityId: string,
): Promise<RuntimeRow[]> {
  return activeCustomerFacetRows(
    await nex.facets.attachments.list({
      subject_class: "nex.entity",
      subject_id: entityId,
      facet_definition_id: CUSTOMER_FACET_DEFINITION_ID,
      lifecycle_state: "active",
      limit: 2,
    }),
  );
}

async function ensureCustomerRoleEvidence(params: {
  nex: NexIdentityClient;
  record: RuntimeRow;
  observation: ShopifyContactObservation;
  canonicalEntityId: string;
}): Promise<RuntimeRow> {
  const existingFacets = await listActiveCustomerFacets(params.nex, params.canonicalEntityId);
  if (existingFacets[0]) {
    assertCanonicalCustomerFacet(existingFacets[0], params.canonicalEntityId);
    return {
      customer_observation_outcome: "adopted_existing",
      customer_observation_id: asString(asRecord(existingFacets[0].basis).observation_id),
      customer_facet_outcome: "adopted_existing",
      customer_facet_attachment_id: requireString(existingFacets[0], "id"),
    };
  }

  await ensureCustomerEvidenceProfiles(params.nex);
  const sourceRef = immutableSourceRef(params.record);
  const keyPrefix = `moonsleep-commerce:shopify-customer:${sourceRef.recordId}`;
  const episodePayload = unwrapPayload(
    await params.nex.memory.evidence.episodes.create({
      title: `Shopify customer role evidence ${params.observation.contact_id}`,
      purpose:
        "Project one immutable Shopify customer Record into canonical customer-role evidence",
      sourceRecordRefs: [sourceRef],
      metadata: {
        platform: "shopify",
        shop_domain: params.observation.space_id,
        customer_ref: params.observation.contact_id,
      },
      sealedBy: "job:moonsleep-commerce.shopify-customer-identity",
      idempotencyKey: `${keyPrefix}:episode:v1`,
    }),
  );
  const episode = asRecord(episodePayload.item);
  const episodeId = requireString(episode, "episode_id");

  const factPayload = unwrapPayload(
    await params.nex.memory.evidence.facts.create_from_episode({
      profileId: CUSTOMER_FACT_PROFILE_ID,
      profileVersion: CUSTOMER_PROFILE_VERSION,
      payload: {
        customer_ref: params.observation.contact_id,
        identity_state: "source_anchored",
      },
      summary: `Shopify identifies ${params.observation.contact_id} as a MoonSleep customer.`,
      subjectType: "commerce_customer",
      subjectRef: params.observation.contact_id,
      producerId: CUSTOMER_RESOLVER_ID,
      producerVersion: CUSTOMER_PROJECTOR_VERSION,
      extractionPolicyRef: "policy:moonsleep-commerce-shopify-customer-role-v1",
      episodeId,
      sourceRecordRefs: [sourceRef],
      asOf: params.observation.observed_at,
      idempotencyKey: `${keyPrefix}:fact:v1`,
    }),
  );
  const fact = asRecord(asRecord(factPayload.item).fact);
  const factId = requireString(fact, "id");

  const setPayload = unwrapPayload(
    await params.nex.memory.sets.create({
      definitionId: "evidence_set_v1",
      idempotencyKey: `${keyPrefix}:set:v1`,
      evidenceScope: {
        domain: "moonsleep.commerce",
        purpose: CUSTOMER_SET_PROFILE_ID,
        resolverId: CUSTOMER_RESOLVER_ID,
        resolverPolicyVersion: CUSTOMER_PROFILE_VERSION,
        targetProfileId: CUSTOMER_OBSERVATION_PROFILE_ID,
        targetProfileVersion: CUSTOMER_PROFILE_VERSION,
        allowedFactProfiles: [
          { profileId: CUSTOMER_FACT_PROFILE_ID, profileVersion: CUSTOMER_PROFILE_VERSION },
        ],
        sourceManifestSha256: CUSTOMER_PROFILE_SOURCE_MANIFEST_SHA256,
      },
    }),
  );
  const setId = requireString(asRecord(setPayload.set), "id");
  await params.nex.memory.sets.members.add({
    setId,
    memberType: "element",
    memberId: factId,
    position: 0,
  });
  await params.nex.memory.sets.seal({
    setId,
    sealedBy: "job:moonsleep-commerce.shopify-customer-identity",
  });

  const headKey = `moonsleep.commerce:shopify-customer:${params.observation.space_id}:${params.observation.contact_id}`;
  const headPayload = unwrapPayload(
    await params.nex.memory.evidence.observations.head.get({ headKey }),
  );
  const head = asRecord(headPayload.item);
  const headObservation = asRecord(head.observation);
  let expectedHeadId: string | null = asString(head.head_element_id) || null;
  if (
    asString(asRecord(headObservation.metadata).input_set_id) === setId &&
    asString(headObservation.id)
  ) {
    expectedHeadId = asString(headObservation.parent_id) || null;
  }

  const commitPayload = unwrapPayload(
    await params.nex.memory.evidence.observations.commit({
      headKey,
      expectedHeadId,
      inputSetId: setId,
      profileId: CUSTOMER_OBSERVATION_PROFILE_ID,
      profileVersion: CUSTOMER_PROFILE_VERSION,
      payload: {
        customer_ref: params.observation.contact_id,
        current_state: "customer",
        review_state: "source_anchored",
      },
      summary: `${params.observation.contact_id} has the MoonSleep customer role.`,
      subjectType: "commerce_customer",
      subjectRef: params.observation.contact_id,
      factDispositions: [{ factElementId: factId, disposition: "supports" }],
      resolverId: CUSTOMER_RESOLVER_ID,
      resolverVersion: CUSTOMER_PROJECTOR_VERSION,
      resolverPolicyVersion: CUSTOMER_PROFILE_VERSION,
      actorRef: "job:moonsleep-commerce.shopify-customer-identity",
      policyRef: "policy:moonsleep-commerce-shopify-customer-role-v1",
      idempotencyKey: `${keyPrefix}:observation:v1`,
      asOf: params.observation.observed_at,
    }),
  );
  const committed = asRecord(commitPayload.item);
  const customerObservation = asRecord(committed.observation);
  const commitReceipt = asRecord(committed.receipt);
  const customerObservationId = requireString(customerObservation, "id");
  const commitReceiptId = requireString(commitReceipt, "receipt_id");
  const basis = {
    basis_type: "accepted_observation",
    observation_id: customerObservationId,
    commit_receipt_id: commitReceiptId,
    commit_receipt_sha256: sha256CanonicalJson(commitReceipt),
  };
  const attachmentId = `facet-attachment:moonsleep.customer.v1:${sha256CanonicalJson({
    facet_definition_id: CUSTOMER_FACET_DEFINITION_ID,
    canonical_entity_id: params.canonicalEntityId,
    domain_scope: CUSTOMER_FACET_DOMAIN_SCOPE,
    attachment_slot: CUSTOMER_FACET_ATTACHMENT_SLOT,
  }).slice(0, 32)}`;

  let attachmentPayload: RuntimeRow;
  try {
    attachmentPayload = unwrapPayload(
      await params.nex.facets.attachments.create({
        id: attachmentId,
        facet_definition_id: CUSTOMER_FACET_DEFINITION_ID,
        definition_version: CUSTOMER_FACET_DEFINITION_VERSION,
        subject_class: "nex.entity",
        subject_id: params.canonicalEntityId,
        domain_scope: CUSTOMER_FACET_DOMAIN_SCOPE,
        attachment_slot: CUSTOMER_FACET_ATTACHMENT_SLOT,
        effective_from: params.observation.observed_at,
        values: {},
        relationships: [],
        observation_refs: [customerObservationId],
        privacy_class: "restricted",
        basis,
        idempotency_key: `${attachmentId}:create`,
      }),
    );
  } catch (error) {
    if (!isFacetAttachmentCardinalityConflict(error)) {
      throw error;
    }
    const raced = await listActiveCustomerFacets(params.nex, params.canonicalEntityId);
    let existing = raced[0];
    if (!existing) {
      try {
        const exact = unwrapPayload(
          await params.nex.facets.attachments.get({ id: attachmentId }),
        );
        existing = asRecord(exact.attachment ?? exact.item ?? exact.value);
      } catch {
        throw error;
      }
    }
    assertCanonicalCustomerFacet(existing, params.canonicalEntityId);
    return {
      customer_observation_outcome: commitPayload.reused === true ? "replayed" : "accepted",
      customer_observation_id: customerObservationId,
      customer_facet_outcome: "adopted_existing",
      customer_facet_attachment_id: requireString(existing, "id"),
    };
  }
  const attachment = asRecord(
    attachmentPayload.value ?? attachmentPayload.item ?? attachmentPayload.attachment,
  );
  assertCanonicalCustomerFacet(attachment, params.canonicalEntityId);
  return {
    customer_observation_outcome: commitPayload.reused === true ? "replayed" : "accepted",
    customer_observation_id: customerObservationId,
    customer_facet_outcome: attachmentPayload.replayed === true ? "adopted_existing" : "attached",
    customer_facet_attachment_id: requireString(attachment, "id"),
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
  const sourceObservationId = requireString(record, "id");
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

  const resolution = unwrapPayload(await nex.entities.resolve({ entity_id: observedEntityId }));
  if (asString(resolution.canonical_id) !== canonicalEntityId) {
    throw new Error("Nex canonical entity resolution disagrees with contact observation");
  }

  const customerRole = await ensureCustomerRoleEvidence({
    nex,
    record: asRecord(record),
    observation,
    canonicalEntityId,
  });

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
  if (asString(shopifyRecordSourceMetadata(record).family) !== "customer") {
    return { projected: false, reason: "not_customer", record_id: recordId };
  }
  const projected = await projectShopifyCustomerIdentity(ctx.nex, record);
  return { ...projected, record_id: recordId };
}
