import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, unknown>;

export type SourceRevisionRefV1 = {
  provider: "gmail" | "alibaba" | "imessage";
  adapter_package_id: string;
  adapter_package_version: string;
  connection_id: string;
  provider_account_id: string;
  provider_record_id: string;
  provider_revision_id: string | null;
  source_logical_record_id: string;
  source_revision_sha256: string;
  payload_sha256: string;
  source_at: string;
  captured_at: string;
  fragment_refs: string[];
  attachment_refs: string[];
  source_run_receipt_ref: string;
  provider_read_authority: true;
  provider_write_authority: false;
};

export type CanonicalPartnerManifest = {
  contract_id: "moonsleep.partner.canonical-profiles.v1";
  contract_version: 1;
  domain_id: "moonsleep.partner";
  owner_package: "moonsleep-partner-desk";
  owner_package_baseline_version: "0.2.1";
  activation_state: "dormant_source_registration";
  authority_ceiling: JsonObject;
  stable_subjects: Array<{
    subject_type: string;
    identity_fields: string[];
  }>;
  fact_profiles: Array<{
    profile_id: string;
    profile_version: "1.0.0";
    profile_class: "fact";
    fact_type: string;
    subject_type: string;
    required_source_revision_refs: number;
    schema: JsonObject;
  }>;
  observation_profiles: Array<{
    profile_id: string;
    profile_version: "1.0.0";
    profile_class: "observation";
    observation_type: string;
    subject_type: string;
    head_key_fields: string[];
    schema: JsonObject;
  }>;
  sealed_set_profiles: Array<{
    set_profile_id: string;
    core_definition_id: "evidence_set_v1";
    member_type: "fact_element";
    purpose: string;
    resolver_id: string;
    resolver_policy_version: string;
    allowed_fact_profiles: string[];
    target_observation_profiles: string[];
    identity_fields: string[];
  }>;
  core_contract_requirements: Array<{
    requirement_id: string;
    capability: string;
  }>;
};

export type SealedSetDescriptor = {
  set_profile_id: string;
  member_count: number;
  member_ids: string[];
  member_digest: string;
  seal_identity: string;
};

export type CanonicalFactCandidate = {
  fact_id: string;
  fact_profile_id: string;
  fact_profile_version: "1.0.0";
  fact_type: string;
  subject_reference: string;
  typed_payload: JsonObject;
  payload_sha256: string;
  source_revision_refs: SourceRevisionRefV1[];
  producer_package: "moonsleep-partner-desk";
  producer_version: string;
  source_manifest_sha256: string;
  review_state: "proposed" | "reviewed";
};

const SHA256 = /^[0-9a-f]{64}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const PROHIBITED_FIELD = "kind";
const EXPECTED_FACT_PROFILES = [
  "moonsleep.partner.communication-classification.v1",
  "moonsleep.partner.open-loop-signal.v1",
  "moonsleep.partner.structured-claim.v1",
  "moonsleep.partner.source-coverage.v1",
  "moonsleep.partner.workspace-admission.v1",
] as const;
const EXPECTED_OBSERVATION_PROFILES = [
  "moonsleep.partner.workspace-state.v1",
  "moonsleep.partner.open-loop-state.v1",
  "moonsleep.partner.source-coverage-state.v1",
] as const;
const EXPECTED_SEALED_SET_PROFILES = [
  "moonsleep.partner.extraction-source-set.v1",
  "moonsleep.partner.resolver-fact-set.v1",
  "moonsleep.partner.comparison-set.v1",
] as const;
const EXPECTED_CORE_REQUIREMENTS = [
  "CORE-01",
  "CORE-02",
  "CORE-03",
  "CORE-04",
  "CORE-05",
  "CORE-06",
] as const;

export const DEFAULT_CANONICAL_MANIFEST_PATH = fileURLToPath(
  new URL("../contracts/partner-canonical-profiles.v1.json", import.meta.url),
);

function object(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as JsonObject;
}

function text(value: unknown, field: string, maximum = 1024): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    Buffer.byteLength(value, "utf8") > maximum
  ) {
    throw new Error(`${field} is invalid`);
  }
  return value;
}

function exactUtc(value: unknown, field: string): string {
  const parsed = text(value, field, 64);
  if (!ISO_UTC.test(parsed) || Number.isNaN(Date.parse(parsed))) {
    throw new Error(`${field} must be an exact UTC timestamp`);
  }
  return parsed;
}

function uniqueStrings(value: unknown, field: string, maximum = 10_000): string[] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new Error(`${field} must be a bounded array`);
  }
  const parsed = value.map((entry, index) => text(entry, `${field}[${index}]`, 1024));
  if (new Set(parsed).size !== parsed.length) {
    throw new Error(`${field} contains duplicates`);
  }
  return parsed;
}

function exactMembers<T extends string>(
  actual: Iterable<string>,
  expected: readonly T[],
  field: string,
): void {
  const left = [...actual].sort();
  const right = [...expected].sort();
  if (canonicalJson(left) !== canonicalJson(right)) {
    throw new Error(`${field} does not match the sealed design`);
  }
}

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") {
    if (typeof value === "number" && !Number.isSafeInteger(value) && Number.isInteger(value)) {
      throw new Error("unsafe integer must be represented as an exact string");
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error("non-finite number is invalid");
    }
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as JsonObject)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function assertNoProhibitedSchemaField(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoProhibitedSchemaField(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value as JsonObject)) {
    if (key === PROHIBITED_FIELD) {
      throw new Error(`${path}.${key} is prohibited`);
    }
    assertNoProhibitedSchemaField(nested, `${path}.${key}`);
  }
}

export function loadCanonicalPartnerManifest(
  manifestPath = DEFAULT_CANONICAL_MANIFEST_PATH,
): CanonicalPartnerManifest {
  const raw = readFileSync(manifestPath, "utf8");
  if (!raw.endsWith("\n")) throw new Error("canonical manifest must end with one newline");
  const parsed = JSON.parse(raw) as CanonicalPartnerManifest;
  validateCanonicalPartnerManifest(parsed);
  return parsed;
}

export function validateCanonicalPartnerManifest(
  manifest: CanonicalPartnerManifest,
): void {
  assertNoProhibitedSchemaField(manifest);
  if (
    manifest.contract_id !== "moonsleep.partner.canonical-profiles.v1" ||
    manifest.contract_version !== 1 ||
    manifest.domain_id !== "moonsleep.partner" ||
    manifest.owner_package !== "moonsleep-partner-desk" ||
    manifest.owner_package_baseline_version !== "0.2.1" ||
    manifest.activation_state !== "dormant_source_registration"
  ) {
    throw new Error("canonical manifest identity is invalid");
  }

  const authority = object(manifest.authority_ceiling, "authority_ceiling");
  for (const field of [
    "provider_read",
    "provider_write",
    "identity_merge",
    "external_domain_write",
    "draft_or_send",
  ]) {
    if (authority[field] !== false) {
      throw new Error(`authority_ceiling.${field} must remain false`);
    }
  }

  exactMembers(
    manifest.fact_profiles.map((profile) => profile.profile_id),
    EXPECTED_FACT_PROFILES,
    "fact_profiles",
  );
  exactMembers(
    manifest.observation_profiles.map((profile) => profile.profile_id),
    EXPECTED_OBSERVATION_PROFILES,
    "observation_profiles",
  );
  exactMembers(
    manifest.sealed_set_profiles.map((profile) => profile.set_profile_id),
    EXPECTED_SEALED_SET_PROFILES,
    "sealed_set_profiles",
  );
  exactMembers(
    manifest.core_contract_requirements.map((requirement) => requirement.requirement_id),
    EXPECTED_CORE_REQUIREMENTS,
    "core_contract_requirements",
  );

  for (const profile of manifest.fact_profiles) {
    if (
      profile.profile_class !== "fact" ||
      profile.profile_version !== "1.0.0" ||
      profile.required_source_revision_refs < 1
    ) {
      throw new Error(`${profile.profile_id} fact profile identity is invalid`);
    }
    assertNoProhibitedSchemaField(profile.schema, `${profile.profile_id}.schema`);
  }
  for (const profile of manifest.observation_profiles) {
    if (
      profile.profile_class !== "observation" ||
      profile.profile_version !== "1.0.0" ||
      profile.head_key_fields.length < 3 ||
      new Set(profile.head_key_fields).size !== profile.head_key_fields.length ||
      !profile.head_key_fields.includes("workspace_id") ||
      !profile.head_key_fields.includes("observation_profile_id")
    ) {
      throw new Error(`${profile.profile_id} observation profile identity is invalid`);
    }
    assertNoProhibitedSchemaField(profile.schema, `${profile.profile_id}.schema`);
  }
  const factProfileIds = new Set(manifest.fact_profiles.map((profile) => profile.profile_id));
  const observationProfileIds = new Set(
    manifest.observation_profiles.map((profile) => profile.profile_id),
  );
  for (const profile of manifest.sealed_set_profiles) {
    if (
      profile.core_definition_id !== "evidence_set_v1" ||
      profile.member_type !== "fact_element" ||
      !profile.purpose ||
      !profile.resolver_id ||
      profile.resolver_policy_version !== "1.0.0" ||
      profile.allowed_fact_profiles.length === 0 ||
      profile.target_observation_profiles.length === 0 ||
      profile.allowed_fact_profiles.some((profileId) => !factProfileIds.has(profileId)) ||
      profile.target_observation_profiles.some(
        (profileId) => !observationProfileIds.has(profileId),
      )
    ) {
      throw new Error(`${profile.set_profile_id} sealed-set profile identity is invalid`);
    }
  }
}

function validateStringSchema(schema: JsonObject, value: unknown, field: string): void {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  if (typeof schema.minLength === "number" && value.length < schema.minLength) {
    throw new Error(`${field} is shorter than minLength`);
  }
  if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
    throw new Error(`${field} exceeds maxLength`);
  }
  if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
    throw new Error(`${field} does not match its pattern`);
  }
  if (schema.format === "date-time") exactUtc(value, field);
}

function validateArraySchema(schema: JsonObject, value: unknown, field: string): void {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  if (typeof schema.minItems === "number" && value.length < schema.minItems) {
    throw new Error(`${field} has too few entries`);
  }
  if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
    throw new Error(`${field} has too many entries`);
  }
  if (schema.uniqueItems === true && new Set(value.map(canonicalJson)).size !== value.length) {
    throw new Error(`${field} contains duplicates`);
  }
  if (schema.items) {
    value.forEach((entry, index) => validateJsonSchema(object(schema.items, `${field}.items`), entry, `${field}[${index}]`));
  }
}

export function validateJsonSchema(
  schema: JsonObject,
  value: unknown,
  field = "payload",
): void {
  const allowedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
  const actualType =
    value === null ? "null" :
    Array.isArray(value) ? "array" :
    Number.isInteger(value) ? "integer" :
    typeof value;
  if (!allowedTypes.includes(actualType)) {
    throw new Error(`${field} must have type ${allowedTypes.join(" or ")}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => canonicalJson(entry) === canonicalJson(value))) {
    throw new Error(`${field} is outside its enum`);
  }

  if (actualType === "string") {
    validateStringSchema(schema, value, field);
  } else if (actualType === "integer") {
    if (!Number.isSafeInteger(value)) throw new Error(`${field} must be a safe integer`);
    if (typeof schema.minimum === "number" && (value as number) < schema.minimum) {
      throw new Error(`${field} is below minimum`);
    }
    if (typeof schema.maximum === "number" && (value as number) > schema.maximum) {
      throw new Error(`${field} exceeds maximum`);
    }
  } else if (actualType === "array") {
    validateArraySchema(schema, value, field);
  } else if (actualType === "object") {
    const valueObject = object(value, field);
    const properties = object(schema.properties ?? {}, `${field}.schema.properties`);
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const requiredField of required) {
      if (typeof requiredField !== "string" || !(requiredField in valueObject)) {
        throw new Error(`${field}.${String(requiredField)} is required`);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(valueObject)) {
        if (!(key in properties)) throw new Error(`${field}.${key} is not allowed`);
      }
    }
    for (const [key, nested] of Object.entries(valueObject)) {
      if (key in properties) {
        validateJsonSchema(object(properties[key], `${field}.${key}.schema`), nested, `${field}.${key}`);
      }
    }
  }
}

export function validateProfilePayload(
  manifest: CanonicalPartnerManifest,
  profileId: string,
  payload: JsonObject,
): void {
  const profile = [...manifest.fact_profiles, ...manifest.observation_profiles]
    .find((entry) => entry.profile_id === profileId);
  if (!profile) throw new Error(`unknown Partner profile ${profileId}`);
  validateJsonSchema(profile.schema, payload, profileId);

  if (
    profileId === "moonsleep.partner.source-coverage.v1" &&
    payload.coverage_disposition === "open_loop_evidence" &&
    Array.isArray(payload.candidate_open_loop_ids) &&
    payload.candidate_open_loop_ids.length === 0
  ) {
    throw new Error("open_loop_evidence requires at least one open-loop reference");
  }
  if (
    profileId === "moonsleep.partner.source-coverage.v1" &&
    payload.coverage_disposition !== "open_loop_evidence" &&
    Array.isArray(payload.candidate_open_loop_ids) &&
    payload.candidate_open_loop_ids.length > 0
  ) {
    throw new Error("non-loop coverage cannot carry open-loop references");
  }
  if (
    profileId === "moonsleep.partner.workspace-admission.v1" &&
    !["exact_provider_anchor", "operator_review"].includes(String(payload.decision_origin)) &&
    payload.requires_human_review !== true
  ) {
    throw new Error("unreviewed workspace admission must require human review");
  }
  if (
    profileId === "moonsleep.partner.open-loop-state.v1" &&
    payload.semantic_lifecycle === "resolved" &&
    Array.isArray(payload.closure_evidence_revisions) &&
    payload.closure_evidence_revisions.length === 0
  ) {
    throw new Error("resolved Partner loop requires closure evidence");
  }
  if (
    profileId === "moonsleep.partner.open-loop-state.v1" &&
    payload.semantic_lifecycle !== "resolved" &&
    Array.isArray(payload.closure_evidence_revisions) &&
    payload.closure_evidence_revisions.length > 0
  ) {
    throw new Error("only resolved Partner loops may carry closure evidence");
  }
  if (
    profileId === "moonsleep.partner.open-loop-state.v1" &&
    payload.semantic_lifecycle === "superseded" &&
    !payload.superseding_open_loop_id
  ) {
    throw new Error("superseded Partner loop requires a successor");
  }
}

export function validateSourceRevisionRef(ref: SourceRevisionRefV1): void {
  assertNoProhibitedSchemaField(ref);
  for (const [field, value] of [
    ["adapter_package_id", ref.adapter_package_id],
    ["adapter_package_version", ref.adapter_package_version],
    ["connection_id", ref.connection_id],
    ["provider_account_id", ref.provider_account_id],
    ["provider_record_id", ref.provider_record_id],
    ["source_logical_record_id", ref.source_logical_record_id],
    ["source_run_receipt_ref", ref.source_run_receipt_ref],
  ] as const) {
    text(value, field, 1024);
  }
  if (ref.provider_revision_id !== null) text(ref.provider_revision_id, "provider_revision_id", 1024);
  if (!SHA256.test(ref.source_revision_sha256) || !SHA256.test(ref.payload_sha256)) {
    throw new Error("source revision digests are invalid");
  }
  exactUtc(ref.source_at, "source_at");
  exactUtc(ref.captured_at, "captured_at");
  uniqueStrings(ref.fragment_refs, "fragment_refs", 256);
  uniqueStrings(ref.attachment_refs, "attachment_refs", 256);
  if (ref.provider_read_authority !== true || ref.provider_write_authority !== false) {
    throw new Error("Partner source revision authority is invalid");
  }
}

export function canonicalHeadKey(
  manifest: CanonicalPartnerManifest,
  observationProfileId: string,
  values: JsonObject,
): string {
  const profile = manifest.observation_profiles.find(
    (entry) => entry.profile_id === observationProfileId,
  );
  if (!profile) throw new Error(`unknown observation profile ${observationProfileId}`);
  const expected = new Set(profile.head_key_fields);
  if (
    Object.keys(values).length !== expected.size ||
    Object.keys(values).some((field) => !expected.has(field))
  ) {
    throw new Error(`${observationProfileId} head key fields are invalid`);
  }
  for (const field of profile.head_key_fields) text(values[field], field, 512);
  if (values.observation_profile_id !== observationProfileId) {
    throw new Error("head key observation profile does not match");
  }
  const ordered = Object.fromEntries(profile.head_key_fields.map((field) => [field, values[field]]));
  return `${observationProfileId}:${sha256(canonicalJson(ordered))}`;
}

export function sealMemberSet(
  manifest: CanonicalPartnerManifest,
  setProfileId: string,
  memberIds: string[],
): SealedSetDescriptor {
  if (!manifest.sealed_set_profiles.some((entry) => entry.set_profile_id === setProfileId)) {
    throw new Error(`unknown sealed-set profile ${setProfileId}`);
  }
  const members = uniqueStrings(memberIds, "member_ids", 100_000).sort();
  if (members.length === 0) throw new Error("sealed set requires at least one member");
  const memberDigest = sha256(canonicalJson(members));
  return {
    set_profile_id: setProfileId,
    member_count: members.length,
    member_ids: members,
    member_digest: memberDigest,
    seal_identity: sha256(canonicalJson({
      set_profile_id: setProfileId,
      member_count: members.length,
      member_digest: memberDigest,
    })),
  };
}

export function createFactCandidate(input: {
  manifest: CanonicalPartnerManifest;
  fact_profile_id: string;
  subject_reference: string;
  typed_payload: JsonObject;
  source_revision_refs: SourceRevisionRefV1[];
  producer_version: string;
  source_manifest_sha256: string;
  review_state: "proposed" | "reviewed";
}): CanonicalFactCandidate {
  const profile = input.manifest.fact_profiles.find(
    (entry) => entry.profile_id === input.fact_profile_id,
  );
  if (!profile) throw new Error(`unknown fact profile ${input.fact_profile_id}`);
  text(input.subject_reference, "subject_reference", 1024);
  text(input.producer_version, "producer_version", 128);
  if (!SHA256.test(input.source_manifest_sha256)) {
    throw new Error("source_manifest_sha256 is invalid");
  }
  if (input.source_revision_refs.length < profile.required_source_revision_refs) {
    throw new Error("fact candidate is missing required source revision refs");
  }
  input.source_revision_refs.forEach(validateSourceRevisionRef);
  const revisionIdentities = input.source_revision_refs.map((ref) => canonicalJson({
    provider: ref.provider,
    connection_id: ref.connection_id,
    source_logical_record_id: ref.source_logical_record_id,
    source_revision_sha256: ref.source_revision_sha256,
    fragment_refs: [...ref.fragment_refs].sort(),
  }));
  if (new Set(revisionIdentities).size !== revisionIdentities.length) {
    throw new Error("fact candidate contains duplicate source revision refs");
  }
  validateProfilePayload(input.manifest, input.fact_profile_id, input.typed_payload);
  const payloadSha256 = sha256(canonicalJson(input.typed_payload));
  const factIdentity = {
    fact_profile_id: profile.profile_id,
    fact_profile_version: profile.profile_version,
    fact_type: profile.fact_type,
    subject_reference: input.subject_reference,
    payload_sha256: payloadSha256,
    source_revision_refs: input.source_revision_refs.map((ref) => ({
      provider: ref.provider,
      connection_id: ref.connection_id,
      source_logical_record_id: ref.source_logical_record_id,
      source_revision_sha256: ref.source_revision_sha256,
      fragment_refs: [...ref.fragment_refs].sort(),
    })),
    producer_package: "moonsleep-partner-desk",
    producer_version: input.producer_version,
    source_manifest_sha256: input.source_manifest_sha256,
    review_state: input.review_state,
  };
  return {
    fact_id: `partner-fact:${sha256(canonicalJson(factIdentity))}`,
    fact_profile_id: profile.profile_id,
    fact_profile_version: "1.0.0",
    fact_type: profile.fact_type,
    subject_reference: input.subject_reference,
    typed_payload: canonicalize(input.typed_payload) as JsonObject,
    payload_sha256: payloadSha256,
    source_revision_refs: input.source_revision_refs.map((ref) => structuredClone(ref)),
    producer_package: "moonsleep-partner-desk",
    producer_version: input.producer_version,
    source_manifest_sha256: input.source_manifest_sha256,
    review_state: input.review_state,
  };
}
