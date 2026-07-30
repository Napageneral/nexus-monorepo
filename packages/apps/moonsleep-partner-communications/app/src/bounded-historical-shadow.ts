import { readFileSync } from "node:fs";
import type { DatabaseSync } from "../../../../../nex/src/storage/ledgers.ts";
import {
  claimProjectionOutbox,
  commitProfiledObservation,
  completeProjectionOutbox,
  createProfiledFactFromVerifiedSourceRevisions,
  listProjectionOutbox,
  registerElementProfile,
} from "../../../../../nex/src/runtime/domains/memory/continuous-evidence.ts";
import {
  addEvidenceSetMember,
  createEvidenceInputSet,
} from "../../../../../nex/src/runtime/domains/memory/evidence-sets.ts";
import { sealMemorySet } from "../../../../../nex/src/runtime/domains/memory/set-seals.ts";
import {
  canonicalJson,
  DEFAULT_CANONICAL_MANIFEST_PATH,
  loadCanonicalPartnerManifest,
  sha256,
} from "./canonical-prep.js";

const CONTRACT_ID = "moonsleep.partner.pd10.bounded-historical-shadow.v1" as const;
const EXECUTION_MODE = "isolated_shadow_memory" as const;
const SOURCE_MODE = "existing_exact_revisions_only" as const;
const MAX_MEMBERS = 5;
const COVERAGE_FACT_PROFILE = "moonsleep.partner.source-coverage.v1";
const COVERAGE_OBSERVATION_PROFILE = "moonsleep.partner.source-coverage-state.v1";
const COVERAGE_SET_PROFILE = "moonsleep.partner.comparison-set.v1";
const RESOLVER_ID = "moonsleep.partner.source-coverage-resolver.v1";
const RESOLVER_VERSION = "1.0.0";
const ACTOR_REF = "job:moonsleep-partner-pd10-shadow-v1";
const POLICY_REF = "policy:moonsleep-partner-pd10-bounded-shadow-v1";
const SHA256 = /^[0-9a-f]{64}$/;
const OPAQUE_REF = /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,255}$/;
const COHORT_ID = /^PD-10-[A-Z0-9][A-Z0-9-]{0,63}$/;

type JsonObject = Record<string, unknown>;

export type PartnerShadowRevisionRow = {
  id: string;
  record_row_id: string;
  payload_sha256: string;
  connection_id: string;
  platform: "gmail" | "alibaba";
  source_record_type: string;
  source_timestamp: number;
  observed_at: number;
  authority_declaration_json: string;
};

export type PartnerShadowRevisionStore = {
  getRecordRevision(id: string): Promise<PartnerShadowRevisionRow | null>;
};

export type PartnerShadowProjection = {
  coverage_disposition:
    | "open_loop_evidence"
    | "informational"
    | "provider_system"
    | "attachment_only"
    | "needs_review";
  reviewed_open_loop_ids: string[];
  superseded_source_revision_refs: string[];
  proposal_conflict_count: number;
  missing_reason:
    | "source_not_captured"
    | "source_revision_ambiguous"
    | "identity_unresolved"
    | "partner_admission_unreviewed"
    | "fact_not_extracted"
    | "conflicting_evidence"
    | "review_required"
    | "owning_domain_unavailable"
    | "not_applicable"
    | "withheld_by_authority"
    | null;
};

export type PartnerShadowMemberRequest = {
  record_row_id: string;
  revision_id: string;
  payload_sha256: string;
  source_logical_record_ref: string;
  source_revision_sha256: string;
  old_projection: PartnerShadowProjection;
  candidate_projection: PartnerShadowProjection;
};

export type PartnerShadowCohortRequest = {
  cohort_id: string;
  connection_id: string;
  source_read_receipt_sha256: string;
  execution_mode: typeof EXECUTION_MODE;
  members: PartnerShadowMemberRequest[];
};

type SelectedPartnerShadowMember = PartnerShadowMemberRequest & {
  platform: "gmail" | "alibaba";
  source_record_type: string;
  source_timestamp: number;
  observed_at: number;
  subject_ref: string;
};

export type PartnerShadowComparison = {
  subject_ref_sha256: string;
  old_projection_sha256: string;
  candidate_projection_sha256: string;
  differing_fields: string[];
  review_required: boolean;
};

type PassReceipt = {
  facts_created: number;
  facts_reused: number;
  sets_created: number;
  sets_reused: number;
  members_created: number;
  members_reused: number;
  seals_created: number;
  seals_reused: number;
  observations_created: number;
  observations_reused: number;
  observation_ids: string[];
  outbox_count: number;
};

export type PartnerShadowReceipt = {
  contract_id: typeof CONTRACT_ID;
  cohort_id: string;
  execution_mode: typeof EXECUTION_MODE;
  source_mode: typeof SOURCE_MODE;
  source_manifest_sha256: string;
  source_read_receipt_sha256: string;
  connection_ref_sha256: string;
  exact_revision_set_sha256: string;
  member_count: number;
  comparison_count: number;
  review_required_count: number;
  comparisons: PartnerShadowComparison[];
  isolated_outbox_target: string;
  first_pass: PassReceipt;
  second_pass: PassReceipt & { outbox_additions: 0 };
  replay_stable: true;
  authority: {
    provider_calls: 0;
    model_calls: 0;
    provider_write_authority: false;
    identity_merge_authority: false;
    draft_or_send_authority: false;
    canonical_promotion_authority: false;
    active_projection_writes: 0;
    isolated_shadow_outbox_deliveries: number;
  };
  receipt_sha256: string;
};

const COVERAGE_VALUES = new Set([
  "open_loop_evidence",
  "informational",
  "provider_system",
  "attachment_only",
  "needs_review",
]);
const MISSING_VALUES = new Set([
  "source_not_captured",
  "source_revision_ambiguous",
  "identity_unresolved",
  "partner_admission_unreviewed",
  "fact_not_extracted",
  "conflicting_evidence",
  "review_required",
  "owning_domain_unavailable",
  "not_applicable",
  "withheld_by_authority",
]);

function sourceManifestSha256(
  manifestPath = DEFAULT_CANONICAL_MANIFEST_PATH,
): string {
  return sha256(readFileSync(manifestPath));
}

function digest(value: unknown): string {
  return sha256(Buffer.from(JSON.stringify(canonicalJson(value)), "utf8"));
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new Error(`${field} must be a non-empty exact string`);
  }
  return value;
}

function opaque(value: unknown, field: string): string {
  const parsed = text(value, field);
  if (!OPAQUE_REF.test(parsed) || parsed.includes("@")) {
    throw new Error(`${field} must be an opaque reference`);
  }
  return parsed;
}

function exactSha(value: unknown, field: string): string {
  const parsed = text(value, field).toLowerCase();
  if (!SHA256.test(parsed)) throw new Error(`${field} must be a lowercase SHA-256`);
  return parsed;
}

function normalizeRefs(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > 32) {
    throw new Error(`${field} must be a bounded array`);
  }
  const refs = value.map((entry, index) => opaque(entry, `${field}[${index}]`)).sort();
  if (new Set(refs).size !== refs.length) throw new Error(`${field} contains duplicates`);
  return refs;
}

function normalizeProjection(
  value: PartnerShadowProjection,
  field: string,
): PartnerShadowProjection {
  if (!COVERAGE_VALUES.has(value.coverage_disposition)) {
    throw new Error(`${field}.coverage_disposition is unsupported`);
  }
  if (
    !Number.isSafeInteger(value.proposal_conflict_count) ||
    value.proposal_conflict_count < 0 ||
    value.proposal_conflict_count > 128
  ) {
    throw new Error(`${field}.proposal_conflict_count is invalid`);
  }
  if (value.missing_reason !== null && !MISSING_VALUES.has(value.missing_reason)) {
    throw new Error(`${field}.missing_reason is unsupported`);
  }
  return {
    coverage_disposition: value.coverage_disposition,
    reviewed_open_loop_ids: normalizeRefs(
      value.reviewed_open_loop_ids,
      `${field}.reviewed_open_loop_ids`,
    ),
    superseded_source_revision_refs: normalizeRefs(
      value.superseded_source_revision_refs,
      `${field}.superseded_source_revision_refs`,
    ),
    proposal_conflict_count: value.proposal_conflict_count,
    missing_reason: value.missing_reason,
  };
}

function parseAuthority(value: string): void {
  let authority: JsonObject;
  try {
    authority = JSON.parse(value) as JsonObject;
  } catch {
    throw new Error("source revision authority declaration is invalid JSON");
  }
  for (const field of [
    "provider_write_authority",
    "source_mutation_authority",
    "financial_mutation_authority",
  ]) {
    if (authority[field] !== false) {
      throw new Error(`source revision ${field} must remain false`);
    }
  }
}

function registerProfiles(
  memoryDb: DatabaseSync,
  manifestPath = DEFAULT_CANONICAL_MANIFEST_PATH,
): void {
  const manifest = loadCanonicalPartnerManifest(manifestPath);
  const manifestSha256 = sourceManifestSha256(manifestPath);
  for (const profile of manifest.fact_profiles) {
    registerElementProfile(memoryDb, {
      profileId: profile.profile_id,
      profileVersion: profile.profile_version,
      elementType: "fact",
      schema: profile.schema,
      ownerPackage: "moonsleep-partner-desk",
      sourceManifestSha256: manifestSha256,
      compatibility: {
        compatibility_mode: "initial",
        previous_profile_version: null,
      },
      description: `${profile.fact_type} for ${profile.subject_type}`,
    });
  }
  for (const profile of manifest.observation_profiles) {
    registerElementProfile(memoryDb, {
      profileId: profile.profile_id,
      profileVersion: profile.profile_version,
      elementType: "observation",
      schema: profile.schema,
      ownerPackage: "moonsleep-partner-desk",
      sourceManifestSha256: manifestSha256,
      compatibility: {
        compatibility_mode: "initial",
        previous_profile_version: null,
      },
      description: `${profile.observation_type} for ${profile.subject_type}`,
    });
  }
}

async function selectMembers(
  store: PartnerShadowRevisionStore,
  request: PartnerShadowCohortRequest,
): Promise<SelectedPartnerShadowMember[]> {
  if (!COHORT_ID.test(request.cohort_id)) throw new Error("cohort_id is invalid");
  opaque(request.connection_id, "connection_id");
  exactSha(request.source_read_receipt_sha256, "source_read_receipt_sha256");
  if (request.execution_mode !== EXECUTION_MODE) {
    throw new Error("execution_mode must remain isolated_shadow_memory");
  }
  if (request.members.length < 1 || request.members.length > MAX_MEMBERS) {
    throw new Error(`bounded Partner shadow requires 1-${MAX_MEMBERS} members`);
  }
  const sorted = [...request.members].sort((left, right) =>
    `${left.record_row_id}\n${left.revision_id}`.localeCompare(
      `${right.record_row_id}\n${right.revision_id}`,
    ),
  );
  if (
    new Set(sorted.map((member) => member.record_row_id)).size !== sorted.length ||
    new Set(sorted.map((member) => member.revision_id)).size !== sorted.length
  ) {
    throw new Error("bounded Partner shadow contains duplicate exact revision tuples");
  }
  const selected: SelectedPartnerShadowMember[] = [];
  for (const [index, member] of sorted.entries()) {
    opaque(member.record_row_id, `members[${index}].record_row_id`);
    opaque(member.revision_id, `members[${index}].revision_id`);
    exactSha(member.payload_sha256, `members[${index}].payload_sha256`);
    const sourceLogicalRef = opaque(
      member.source_logical_record_ref,
      `members[${index}].source_logical_record_ref`,
    );
    exactSha(member.source_revision_sha256, `members[${index}].source_revision_sha256`);
    const revision = await store.getRecordRevision(member.revision_id);
    if (!revision) throw new Error(`source revision is absent: ${member.revision_id}`);
    if (
      revision.record_row_id !== member.record_row_id ||
      revision.payload_sha256 !== member.payload_sha256
    ) {
      throw new Error(`exact source revision tuple mismatch: ${member.revision_id}`);
    }
    if (revision.connection_id !== request.connection_id) {
      throw new Error("bounded Partner shadow must use one exact source connection");
    }
    if (revision.platform !== "gmail" && revision.platform !== "alibaba") {
      throw new Error(`unsupported Partner source platform: ${revision.platform}`);
    }
    parseAuthority(revision.authority_declaration_json);
    selected.push({
      ...member,
      source_logical_record_ref: sourceLogicalRef,
      old_projection: normalizeProjection(member.old_projection, `members[${index}].old_projection`),
      candidate_projection: normalizeProjection(
        member.candidate_projection,
        `members[${index}].candidate_projection`,
      ),
      platform: revision.platform,
      source_record_type: opaque(revision.source_record_type, "source_record_type"),
      source_timestamp: revision.source_timestamp,
      observed_at: revision.observed_at,
      subject_ref: `partner-source:${digest(sourceLogicalRef)}`,
    });
  }
  return selected;
}

function comparisons(members: SelectedPartnerShadowMember[]): PartnerShadowComparison[] {
  const fields: Array<keyof PartnerShadowProjection> = [
    "coverage_disposition",
    "reviewed_open_loop_ids",
    "superseded_source_revision_refs",
    "proposal_conflict_count",
    "missing_reason",
  ];
  return members.map((member) => {
    const differingFields = fields.filter(
      (field) =>
        JSON.stringify(canonicalJson(member.old_projection[field])) !==
        JSON.stringify(canonicalJson(member.candidate_projection[field])),
    );
    return {
      subject_ref_sha256: digest(member.subject_ref),
      old_projection_sha256: digest(member.old_projection),
      candidate_projection_sha256: digest(member.candidate_projection),
      differing_fields: differingFields,
      review_required: differingFields.length > 0,
    };
  });
}

function observationPayload(member: SelectedPartnerShadowMember): JsonObject {
  const candidate = member.candidate_projection;
  return {
    source_logical_record_id: member.source_logical_record_ref,
    current_source_revision_sha256: member.source_revision_sha256,
    coverage_disposition: candidate.coverage_disposition,
    reviewed_open_loop_ids: candidate.reviewed_open_loop_ids,
    superseded_source_revision_refs: candidate.superseded_source_revision_refs,
    proposal_conflicts: Array.from({ length: candidate.proposal_conflict_count }, (_, index) => ({
      conflict_ref_sha256: digest(`${member.subject_ref}:${index}`),
    })),
    missing_reason: candidate.missing_reason,
  };
}

function outboxCount(memoryDb: DatabaseSync, targetDomain: string): number {
  return listProjectionOutbox(memoryDb, {
    targetDomain,
    limit: 1_000,
  }).length;
}

function runPass(
  memoryDb: DatabaseSync,
  members: SelectedPartnerShadowMember[],
  cohortId: string,
  targetDomain: string,
  manifestSha256: string,
): PassReceipt {
  let factsCreated = 0;
  let factsReused = 0;
  let setsCreated = 0;
  let setsReused = 0;
  let membersCreated = 0;
  let membersReused = 0;
  let sealsCreated = 0;
  let sealsReused = 0;
  let observationsCreated = 0;
  let observationsReused = 0;
  const observationIds: string[] = [];
  for (const [index, member] of members.entries()) {
    const fact = createProfiledFactFromVerifiedSourceRevisions(memoryDb, {
      profileId: COVERAGE_FACT_PROFILE,
      profileVersion: "1.0.0",
      payload: {
        source_logical_record_id: member.source_logical_record_ref,
        source_revision_sha256: member.source_revision_sha256,
        coverage_disposition: member.candidate_projection.coverage_disposition,
        candidate_open_loop_ids: member.candidate_projection.reviewed_open_loop_ids,
        coverage_reason: "bounded historical shadow comparison",
        coverage_policy_version: "pd10-bounded-shadow-v1",
        requires_human_review:
          member.candidate_projection.missing_reason !== null ||
          member.candidate_projection.proposal_conflict_count > 0,
      },
      summary: `Partner source coverage ${member.subject_ref}`,
      subjectType: "source_record",
      subjectRef: member.subject_ref,
      producerId: "moonsleep-partner-desk",
      producerVersion: "0.3.1",
      extractionPolicyRef: POLICY_REF,
      reviewReceiptRef: null,
      sourceRevisionRefs: [
        {
          revision_id: member.revision_id,
          payload_sha256: member.payload_sha256,
          fragment_refs: [],
        },
      ],
      entityIds: [],
      sourceJobId: null,
      asOf: member.source_timestamp,
      idempotencyKey: `partner-pd10-fact:${cohortId}:${member.revision_id}`,
    });
    if (fact.reused) factsReused += 1;
    else factsCreated += 1;
    const factId = String(fact.fact.id);

    const set = createEvidenceInputSet(memoryDb, {
      definitionId: "evidence_set_v1",
      idempotencyKey: `partner-pd10-set:${cohortId}:${member.revision_id}`,
      scope: {
        domain: "moonsleep.partner",
        purpose: "partner_source_coverage_comparison",
        resolver_id: RESOLVER_ID,
        resolver_policy_version: RESOLVER_VERSION,
        target_profile_id: COVERAGE_OBSERVATION_PROFILE,
        target_profile_version: "1.0.0",
        allowed_fact_profiles: [
          {
            profile_id: COVERAGE_FACT_PROFILE,
            profile_version: "1.0.0",
          },
        ],
        source_manifest_sha256: manifestSha256,
      },
      metadata: {
        set_profile_id: COVERAGE_SET_PROFILE,
        execution_mode: EXECUTION_MODE,
        cohort_ref_sha256: digest(cohortId),
      },
    });
    if (set.reused) setsReused += 1;
    else setsCreated += 1;
    const setId = String(set.set.id);
    const memberResult = addEvidenceSetMember(memoryDb, {
      setId,
      factElementId: factId,
      position: index,
    });
    if (memberResult.reused) membersReused += 1;
    else membersCreated += 1;
    const seal = sealMemorySet(memoryDb, {
      setId,
      sealedBy: ACTOR_REF,
    });
    if (seal.reused) sealsReused += 1;
    else sealsCreated += 1;

    const committed = commitProfiledObservation(memoryDb, {
      headKey: `shadow:partner:pd10:${digest(cohortId)}:${digest(member.subject_ref)}`,
      expectedHeadId: null,
      inputSetId: setId,
      profileId: COVERAGE_OBSERVATION_PROFILE,
      profileVersion: "1.0.0",
      payload: observationPayload(member),
      summary: `Partner shadow source coverage ${member.subject_ref}`,
      subjectType: "source_record",
      subjectRef: member.subject_ref,
      factDispositions: [
        {
          fact_element_id: factId,
          disposition: "supports",
        },
      ],
      entityIds: [],
      resolverId: RESOLVER_ID,
      resolverVersion: RESOLVER_VERSION,
      resolverPolicyVersion: RESOLVER_VERSION,
      reviewReceiptRef: null,
      actorRef: ACTOR_REF,
      policyRef: POLICY_REF,
      idempotencyKey: `partner-pd10-observation:${cohortId}:${member.revision_id}`,
      sourceJobId: null,
      asOf: member.observed_at,
      projectionEvents: [
        {
          target_domain: targetDomain,
          projection_type: "partner_bounded_shadow_comparison",
          projection_version: "1.0.0",
          payload: {
            subject_ref_sha256: digest(member.subject_ref),
            old_projection_sha256: digest(member.old_projection),
            candidate_projection_sha256: digest(member.candidate_projection),
            active_projection_write_authority: false,
          },
        },
      ],
    });
    if (committed.reused) observationsReused += 1;
    else observationsCreated += 1;
    observationIds.push(String(committed.observation.id));
  }
  return {
    facts_created: factsCreated,
    facts_reused: factsReused,
    sets_created: setsCreated,
    sets_reused: setsReused,
    members_created: membersCreated,
    members_reused: membersReused,
    seals_created: sealsCreated,
    seals_reused: sealsReused,
    observations_created: observationsCreated,
    observations_reused: observationsReused,
    observation_ids: observationIds.sort(),
    outbox_count: outboxCount(memoryDb, targetDomain),
  };
}

function deliverIsolatedOutbox(memoryDb: DatabaseSync, targetDomain: string): number {
  const workerRef = "worker:partner-pd10-isolated-shadow";
  const claimed = claimProjectionOutbox(memoryDb, {
    targetDomain,
    workerRef,
    limit: MAX_MEMBERS,
    leaseMs: 60_000,
  });
  for (const item of claimed) {
    const payload = item.payload as JsonObject;
    if (
      payload.active_projection_write_authority !== false ||
      !SHA256.test(String(payload.subject_ref_sha256 ?? ""))
    ) {
      throw new Error("isolated Partner shadow outbox payload is invalid");
    }
    completeProjectionOutbox(memoryDb, {
      outboxId: String(item.id),
      workerRef,
      leaseToken: String(item.lease_token),
      delivered: true,
    });
  }
  return claimed.length;
}

export async function runPartnerBoundedHistoricalShadow(
  input: {
    revisionStore: PartnerShadowRevisionStore;
    shadowMemoryDb: DatabaseSync;
    request: PartnerShadowCohortRequest;
    canonicalManifestPath?: string;
  },
): Promise<PartnerShadowReceipt> {
  const canonicalManifestPath =
    input.canonicalManifestPath ?? DEFAULT_CANONICAL_MANIFEST_PATH;
  const manifestSha256 = sourceManifestSha256(canonicalManifestPath);
  registerProfiles(input.shadowMemoryDb, canonicalManifestPath);
  const members = await selectMembers(input.revisionStore, input.request);
  const comparison = comparisons(members);
  const targetDomain = `partner.shadow.pd10.${digest(input.request.cohort_id).slice(0, 24)}`;
  const firstPass = runPass(
    input.shadowMemoryDb,
    members,
    input.request.cohort_id,
    targetDomain,
    manifestSha256,
  );
  const deliveries = deliverIsolatedOutbox(input.shadowMemoryDb, targetDomain);
  const firstPassWithDeliveredCount = {
    ...firstPass,
    outbox_count: outboxCount(input.shadowMemoryDb, targetDomain),
  };
  const secondPass = runPass(
    input.shadowMemoryDb,
    members,
    input.request.cohort_id,
    targetDomain,
    manifestSha256,
  );
  if (
    secondPass.outbox_count !== firstPassWithDeliveredCount.outbox_count ||
    JSON.stringify(secondPass.observation_ids) !==
      JSON.stringify(firstPassWithDeliveredCount.observation_ids)
  ) {
    throw new Error("bounded Partner shadow replay changed durable state");
  }
  const exactRevisionSetSha256 = digest(
    members.map((member) => ({
      record_row_id: member.record_row_id,
      revision_id: member.revision_id,
      payload_sha256: member.payload_sha256,
    })),
  );
  const body = {
    contract_id: CONTRACT_ID,
    cohort_id: input.request.cohort_id,
    execution_mode: EXECUTION_MODE,
    source_mode: SOURCE_MODE,
    source_manifest_sha256: manifestSha256,
    source_read_receipt_sha256: input.request.source_read_receipt_sha256,
    connection_ref_sha256: digest(input.request.connection_id),
    exact_revision_set_sha256: exactRevisionSetSha256,
    member_count: members.length,
    comparison_count: comparison.length,
    review_required_count: comparison.filter((item) => item.review_required).length,
    comparisons: comparison,
    isolated_outbox_target: targetDomain,
    first_pass: firstPassWithDeliveredCount,
    second_pass: {
      ...secondPass,
      outbox_additions: 0 as const,
    },
    replay_stable: true as const,
    authority: {
      provider_calls: 0 as const,
      model_calls: 0 as const,
      provider_write_authority: false as const,
      identity_merge_authority: false as const,
      draft_or_send_authority: false as const,
      canonical_promotion_authority: false as const,
      active_projection_writes: 0 as const,
      isolated_shadow_outbox_deliveries: deliveries,
    },
  };
  return {
    ...body,
    receipt_sha256: digest(body),
  };
}
