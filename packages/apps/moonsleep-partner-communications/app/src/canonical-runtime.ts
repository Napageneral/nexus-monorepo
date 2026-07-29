import { readFileSync } from "node:fs";
import {
  DEFAULT_CANONICAL_MANIFEST_PATH,
  sha256,
} from "./canonical-prep.ts";
import type { CanonicalPartnerManifest } from "./canonical-prep.js";
import type {
  LegacyPartnerMigrationPlan,
  ShadowObservationCandidate,
} from "./legacy-migration.js";

type JsonObject = Record<string, unknown>;

export type CoreSourceRevisionBinding = {
  source_record_id: string;
  revision_id: string;
  payload_sha256: string;
};

export type CanonicalFactRuntimePlan = {
  candidate_fact_id: string;
  create_params: {
    profileId: string;
    profileVersion: "1.0.0";
    payload: JsonObject;
    summary: string;
    subjectType: string;
    subjectRef: string;
    producerId: "moonsleep-partner-desk";
    producerVersion: string;
    extractionPolicyRef: "policy:moonsleep-partner-canonical-extraction-v1";
    reviewReceiptRef: string | null;
    sourceRevisionRefs: Array<{
      revisionId: string;
      payloadSha256: string;
      fragmentRefs: string[];
    }>;
    entityIds: string[];
    asOf: number;
    idempotencyKey: string;
  };
};

export type CanonicalObservationRuntimePlan = {
  candidate_id: string;
  set_profile_id: string;
  set_create_params: {
    definitionId: "evidence_set_v1";
    idempotencyKey: string;
    evidenceScope: {
      domain: "moonsleep.partner";
      purpose: string;
      resolverId: string;
      resolverPolicyVersion: "1.0.0";
      targetProfileId: string;
      targetProfileVersion: "1.0.0";
      allowedFactProfiles: Array<{
        profileId: string;
        profileVersion: "1.0.0";
      }>;
      sourceManifestSha256: string;
    };
  };
  candidate_fact_ids: string[];
  stage_params: {
    headKey: string;
    expectedHeadId: string | null;
    profileId: string;
    profileVersion: "1.0.0";
    payload: JsonObject;
    summary: string;
    subjectType: string;
    subjectRef: string;
    resolverId: string;
    resolverVersion: "1.0.0";
    resolverPolicyVersion: "1.0.0";
    reviewReceiptRef: string;
    actorRef: "actor:moonsleep-partner-desk-cleanroom";
    policyRef: "policy:moonsleep-partner-shadow-v1";
    idempotencyKey: string;
    asOf: number;
  };
};

export type CanonicalPartnerRuntimePlan = {
  source_manifest_sha256: string;
  migration_id: string;
  workspace_id: string;
  canonical_partner_entity_id: string;
  fact_plans: CanonicalFactRuntimePlan[];
  observation_plans: CanonicalObservationRuntimePlan[];
  authority: {
    provider_write: false;
    identity_merge: false;
    external_domain_write: false;
    draft_or_send: false;
    canonical_promotion: false;
  };
};

function requireBindingMap(bindings: CoreSourceRevisionBinding[]) {
  const result = new Map<string, CoreSourceRevisionBinding>();
  for (const binding of bindings) {
    if (
      !binding.source_record_id ||
      !binding.revision_id ||
      !/^[0-9a-f]{64}$/.test(binding.payload_sha256) ||
      result.has(binding.source_record_id)
    ) {
      throw new Error("source revision bindings are incomplete or duplicated");
    }
    result.set(binding.source_record_id, binding);
  }
  return result;
}

function observationSetProfileId(profileId: string): string {
  if (profileId === "moonsleep.partner.workspace-state.v1") {
    return "moonsleep.partner.extraction-source-set.v1";
  }
  if (profileId === "moonsleep.partner.open-loop-state.v1") {
    return "moonsleep.partner.resolver-fact-set.v1";
  }
  if (profileId === "moonsleep.partner.source-coverage-state.v1") {
    return "moonsleep.partner.comparison-set.v1";
  }
  throw new Error(`unsupported Partner observation profile: ${profileId}`);
}

function canonicalPartnerSourceManifestSha256(): string {
  return sha256(readFileSync(DEFAULT_CANONICAL_MANIFEST_PATH));
}

function observationPlan(input: {
  manifest: CanonicalPartnerManifest;
  migration: LegacyPartnerMigrationPlan;
  candidate: ShadowObservationCandidate;
  sourceManifestSha256: string;
}): CanonicalObservationRuntimePlan {
  const profile = input.manifest.observation_profiles.find(
    (candidate) => candidate.profile_id === input.candidate.observation_profile_id,
  );
  if (!profile) {
    throw new Error(
      `observation profile is absent from the canonical manifest: ${input.candidate.observation_profile_id}`,
    );
  }
  const setProfileId = observationSetProfileId(input.candidate.observation_profile_id);
  const setProfile = input.manifest.sealed_set_profiles.find(
    (candidate) => candidate.set_profile_id === setProfileId,
  );
  if (
    !setProfile ||
    !setProfile.target_observation_profiles.includes(
      input.candidate.observation_profile_id,
    )
  ) {
    throw new Error(`set profile target mismatch: ${setProfileId}`);
  }
  if (setProfile.resolver_id !== input.candidate.resolver_id) {
    throw new Error(`set profile resolver mismatch: ${setProfileId}`);
  }
  const candidateFactIds = [...input.candidate.sealed_fact_set.member_ids].sort();
  if (candidateFactIds.length === 0) {
    throw new Error(`observation candidate has no facts: ${input.candidate.candidate_id}`);
  }
  return {
    candidate_id: input.candidate.candidate_id,
    set_profile_id: setProfileId,
    set_create_params: {
      definitionId: setProfile.core_definition_id,
      idempotencyKey: `partner-set:${input.candidate.candidate_id}`,
      evidenceScope: {
        domain: "moonsleep.partner",
        purpose: setProfile.purpose,
        resolverId: setProfile.resolver_id,
        resolverPolicyVersion: "1.0.0",
        targetProfileId: input.candidate.observation_profile_id,
        targetProfileVersion: "1.0.0",
        allowedFactProfiles: setProfile.allowed_fact_profiles.map((profileId) => ({
          profileId,
          profileVersion: "1.0.0",
        })),
        sourceManifestSha256: input.sourceManifestSha256,
      },
    },
    candidate_fact_ids: candidateFactIds,
    stage_params: {
      headKey: input.candidate.head_key,
      expectedHeadId: input.candidate.expected_head_id,
      profileId: input.candidate.observation_profile_id,
      profileVersion: input.candidate.observation_profile_version,
      payload: input.candidate.typed_payload,
      summary: `${input.candidate.observation_type} for ${input.candidate.subject_reference}`,
      subjectType: profile.subject_type,
      subjectRef: input.candidate.subject_reference,
      resolverId: input.candidate.resolver_id,
      resolverVersion: "1.0.0",
      resolverPolicyVersion: "1.0.0",
      reviewReceiptRef: `legacy-review:${input.migration.migration_id}`,
      actorRef: "actor:moonsleep-partner-desk-cleanroom",
      policyRef: "policy:moonsleep-partner-shadow-v1",
      idempotencyKey: `partner-stage:${input.candidate.candidate_id}`,
      asOf: 1_785_000_000_000,
    },
  };
}

export function buildCanonicalPartnerRuntimePlan(input: {
  manifest: CanonicalPartnerManifest;
  migration: LegacyPartnerMigrationPlan;
  sourceRevisionBindings: CoreSourceRevisionBinding[];
}): CanonicalPartnerRuntimePlan {
  const bindings = requireBindingMap(input.sourceRevisionBindings);
  const sourceManifestSha256 = canonicalPartnerSourceManifestSha256();
  const expectedSourceRecordIds = new Set<string>();

  const factPlans = input.migration.facts.map((fact) => {
    const profile = input.manifest.fact_profiles.find(
      (candidate) => candidate.profile_id === fact.fact_profile_id,
    );
    if (!profile) {
      throw new Error(`fact profile is absent from the canonical manifest: ${fact.fact_profile_id}`);
    }
    const sourceRevisionRefs = fact.source_revision_refs.map((sourceRef) => {
      expectedSourceRecordIds.add(sourceRef.source_logical_record_id);
      const binding = bindings.get(sourceRef.source_logical_record_id);
      if (!binding) {
        throw new Error(
          `core source revision binding is missing: ${sourceRef.source_logical_record_id}`,
        );
      }
      return {
        revisionId: binding.revision_id,
        payloadSha256: binding.payload_sha256,
        fragmentRefs: [...sourceRef.fragment_refs].sort(),
      };
    });
    return {
      candidate_fact_id: fact.fact_id,
      create_params: {
        profileId: fact.fact_profile_id,
        profileVersion: fact.fact_profile_version,
        payload: fact.typed_payload,
        summary: `${fact.fact_type} for ${fact.subject_reference}`,
        subjectType: profile.subject_type,
        subjectRef: fact.subject_reference,
        producerId: "moonsleep-partner-desk" as const,
        producerVersion: fact.producer_version,
        extractionPolicyRef: "policy:moonsleep-partner-canonical-extraction-v1" as const,
        reviewReceiptRef:
          fact.review_state === "reviewed"
            ? `legacy-review:${input.migration.migration_id}`
            : null,
        sourceRevisionRefs,
        entityIds: [input.migration.canonical_partner_entity_id],
        asOf: 1_785_000_000_000,
        idempotencyKey: `partner-fact:${fact.fact_id}`,
      },
    };
  });

  const suppliedSourceRecordIds = new Set(bindings.keys());
  if (
    expectedSourceRecordIds.size !== suppliedSourceRecordIds.size ||
    [...expectedSourceRecordIds].some((recordId) => !suppliedSourceRecordIds.has(recordId))
  ) {
    throw new Error("core source revision bindings do not exactly cover the canonical cohort");
  }

  const factIds = new Set(factPlans.map((fact) => fact.candidate_fact_id));
  const observationPlans = input.migration.observation_candidates.map((candidate) => {
    if (candidate.sealed_fact_set.member_ids.some((factId) => !factIds.has(factId))) {
      throw new Error(`observation candidate references an unknown fact: ${candidate.candidate_id}`);
    }
    return observationPlan({
      manifest: input.manifest,
      migration: input.migration,
      candidate,
      sourceManifestSha256,
    });
  });

  if (
    new Set(observationPlans.map((plan) => plan.set_profile_id)).size !==
    input.manifest.sealed_set_profiles.length
  ) {
    throw new Error("synthetic cohort does not exercise every Partner set profile");
  }

  return {
    source_manifest_sha256: sourceManifestSha256,
    migration_id: input.migration.migration_id,
    workspace_id: input.migration.workspace_id,
    canonical_partner_entity_id: input.migration.canonical_partner_entity_id,
    fact_plans: factPlans,
    observation_plans: observationPlans,
    authority: {
      provider_write: false,
      identity_merge: false,
      external_domain_write: false,
      draft_or_send: false,
      canonical_promotion: false,
    },
  };
}
