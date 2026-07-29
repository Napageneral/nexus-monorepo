import {
  canonicalHeadKey,
  canonicalJson,
  createFactCandidate,
  sealMemberSet,
  sha256,
  validateProfilePayload,
  type CanonicalFactCandidate,
  type CanonicalPartnerManifest,
  type SealedSetDescriptor,
  type SourceRevisionRefV1,
} from "./canonical-prep.ts";
import type {
  CommunicationRecord,
  IdentityResolution,
  OpenLoopAssertion,
  SourceCoverageAssertion,
  WorkspaceAssertion,
} from "./projection.ts";

type JsonObject = Record<string, unknown>;

export type MigrationCommunicationRecord = CommunicationRecord & {
  source_revision_ref: SourceRevisionRefV1;
};

export type LegacyStructuredClaim = {
  source_record_id: string;
  claim_type:
    | "money"
    | "quantity"
    | "date"
    | "time_window"
    | "document"
    | "external_subject"
    | "status_statement";
  claim_role: string;
  value_text: string;
  currency_code?: string;
  minor_units?: string;
  quantity_text?: string;
  unit_code?: string;
  date_value?: string;
  timestamp_value?: string;
  time_window_start?: string;
  time_window_end?: string;
  external_subject_reference?: string;
  source_quote_digest: string;
  explicitness: "explicit" | "strongly_implied" | "ambiguous";
};

export type LegacyPartnerMigrationInput = {
  migration_id: string;
  workspace_id: string;
  workspace_key: string;
  canonical_partner_entity_id: string;
  partner_contact_id: string;
  partner_display_name: string;
  person_organization_relationships: JsonObject[];
  legacy_package_version: "0.2.1";
  legacy_review_revision_sha256: string;
  records: MigrationCommunicationRecord[];
  identity_resolutions: IdentityResolution[];
  workspace_assertions: WorkspaceAssertion[];
  open_loop_assertions: OpenLoopAssertion[];
  source_coverage_assertions: SourceCoverageAssertion[];
  structured_claims: LegacyStructuredClaim[];
};

export type ShadowObservationCandidate = {
  candidate_id: string;
  observation_profile_id: string;
  observation_profile_version: "1.0.0";
  observation_type: string;
  head_key: string;
  expected_head_id: null;
  subject_reference: string;
  typed_payload: JsonObject;
  payload_sha256: string;
  sealed_fact_set: SealedSetDescriptor;
  resolver_id: string;
  resolver_policy_version: string;
  promotion_state: "shadow";
  migration_source: {
    migration_id: string;
    legacy_package_version: "0.2.1";
    legacy_review_revision_sha256: string;
  };
};

export type LegacyPartnerMigrationPlan = {
  migration_id: string;
  workspace_id: string;
  canonical_partner_entity_id: string;
  extraction_source_set: SealedSetDescriptor;
  facts: CanonicalFactCandidate[];
  observation_candidates: ShadowObservationCandidate[];
  projection_candidate: {
    projection_profile_id: "moonsleep.partner.workspace-projection.v1";
    active_observation_head_set_digest: string;
    observation_candidate_ids: string[];
    promotion_state: "shadow";
  };
  authority: {
    provider_write: false;
    identity_merge: false;
    external_domain_write: false;
    draft_or_send: false;
  };
  plan_sha256: string;
};

const SHA256 = /^[0-9a-f]{64}$/;
const SOURCE_MANIFEST_SHA256 = sha256(
  "moonsleep-partner-desk:canonical-prep:0.2.1-to-continuous-evidence-v1",
);
const PRODUCER_VERSION = "canonical-prep-v1";
const RESOLVER_POLICY_VERSION = "partner-resolver-policy-v1";

function requireUniqueBy<T>(
  rows: T[],
  selector: (row: T) => string,
  field: string,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    const id = selector(row);
    if (result.has(id)) throw new Error(`${field} contains duplicate ${id}`);
    result.set(id, row);
  }
  return result;
}

function exactSet(actual: Iterable<string>, expected: Iterable<string>, field: string): void {
  const left = [...actual].sort();
  const right = [...expected].sort();
  if (canonicalJson(left) !== canonicalJson(right)) {
    throw new Error(`${field} does not cover the exact migration cohort`);
  }
}

function assertMigrationInput(input: LegacyPartnerMigrationInput): {
  records: Map<string, MigrationCommunicationRecord>;
  identities: Map<string, IdentityResolution>;
  workspaces: Map<string, WorkspaceAssertion>;
  coverage: Map<string, SourceCoverageAssertion>;
  loops: Map<string, OpenLoopAssertion>;
} {
  if (
    !input.migration_id ||
    !input.workspace_id ||
    !input.workspace_key ||
    !input.canonical_partner_entity_id ||
    !input.partner_contact_id ||
    !input.partner_display_name
  ) {
    throw new Error("migration identity is incomplete");
  }
  if (
    input.legacy_package_version !== "0.2.1" ||
    !SHA256.test(input.legacy_review_revision_sha256)
  ) {
    throw new Error("legacy migration source identity is invalid");
  }
  if (input.records.length === 0) throw new Error("migration cohort is empty");
  const records = requireUniqueBy(input.records, (row) => row.source_record_id, "records");
  const identities = requireUniqueBy(
    input.identity_resolutions,
    (row) => row.source_record_id,
    "identity_resolutions",
  );
  const workspaces = requireUniqueBy(
    input.workspace_assertions,
    (row) => row.source_record_id,
    "workspace_assertions",
  );
  const coverage = requireUniqueBy(
    input.source_coverage_assertions,
    (row) => row.source_record_id,
    "source_coverage_assertions",
  );
  const loops = requireUniqueBy(
    input.open_loop_assertions,
    (row) => row.open_loop_id,
    "open_loop_assertions",
  );
  exactSet(records.keys(), identities.keys(), "identity_resolutions");
  exactSet(records.keys(), workspaces.keys(), "workspace_assertions");
  exactSet(records.keys(), coverage.keys(), "source_coverage_assertions");

  for (const record of records.values()) {
    if (record.source_revision_ref.source_logical_record_id !== record.source_record_id) {
      throw new Error("source revision ref does not bind its logical record");
    }
    if (record.source_revision_ref.source_revision_sha256 !== record.source_revision_sha256) {
      throw new Error("source revision ref does not bind the legacy revision");
    }
    const identity = identities.get(record.source_record_id)!;
    if (
      identity.canonical_entity_id !== input.canonical_partner_entity_id ||
      identity.contact_id !== input.partner_contact_id ||
      !["exact_provider_anchor", "operator_review"].includes(identity.decision_origin) ||
      !["confirmed", "probable"].includes(identity.status)
    ) {
      throw new Error("legacy identity is not eligible for reviewed migration");
    }
    const workspace = workspaces.get(record.source_record_id)!;
    if (
      workspace.status !== "confirmed" ||
      !["deterministic_rule", "operator_review"].includes(workspace.assertion_origin)
    ) {
      throw new Error("legacy workspace assertion is not reviewed");
    }
    const sourceCoverage = coverage.get(record.source_record_id)!;
    if (
      !["deterministic_rule", "operator_review"].includes(sourceCoverage.assertion_origin)
    ) {
      throw new Error("legacy source coverage is not reviewed");
    }
    if (
      sourceCoverage.disposition === "open_loop_evidence" &&
      sourceCoverage.open_loop_ids.length === 0
    ) {
      throw new Error("legacy loop evidence is missing loop references");
    }
    if (
      sourceCoverage.disposition !== "open_loop_evidence" &&
      sourceCoverage.open_loop_ids.length > 0
    ) {
      throw new Error("legacy non-loop coverage carries loop references");
    }
  }

  for (const loop of loops.values()) {
    if (
      loop.canonical_entity_id !== input.canonical_partner_entity_id ||
      loop.review_state !== "confirmed" ||
      !["deterministic_rule", "operator_review"].includes(loop.assertion_origin)
    ) {
      throw new Error("legacy loop is not eligible for reviewed migration");
    }
    if (
      loop.evidence_source_record_ids.length === 0 ||
      !loop.evidence_source_record_ids.includes(loop.primary_source_record_id)
    ) {
      throw new Error("legacy loop evidence is incomplete");
    }
    for (const recordId of loop.evidence_source_record_ids) {
      if (!records.has(recordId)) throw new Error("legacy loop references a foreign record");
      const sourceCoverage = coverage.get(recordId)!;
      if (
        sourceCoverage.disposition !== "open_loop_evidence" ||
        !sourceCoverage.open_loop_ids.includes(loop.open_loop_id)
      ) {
        throw new Error("legacy loop lacks reciprocal reviewed coverage");
      }
    }
    if (loop.lifecycle === "resolved" && loop.closure_source_record_ids.length === 0) {
      throw new Error("legacy resolved loop lacks closure evidence");
    }
    if (loop.lifecycle !== "resolved" && loop.closure_source_record_ids.length > 0) {
      throw new Error("legacy unresolved loop carries closure evidence");
    }
  }

  for (const claim of input.structured_claims) {
    if (!records.has(claim.source_record_id)) {
      throw new Error("structured claim references a foreign record");
    }
  }

  return { records, identities, workspaces, coverage, loops };
}

function sourceSubject(record: MigrationCommunicationRecord): string {
  return canonicalJson({
    subject_type: "source_message_revision",
    provider: record.provider,
    connection_id: record.connection_id,
    source_logical_record_id: record.source_record_id,
    source_revision_sha256: record.source_revision_sha256,
  });
}

function nativeConversationRef(record: MigrationCommunicationRecord): string {
  return canonicalJson({
    subject_type: "native_conversation",
    provider: record.provider,
    connection_id: record.connection_id,
    provider_thread_id: record.provider_thread_id,
  });
}

function createLegacyFacts(
  manifest: CanonicalPartnerManifest,
  input: LegacyPartnerMigrationInput,
  maps: ReturnType<typeof assertMigrationInput>,
): CanonicalFactCandidate[] {
  const facts: CanonicalFactCandidate[] = [];
  for (const record of [...maps.records.values()].sort((left, right) =>
    left.source_record_id.localeCompare(right.source_record_id)
  )) {
    const sourceRefs = [record.source_revision_ref];
    const subjectReference = sourceSubject(record);
    const workspace = maps.workspaces.get(record.source_record_id)!;
    const identity = maps.identities.get(record.source_record_id)!;
    const coverage = maps.coverage.get(record.source_record_id)!;
    facts.push(createFactCandidate({
      manifest,
      fact_profile_id: "moonsleep.partner.communication-classification.v1",
      subject_reference: subjectReference,
      typed_payload: {
        relationship_labels: [workspace.category],
        topic_labels: ["general_relationship"],
        partner_relevance: "included",
        confidence_millionths: 1000000,
        rationale: "Migrated from an operator-reviewed Partner Desk 0.2.1 workspace assertion.",
        contains_actionable_signal: coverage.disposition === "open_loop_evidence",
      },
      source_revision_refs: sourceRefs,
      producer_version: PRODUCER_VERSION,
      source_manifest_sha256: SOURCE_MANIFEST_SHA256,
      review_state: "reviewed",
    }));
    facts.push(createFactCandidate({
      manifest,
      fact_profile_id: "moonsleep.partner.workspace-admission.v1",
      subject_reference: subjectReference,
      typed_payload: {
        canonical_partner_entity_id: input.canonical_partner_entity_id,
        contact_id: input.partner_contact_id,
        partner_category: workspace.category,
        admission_status: identity.status,
        decision_origin: identity.decision_origin,
        evidence_fragment_refs: [...record.source_revision_ref.fragment_refs],
        requires_human_review: false,
      },
      source_revision_refs: sourceRefs,
      producer_version: PRODUCER_VERSION,
      source_manifest_sha256: SOURCE_MANIFEST_SHA256,
      review_state: "reviewed",
    }));
    facts.push(createFactCandidate({
      manifest,
      fact_profile_id: "moonsleep.partner.source-coverage.v1",
      subject_reference: subjectReference,
      typed_payload: {
        source_logical_record_id: record.source_record_id,
        source_revision_sha256: record.source_revision_sha256,
        coverage_disposition: coverage.disposition,
        candidate_open_loop_ids: [...coverage.open_loop_ids].sort(),
        coverage_reason: "Migrated from an operator-reviewed Partner Desk 0.2.1 coverage assertion.",
        coverage_policy_version: "legacy-0.2.1-reviewed-migration-v1",
        requires_human_review: false,
      },
      source_revision_refs: sourceRefs,
      producer_version: PRODUCER_VERSION,
      source_manifest_sha256: SOURCE_MANIFEST_SHA256,
      review_state: "reviewed",
    }));
  }

  for (const loop of [...maps.loops.values()].sort((left, right) =>
    left.open_loop_id.localeCompare(right.open_loop_id)
  )) {
    for (const recordId of [...loop.evidence_source_record_ids].sort()) {
      const record = maps.records.get(recordId)!;
      const closureCandidate = loop.closure_source_record_ids.includes(recordId);
      facts.push(createFactCandidate({
        manifest,
        fact_profile_id: "moonsleep.partner.open-loop-signal.v1",
        subject_reference: sourceSubject(record),
        typed_payload: {
          signal_type: closureCandidate ? "closure_candidate" : "progress",
          responsible_side:
            loop.lifecycle === "waiting_on_partner" ? "partner" :
            loop.lifecycle === "waiting_on_moonsleep" ? "moonsleep" :
            "unclear",
          statement_summary: loop.summary,
          explicitness: "explicit",
          candidate_open_loop_id: loop.open_loop_id,
          candidate_title: loop.title,
          candidate_action: closureCandidate ? "propose_resolution" : "attach",
          referenced_subjects: [],
          evidence_fragment_refs: [...record.source_revision_ref.fragment_refs],
          requires_human_review: false,
        },
        source_revision_refs: [record.source_revision_ref],
        producer_version: PRODUCER_VERSION,
        source_manifest_sha256: SOURCE_MANIFEST_SHA256,
        review_state: "reviewed",
      }));
    }
  }

  for (const claim of [...input.structured_claims].sort((left, right) =>
    canonicalJson(left).localeCompare(canonicalJson(right))
  )) {
    const record = maps.records.get(claim.source_record_id)!;
    const {
      source_record_id: _sourceRecordId,
      ...typedPayload
    } = claim;
    facts.push(createFactCandidate({
      manifest,
      fact_profile_id: "moonsleep.partner.structured-claim.v1",
      subject_reference: sourceSubject(record),
      typed_payload: typedPayload,
      source_revision_refs: [record.source_revision_ref],
      producer_version: PRODUCER_VERSION,
      source_manifest_sha256: SOURCE_MANIFEST_SHA256,
      review_state: "reviewed",
    }));
  }

  const factsById = requireUniqueBy(facts, (fact) => fact.fact_id, "canonical facts");
  return [...factsById.values()].sort((left, right) => left.fact_id.localeCompare(right.fact_id));
}

function observationCandidate(input: {
  manifest: CanonicalPartnerManifest;
  migration: LegacyPartnerMigrationInput;
  observationProfileId: string;
  observationType: string;
  headValues: JsonObject;
  subjectReference: string;
  typedPayload: JsonObject;
  factIds: string[];
  resolverId: string;
}): ShadowObservationCandidate {
  const profile = input.manifest.observation_profiles.find(
    (entry) => entry.profile_id === input.observationProfileId,
  );
  if (!profile || profile.observation_type !== input.observationType) {
    throw new Error("observation profile does not match its type");
  }
  const sealedFactSet = sealMemberSet(
    input.manifest,
    "moonsleep.partner.resolver-fact-set.v1",
    input.factIds,
  );
  validateProfilePayload(
    input.manifest,
    input.observationProfileId,
    input.typedPayload,
  );
  const headKey = canonicalHeadKey(
    input.manifest,
    input.observationProfileId,
    input.headValues,
  );
  const payloadSha256 = sha256(canonicalJson(input.typedPayload));
  const identity = {
    observation_profile_id: input.observationProfileId,
    observation_profile_version: "1.0.0",
    observation_type: input.observationType,
    head_key: headKey,
    expected_head_id: null,
    subject_reference: input.subjectReference,
    payload_sha256: payloadSha256,
    sealed_fact_set_digest: sealedFactSet.member_digest,
    resolver_id: input.resolverId,
    resolver_policy_version: RESOLVER_POLICY_VERSION,
    migration_id: input.migration.migration_id,
    legacy_review_revision_sha256: input.migration.legacy_review_revision_sha256,
  };
  return {
    candidate_id: `partner-observation-candidate:${sha256(canonicalJson(identity))}`,
    observation_profile_id: input.observationProfileId,
    observation_profile_version: "1.0.0",
    observation_type: input.observationType,
    head_key: headKey,
    expected_head_id: null,
    subject_reference: input.subjectReference,
    typed_payload: input.typedPayload,
    payload_sha256: payloadSha256,
    sealed_fact_set: sealedFactSet,
    resolver_id: input.resolverId,
    resolver_policy_version: RESOLVER_POLICY_VERSION,
    promotion_state: "shadow",
    migration_source: {
      migration_id: input.migration.migration_id,
      legacy_package_version: input.migration.legacy_package_version,
      legacy_review_revision_sha256: input.migration.legacy_review_revision_sha256,
    },
  };
}

function createObservationCandidates(
  manifest: CanonicalPartnerManifest,
  input: LegacyPartnerMigrationInput,
  maps: ReturnType<typeof assertMigrationInput>,
  facts: CanonicalFactCandidate[],
): ShadowObservationCandidate[] {
  const factIdsByRecord = new Map<string, string[]>();
  for (const fact of facts) {
    for (const ref of fact.source_revision_refs) {
      const current = factIdsByRecord.get(ref.source_logical_record_id) ?? [];
      current.push(fact.fact_id);
      factIdsByRecord.set(ref.source_logical_record_id, current);
    }
  }
  const allFactIds = facts.map((fact) => fact.fact_id);
  const sourceFreshnessByProvider = new Map<string, string>();
  for (const record of maps.records.values()) {
    const current = sourceFreshnessByProvider.get(record.provider);
    if (!current || record.observed_at > current) {
      sourceFreshnessByProvider.set(record.provider, record.observed_at);
    }
  }
  const sourceFreshness = Object.fromEntries(
    [...sourceFreshnessByProvider.entries()].sort(([left], [right]) =>
      left.localeCompare(right)
    ),
  );
  const categories = [...new Set(
    [...maps.workspaces.values()].map((entry) => entry.category),
  )].sort();
  const connectionIds = [...new Set(
    [...maps.records.values()].map((entry) => entry.connection_id),
  )].sort();
  const nativeConversations = [...new Set(
    [...maps.records.values()].map(nativeConversationRef),
  )].sort();
  const observationCandidates: ShadowObservationCandidate[] = [];

  observationCandidates.push(observationCandidate({
    manifest,
    migration: input,
    observationProfileId: "moonsleep.partner.workspace-state.v1",
    observationType: "partner_workspace_state",
    headValues: {
      workspace_id: input.workspace_id,
      observation_profile_id: "moonsleep.partner.workspace-state.v1",
      canonical_partner_entity_id: input.canonical_partner_entity_id,
    },
    subjectReference: canonicalJson({
      subject_type: "partner_workspace",
      workspace_id: input.workspace_id,
      canonical_partner_entity_id: input.canonical_partner_entity_id,
    }),
    typedPayload: {
      canonical_partner_entity_id: input.canonical_partner_entity_id,
      partner_categories: categories,
      person_organization_relationships: input.person_organization_relationships,
      contact_ids: [input.partner_contact_id],
      connection_ids: connectionIds,
      native_conversation_refs: nativeConversations,
      unresolved_identity_count: 0,
      unresolved_admission_count: 0,
      source_freshness_by_provider: sourceFreshness,
      current_open_loop_ids: [...maps.loops.keys()].sort(),
      source_coverage_summary: {
        total: maps.coverage.size,
        open_loop_evidence: [...maps.coverage.values()]
          .filter((entry) => entry.disposition === "open_loop_evidence").length,
      },
    },
    factIds: allFactIds,
    resolverId: "moonsleep.partner.workspace-resolver.v1",
  }));

  for (const record of [...maps.records.values()].sort((left, right) =>
    left.source_record_id.localeCompare(right.source_record_id)
  )) {
    const coverage = maps.coverage.get(record.source_record_id)!;
    observationCandidates.push(observationCandidate({
      manifest,
      migration: input,
      observationProfileId: "moonsleep.partner.source-coverage-state.v1",
      observationType: "partner_source_coverage_state",
      headValues: {
        workspace_id: input.workspace_id,
        observation_profile_id: "moonsleep.partner.source-coverage-state.v1",
        source_logical_record_id: record.source_record_id,
      },
      subjectReference: sourceSubject(record),
      typedPayload: {
        source_logical_record_id: record.source_record_id,
        current_source_revision_sha256: record.source_revision_sha256,
        coverage_disposition: coverage.disposition,
        reviewed_open_loop_ids: [...coverage.open_loop_ids].sort(),
        superseded_source_revision_refs: [],
        proposal_conflicts: [],
        review_receipt_ref: `legacy-review:${input.legacy_review_revision_sha256}`,
        missing_reason: null,
      },
      factIds: factIdsByRecord.get(record.source_record_id) ?? [],
      resolverId: "moonsleep.partner.source-coverage-resolver.v1",
    }));
  }

  for (const loop of [...maps.loops.values()].sort((left, right) =>
    left.open_loop_id.localeCompare(right.open_loop_id)
  )) {
    const loopFactIds = loop.evidence_source_record_ids
      .flatMap((recordId) => factIdsByRecord.get(recordId) ?? []);
    const primary = maps.records.get(loop.primary_source_record_id)!;
    observationCandidates.push(observationCandidate({
      manifest,
      migration: input,
      observationProfileId: "moonsleep.partner.open-loop-state.v1",
      observationType: "partner_open_loop_state",
      headValues: {
        workspace_id: input.workspace_id,
        observation_profile_id: "moonsleep.partner.open-loop-state.v1",
        canonical_partner_entity_id: input.canonical_partner_entity_id,
        open_loop_id: loop.open_loop_id,
      },
      subjectReference: canonicalJson({
        subject_type: "partner_open_loop",
        workspace_id: input.workspace_id,
        canonical_partner_entity_id: input.canonical_partner_entity_id,
        open_loop_id: loop.open_loop_id,
      }),
      typedPayload: {
        open_loop_id: loop.open_loop_id,
        canonical_partner_entity_id: input.canonical_partner_entity_id,
        title: loop.title,
        operational_summary: loop.summary,
        topic_labels: [...loop.labels].sort(),
        semantic_lifecycle: loop.lifecycle,
        responsible_side:
          loop.lifecycle === "waiting_on_partner" ? "partner" :
          loop.lifecycle === "waiting_on_moonsleep" ? "moonsleep" :
          "unclear",
        primary_evidence_revision: primary.source_revision_sha256,
        supporting_evidence_revisions: loop.evidence_source_record_ids
          .map((recordId) => maps.records.get(recordId)!.source_revision_sha256)
          .sort(),
        closure_evidence_revisions: loop.closure_source_record_ids
          .map((recordId) => maps.records.get(recordId)!.source_revision_sha256)
          .sort(),
        external_subject_refs: [],
        ...(loop.superseded_by_open_loop_id
          ? { superseding_open_loop_id: loop.superseded_by_open_loop_id }
          : {}),
        conflicting_fact_dispositions: [],
        review_receipt_refs: [`legacy-review:${input.legacy_review_revision_sha256}`],
        promotion_receipt_refs: [],
      },
      factIds: loopFactIds,
      resolverId: "moonsleep.partner.open-loop-state-resolver.v1",
    }));
  }

  const byHead = requireUniqueBy(
    observationCandidates,
    (candidate) => candidate.head_key,
    "shadow observation candidates",
  );
  return [...byHead.values()].sort((left, right) =>
    left.head_key.localeCompare(right.head_key)
  );
}

export function prepareLegacyPartnerMigration(
  manifest: CanonicalPartnerManifest,
  input: LegacyPartnerMigrationInput,
): LegacyPartnerMigrationPlan {
  const maps = assertMigrationInput(input);
  const facts = createLegacyFacts(manifest, input, maps);
  const extractionSourceSet = sealMemberSet(
    manifest,
    "moonsleep.partner.extraction-source-set.v1",
    facts.map((fact) => fact.fact_id),
  );
  const observationCandidates = createObservationCandidates(
    manifest,
    input,
    maps,
    facts,
  );
  const observationCandidateIds = observationCandidates
    .map((candidate) => candidate.candidate_id)
    .sort();
  const projectionHeadSetDigest = sha256(canonicalJson(observationCandidateIds));
  const planWithoutDigest = {
    migration_id: input.migration_id,
    workspace_id: input.workspace_id,
    canonical_partner_entity_id: input.canonical_partner_entity_id,
    extraction_source_set: extractionSourceSet,
    facts,
    observation_candidates: observationCandidates,
    projection_candidate: {
      projection_profile_id: "moonsleep.partner.workspace-projection.v1" as const,
      active_observation_head_set_digest: projectionHeadSetDigest,
      observation_candidate_ids: observationCandidateIds,
      promotion_state: "shadow" as const,
    },
    authority: {
      provider_write: false as const,
      identity_merge: false as const,
      external_domain_write: false as const,
      draft_or_send: false as const,
    },
  };
  return {
    ...planWithoutDigest,
    plan_sha256: sha256(canonicalJson(planWithoutDigest)),
  };
}

export function simulateExpectedHeadCommit(input: {
  current_head_id: string | null;
  expected_head_id: string | null;
  candidate_id: string;
}): {
  outcome: "committed" | "stale_head";
  head_id: string | null;
} {
  if (input.current_head_id !== input.expected_head_id) {
    return { outcome: "stale_head", head_id: input.current_head_id };
  }
  return { outcome: "committed", head_id: input.candidate_id };
}
