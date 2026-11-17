import { readFileSync } from "node:fs";
import type { DatabaseSync } from "../../../../../nex/src/storage/ledgers.ts";
import type { JobModelService } from "../../../../../nex/src/api/job-services.ts";
import { canonicalJsonSha256, canonicalJsonString } from "../../../../../nex/src/support/data/canonical-json.ts";
import {
  createProfiledFactFromVerifiedSourceRevisions,
  registerElementProfile,
} from "../../../../../nex/src/runtime/domains/memory/continuous-evidence.ts";
import {
  addEvidenceSetMember,
  createEvidenceInputSet,
} from "../../../../../nex/src/runtime/domains/memory/evidence-sets.ts";
import { sealMemorySet } from "../../../../../nex/src/runtime/domains/memory/set-seals.ts";
import {
  runSemanticCalibrationCandidates,
  type SemanticCalibrationModelCandidate,
} from "../../../../../nex/src/runtime/domains/memory/semantic-calibration-runner.ts";
import {
  createSemanticReviewBatch,
  getSemanticReviewItem,
} from "../../../../../nex/src/runtime/domains/memory/semantic-calibration.ts";
import {
  createFactCandidate,
  DEFAULT_CANONICAL_MANIFEST_PATH,
  loadCanonicalPartnerManifest,
  sha256,
  validateProfilePayload,
  validateSourceRevisionRef,
} from "./canonical-prep.js";
import {
  listPartnerCalibrationFixtures,
  partnerCalibrationFactPayloads,
  partnerCalibrationObservationPayload,
  partnerCalibrationSetProfileId,
  partnerCalibrationSourceRevisions,
  type PartnerCalibrationFixture,
} from "./semantic-calibration-fixtures.js";

const CONTRACT_VERSION = "moonsleep_partner_semantic_calibration_first_review_batch_v1" as const;
const BATCH_LABEL = "PARTNER-REVIEW-BATCH-001-SYNTHETIC" as const;
const POLICY_REF = "policy:moonsleep-partner-semantic-calibration-v1" as const;
const PRODUCER_ID = "partner.semantic-calibration-fixture-adapter.v1" as const;
const EFFECTIVE_AT = Date.UTC(2026, 6, 29, 16, 0, 0);
export const PARTNER_CALIBRATION_CORE_COMMIT =
  "cabe3d83ed00e4390f2dae654b48f3d70448077e" as const;
export const PARTNER_CALIBRATION_CORE_TREE =
  "be41db2f1ff099968d3762efc17b54d5fcdaa369" as const;

export const PARTNER_CALIBRATION_MODEL_CANDIDATES: readonly SemanticCalibrationModelCandidate[] = [
  { requested_model_id: "gpt-5.6-luna", reasoning_effort: "low" },
  { requested_model_id: "gpt-5.6-terra", reasoning_effort: "low" },
  { requested_model_id: "gpt-5.6-sol", reasoning_effort: "low" },
];

type ZeroAuthority = {
  provider_calls: 0;
  live_data_reads: 0;
  model_calls: 0;
  promotions: 0;
  external_actions: 0;
  provider_write: false;
  identity_merge: false;
  draft_or_send: false;
};

const ZERO_AUTHORITY: ZeroAuthority = {
  provider_calls: 0,
  live_data_reads: 0,
  model_calls: 0,
  promotions: 0,
  external_actions: 0,
  provider_write: false,
  identity_merge: false,
  draft_or_send: false,
};

type PreparedFact = {
  fact_id: string;
  profile_id: string;
  payload: Record<string, unknown>;
};

export type PartnerCalibrationPreparedItem = {
  fixture_id: string;
  scenario: string;
  review_item_id: string;
  input_set_id: string;
  input_set_digest: string;
  target_profile_id: string;
  target_profile_version: "1.0.0";
  fact_ids: string[];
  facts: PreparedFact[];
  source_revisions: Array<{
    provider: "gmail" | "alibaba";
    revision_id: string;
    source_logical_record_id: string;
    source_revision_sha256: string;
    payload_sha256: string;
    fragment_refs: string[];
  }>;
};

export type PartnerCalibrationPreparation = {
  contract_version: typeof CONTRACT_VERSION;
  batch_id: string;
  batch_label: typeof BATCH_LABEL;
  batch_reused: boolean;
  fixture_count: 16;
  fact_count: number;
  sealed_input_count: 16;
  gmail_fixture_count: number;
  alibaba_fixture_count: number;
  cross_channel_fixture_count: number;
  governing_core_commit: typeof PARTNER_CALIBRATION_CORE_COMMIT;
  governing_core_tree: typeof PARTNER_CALIBRATION_CORE_TREE;
  items: PartnerCalibrationPreparedItem[];
  source_manifest_sha256: string;
  authority: ZeroAuthority;
  receipt_sha256: string;
};

function sourceManifestSha256(): string {
  return sha256(readFileSync(DEFAULT_CANONICAL_MANIFEST_PATH));
}

function registerPartnerCalibrationProfiles(memoryDb: DatabaseSync): void {
  const manifest = loadCanonicalPartnerManifest();
  const manifestSha256 = sourceManifestSha256();
  for (const profile of manifest.fact_profiles) {
    registerElementProfile(memoryDb, {
      profileId: profile.profile_id,
      profileVersion: profile.profile_version,
      elementType: "fact",
      schema: profile.schema,
      ownerPackage: "moonsleep-partner-desk",
      sourceManifestSha256: manifestSha256,
      compatibility: { compatibility_mode: "initial", previous_profile_version: null },
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
      compatibility: { compatibility_mode: "initial", previous_profile_version: null },
      description: `${profile.observation_type} for ${profile.subject_type}`,
    });
  }
}

function createFixtureFacts(memoryDb: DatabaseSync, fixture: PartnerCalibrationFixture) {
  const manifest = loadCanonicalPartnerManifest();
  const manifestSha256 = sourceManifestSha256();
  const sourceRevisions = partnerCalibrationSourceRevisions(fixture);
  sourceRevisions.forEach(validateSourceRevisionRef);
  return partnerCalibrationFactPayloads(fixture).map(({ profile_id, payload }) => {
    validateProfilePayload(manifest, profile_id, payload);
    const candidate = createFactCandidate({
      manifest,
      fact_profile_id: profile_id,
      subject_reference: fixture.fixture_id,
      typed_payload: payload,
      source_revision_refs: sourceRevisions,
      producer_version: "1",
      source_manifest_sha256: manifestSha256,
      review_state: "proposed",
    });
    const created = createProfiledFactFromVerifiedSourceRevisions(memoryDb, {
      profileId: candidate.fact_profile_id,
      profileVersion: candidate.fact_profile_version,
      payload: candidate.typed_payload,
      summary: fixture.scenario,
      subjectType: "partner_calibration_subject",
      subjectRef: fixture.fixture_id,
      producerId: PRODUCER_ID,
      producerVersion: "1",
      extractionPolicyRef: POLICY_REF,
      reviewReceiptRef: null,
      sourceRevisionRefs: sourceRevisions.map((revision) => ({
        revision_id: `synthetic:partner-revision:${revision.source_revision_sha256}`,
        payload_sha256: revision.payload_sha256,
        fragment_refs: revision.fragment_refs,
      })),
      entityIds: [],
      asOf: EFFECTIVE_AT,
      idempotencyKey: `${BATCH_LABEL}:${fixture.fixture_id}:fact:${profile_id}`,
    });
    return {
      fact_id: String(created.fact.id),
      profile_id,
      payload: candidate.typed_payload,
    } satisfies PreparedFact;
  });
}

function createFixtureInputSet(
  memoryDb: DatabaseSync,
  fixture: PartnerCalibrationFixture,
  facts: PreparedFact[],
) {
  const manifest = loadCanonicalPartnerManifest();
  const setProfileId = partnerCalibrationSetProfileId(fixture.target_profile_id);
  const setProfile = manifest.sealed_set_profiles.find(
    (candidate) => candidate.set_profile_id === setProfileId,
  );
  if (!setProfile || !setProfile.target_observation_profiles.includes(fixture.target_profile_id)) {
    throw new Error(`Partner calibration set profile is incompatible: ${fixture.fixture_id}`);
  }
  const compatibleFacts = facts.filter((fact) =>
    setProfile.allowed_fact_profiles.includes(fact.profile_id),
  );
  if (compatibleFacts.length === 0) {
    throw new Error(`Partner calibration fixture has no compatible facts: ${fixture.fixture_id}`);
  }
  const created = createEvidenceInputSet(memoryDb, {
    definitionId: setProfile.core_definition_id,
    idempotencyKey: `${BATCH_LABEL}:${fixture.fixture_id}:set`,
    scope: {
      domain: "moonsleep.partner",
      purpose: "semantic_calibration_first_review_batch",
      resolver_id: setProfile.resolver_id,
      resolver_policy_version: setProfile.resolver_policy_version,
      target_profile_id: fixture.target_profile_id,
      target_profile_version: "1.0.0",
      allowed_fact_profiles: setProfile.allowed_fact_profiles.map((profileId) => ({
        profile_id: profileId,
        profile_version: "1.0.0",
      })),
      source_manifest_sha256: sourceManifestSha256(),
    },
    metadata: {
      contract_version: CONTRACT_VERSION,
      set_profile_id: setProfileId,
      fixture_id: fixture.fixture_id,
      synthetic_only: true,
      live_data_allowed: false,
      authority: ZERO_AUTHORITY,
    },
  });
  const setId = String(created.set.id);
  compatibleFacts.forEach((fact, position) => {
    addEvidenceSetMember(memoryDb, {
      setId,
      factElementId: fact.fact_id,
      position,
    });
  });
  const sealed = sealMemorySet(memoryDb, {
    setId,
    sealedBy: PRODUCER_ID,
  });
  return {
    set_id: setId,
    member_digest: sealed.seal.member_digest,
    compatible_facts: compatibleFacts,
  };
}

export function preparePartnerSemanticCalibrationFirstReviewBatch(params: {
  memoryDb: DatabaseSync;
}): PartnerCalibrationPreparation {
  const fixtures = listPartnerCalibrationFixtures();
  if (fixtures.length !== 16) {
    throw new Error("Partner calibration requires the exact 16-fixture cohort");
  }
  registerPartnerCalibrationProfiles(params.memoryDb);
  const manifest = loadCanonicalPartnerManifest();
  const prepared = fixtures.map((fixture) => {
    const output = partnerCalibrationObservationPayload(manifest, fixture);
    validateProfilePayload(manifest, fixture.target_profile_id, output);
    const facts = createFixtureFacts(params.memoryDb, fixture);
    const input = createFixtureInputSet(params.memoryDb, fixture, facts);
    return { fixture, facts, input };
  });
  const batch = createSemanticReviewBatch(params.memoryDb, {
    domain: "moonsleep.partner",
    batchLabel: BATCH_LABEL,
    reviewPolicyRef: POLICY_REF,
    sourceManifestSha256: sourceManifestSha256(),
    idempotencyKey: `${BATCH_LABEL}:batch:v1`,
    items: prepared.map(({ fixture, input }) => ({
      subject_type: "partner_calibration_subject",
      subject_ref: fixture.fixture_id,
      input_set_id: input.set_id,
      target_profile_id: fixture.target_profile_id,
      target_profile_version: "1.0.0",
      required_candidate_count: 3,
    })),
  });
  const batchId = String(batch.batch.id ?? batch.batch.batch_id);
  const reviewItemIds = new Map(
    batch.items.map((item) => [String(item.subject_ref), String(item.id)]),
  );
  const items = prepared.map(({ fixture, input }) => {
    const reviewItemId = reviewItemIds.get(fixture.fixture_id);
    if (!reviewItemId) throw new Error(`Partner review item is missing: ${fixture.fixture_id}`);
    return {
      fixture_id: fixture.fixture_id,
      scenario: fixture.scenario,
      review_item_id: reviewItemId,
      input_set_id: input.set_id,
      input_set_digest: input.member_digest,
      target_profile_id: fixture.target_profile_id,
      target_profile_version: "1.0.0" as const,
      fact_ids: input.compatible_facts.map((fact) => fact.fact_id),
      facts: input.compatible_facts,
      source_revisions: partnerCalibrationSourceRevisions(fixture).map((revision) => ({
        provider: revision.provider as "gmail" | "alibaba",
        revision_id: `synthetic:partner-revision:${revision.source_revision_sha256}`,
        source_logical_record_id: revision.source_logical_record_id,
        source_revision_sha256: revision.source_revision_sha256,
        payload_sha256: revision.payload_sha256,
        fragment_refs: revision.fragment_refs,
      })),
    } satisfies PartnerCalibrationPreparedItem;
  });
  const stableBody = {
    contract_version: CONTRACT_VERSION,
    batch_id: batchId,
    batch_label: BATCH_LABEL,
    fixture_count: 16 as const,
    fact_count: prepared.reduce((total, item) => total + item.facts.length, 0),
    sealed_input_count: 16 as const,
    gmail_fixture_count: fixtures.filter((fixture) => fixture.providers.includes("gmail")).length,
    alibaba_fixture_count: fixtures.filter((fixture) => fixture.providers.includes("alibaba")).length,
    cross_channel_fixture_count: fixtures.filter((fixture) => fixture.providers.length > 1).length,
    governing_core_commit: PARTNER_CALIBRATION_CORE_COMMIT,
    governing_core_tree: PARTNER_CALIBRATION_CORE_TREE,
    source_manifest_sha256: sourceManifestSha256(),
    input_sets: items.map((item) => ({
      fixture_id: item.fixture_id,
      input_set_id: item.input_set_id,
      input_set_digest: item.input_set_digest,
      fact_ids: item.fact_ids,
      source_revision_sha256s: item.source_revisions.map(
        (revision) => revision.source_revision_sha256,
      ),
    })),
    authority: ZERO_AUTHORITY,
  };
  return {
    ...stableBody,
    batch_reused: batch.reused,
    items,
    receipt_sha256: canonicalJsonSha256(stableBody),
  };
}

function buildReviewPrompt(item: PartnerCalibrationPreparedItem): string {
  return canonicalJsonString({
    contract_version: CONTRACT_VERSION,
    fixture_id: item.fixture_id,
    scenario: item.scenario,
    exact_source_revisions: item.source_revisions,
    sealed_input: {
      set_id: item.input_set_id,
      member_digest: item.input_set_digest,
      facts: item.facts.map((fact) => ({
        fact_id: fact.fact_id,
        profile_id: fact.profile_id,
        payload: fact.payload,
      })),
    },
    target_profile_id: item.target_profile_id,
    instructions: [
      "Use only the exact source-bound facts in the sealed input.",
      "Do not merge identities or invent a cross-provider conversation.",
      "Preserve explicit conflict, review, closure, and missing-reason semantics.",
      "Return only the requested Partner observation profile payload.",
      "Grant no promotion, provider, communication, payment, or external action authority.",
    ],
  });
}

export async function runPartnerSemanticCalibrationFirstReviewBatch(params: {
  memoryDb: DatabaseSync;
  modelService: JobModelService;
  preparation: PartnerCalibrationPreparation;
  executionMode: "synthetic_stub_only";
}): Promise<{ review_items: Record<string, unknown>[]; receipt: Record<string, unknown> }> {
  if (params.executionMode !== "synthetic_stub_only") {
    throw new Error("Partner first review batch permits synthetic stub execution only");
  }
  const manifest = loadCanonicalPartnerManifest();
  const settled = await Promise.allSettled(
    params.preparation.items.map(async (item) => {
      const profile = manifest.observation_profiles.find(
        (candidate) => candidate.profile_id === item.target_profile_id,
      );
      if (!profile) throw new Error(`missing Partner target profile ${item.target_profile_id}`);
      await runSemanticCalibrationCandidates({
        memoryDb: params.memoryDb,
        modelService: params.modelService,
        reviewItemId: item.review_item_id,
        candidates: [...PARTNER_CALIBRATION_MODEL_CANDIDATES],
        candidateRole: "partner_observation_resolution",
        promptId: "moonsleep-partner-first-review-fixture",
        promptVersion: "1",
        prompt: buildReviewPrompt(item),
        system:
          "You are producing a synthetic Partner Desk observation candidate for human calibration. " +
          "Use exact evidence only, keep provider-native conversations distinct, and grant no authority.",
        schemaName: "partner_observation_v1",
        schema: profile.schema,
        maxOutputTokens: 4_096,
        timeoutMs: 600_000,
      });
    }),
  );
  const failures = settled.flatMap((result, index) =>
    result.status === "rejected"
      ? [
          `${params.preparation.items[index]?.fixture_id ?? "unknown"}: ${
            result.reason instanceof Error ? result.reason.message : String(result.reason)
          }`,
        ]
      : [],
  );
  if (failures.length > 0) {
    throw new Error(`Partner semantic calibration batch is incomplete: ${failures.join("; ")}`);
  }
  const reviewItems = params.preparation.items.map((item) =>
    getSemanticReviewItem(params.memoryDb, item.review_item_id),
  );
  if (
    reviewItems.some(
      (item) => item.ready_for_review !== true || item.candidate_count !== 3 || item.decision !== null,
    )
  ) {
    throw new Error("Partner semantic calibration batch is not review-ready and undecided");
  }
  const blindCandidates = reviewItems.flatMap((item) =>
    (item.candidates as Array<Record<string, unknown>>).map((candidate) => {
      if (
        "model_id" in candidate ||
        "requested_model_id" in candidate ||
        "usage" in candidate ||
        "provider_response_id" in candidate
      ) {
        throw new Error("Partner review candidate leaked model identity before decision");
      }
      return {
        review_item_id: item.id,
        blind_slot: candidate.blind_slot,
        output_sha256: candidate.output_sha256,
      };
    }),
  );
  const counts = params.memoryDb
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM observation_candidates) AS observation_candidates,
         (SELECT COUNT(*) FROM observation_candidate_promotions) AS promotions,
         (SELECT COUNT(*) FROM semantic_review_decisions) AS decisions,
         (SELECT COUNT(*) FROM projection_outbox) AS projection_outbox`,
    )
    .get() as Record<string, number>;
  if (Object.values(counts).some((value) => value !== 0)) {
    throw new Error("Partner calibration created promotion, decision, or projection state");
  }
  const stableReceipt = {
    contract_version: CONTRACT_VERSION,
    batch_id: params.preparation.batch_id,
    fixture_count: 16,
    sealed_input_count: 16,
    review_ready_count: 16,
    candidate_count: blindCandidates.length,
    candidates_per_item: 3,
    blind_slots: ["A", "B", "C"],
    blind_candidate_set_sha256: canonicalJsonSha256(blindCandidates),
    execution_mode: params.executionMode,
    synthetic_model_invocations: blindCandidates.length,
    live_model_invocations: 0,
    provider_calls: 0,
    live_data_reads: 0,
    observation_candidates: counts.observation_candidates,
    promotions: counts.promotions,
    decisions: counts.decisions,
    projection_outbox: counts.projection_outbox,
    external_actions: 0,
    authority: ZERO_AUTHORITY,
  };
  return {
    review_items: reviewItems,
    receipt: { ...stableReceipt, receipt_sha256: canonicalJsonSha256(stableReceipt) },
  };
}

export function partnerCalibrationStubOutput(prompt: string): Record<string, unknown> {
  const parsed = JSON.parse(prompt) as { fixture_id: string; target_profile_id: string };
  const fixture = listPartnerCalibrationFixtures().find(
    (candidate) => candidate.fixture_id === parsed.fixture_id,
  );
  if (!fixture || fixture.target_profile_id !== parsed.target_profile_id) {
    throw new Error("Partner calibration stub prompt does not match a sealed fixture");
  }
  const manifest = loadCanonicalPartnerManifest();
  const output = partnerCalibrationObservationPayload(manifest, fixture);
  validateProfilePayload(manifest, fixture.target_profile_id, output);
  return output;
}
