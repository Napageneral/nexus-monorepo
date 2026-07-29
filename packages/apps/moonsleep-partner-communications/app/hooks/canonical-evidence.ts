import { readFileSync } from "node:fs";
import type { NexClient } from "../../../../../nex/src/runtime/internal-runtime-client.js";
import {
  DEFAULT_CANONICAL_MANIFEST_PATH,
  loadCanonicalPartnerManifest,
  sha256,
  type CanonicalPartnerManifest,
} from "../src/canonical-prep.js";

type Row = Record<string, unknown>;

const PROFILE_VERSION = "1.0.0";
const OWNER_PACKAGE = "moonsleep-partner-desk";

function row(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function payload(value: unknown): Row {
  const outer = row(value);
  if (outer.ok === false) {
    throw new Error(text(row(outer.error).message) || "Nex operation failed");
  }
  const nested = row(outer.payload);
  return Object.keys(nested).length > 0 ? nested : outer;
}

export type RegisteredPartnerEvidence = {
  sourceManifestSha256: string;
  factProfileIds: string[];
  observationProfileIds: string[];
  setProfileIds: string[];
  reusedProfileCount: number;
};

export type PartnerEvidenceSetScope = {
  definitionId: "evidence_set_v1";
  setProfileId: string;
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

export function canonicalPartnerSourceManifestSha256(): string {
  return sha256(readFileSync(DEFAULT_CANONICAL_MANIFEST_PATH));
}

function expectedProfiles(manifest: CanonicalPartnerManifest) {
  return [
    ...manifest.fact_profiles.map((profile) => ({
      profileId: profile.profile_id,
      profileVersion: profile.profile_version,
      elementType: "fact" as const,
      schema: profile.schema,
      description: `${profile.fact_type} for ${profile.subject_type}`,
    })),
    ...manifest.observation_profiles.map((profile) => ({
      profileId: profile.profile_id,
      profileVersion: profile.profile_version,
      elementType: "observation" as const,
      schema: profile.schema,
      description: `${profile.observation_type} for ${profile.subject_type}`,
    })),
  ];
}

function assertRegisteredProfile(input: {
  item: Row;
  profileId: string;
  elementType: "fact" | "observation";
  sourceManifestSha256: string;
}): void {
  if (
    text(input.item.profile_id) !== input.profileId ||
    text(input.item.profile_version) !== PROFILE_VERSION ||
    text(input.item.element_type) !== input.elementType ||
    text(input.item.owner_package) !== OWNER_PACKAGE ||
    text(input.item.source_manifest_sha256) !== input.sourceManifestSha256 ||
    text(input.item.status) !== "active"
  ) {
    throw new Error(`canonical profile registration mismatch: ${input.profileId}`);
  }
}

export function partnerEvidenceSetScope(input: {
  setProfileId: string;
  targetObservationProfileId: string;
  sourceManifestSha256?: string;
  manifest?: CanonicalPartnerManifest;
}): PartnerEvidenceSetScope {
  const manifest = input.manifest ?? loadCanonicalPartnerManifest();
  const setProfile = manifest.sealed_set_profiles.find(
    (profile) => profile.set_profile_id === input.setProfileId,
  );
  if (!setProfile) {
    throw new Error(`unknown Partner set profile: ${input.setProfileId}`);
  }
  if (!setProfile.target_observation_profiles.includes(input.targetObservationProfileId)) {
    throw new Error(
      `${input.setProfileId} cannot target ${input.targetObservationProfileId}`,
    );
  }
  return {
    definitionId: setProfile.core_definition_id,
    setProfileId: setProfile.set_profile_id,
    evidenceScope: {
      domain: "moonsleep.partner",
      purpose: setProfile.purpose,
      resolverId: setProfile.resolver_id,
      resolverPolicyVersion: PROFILE_VERSION,
      targetProfileId: input.targetObservationProfileId,
      targetProfileVersion: PROFILE_VERSION,
      allowedFactProfiles: setProfile.allowed_fact_profiles.map((profileId) => ({
        profileId,
        profileVersion: PROFILE_VERSION,
      })),
      sourceManifestSha256:
        input.sourceManifestSha256 ?? canonicalPartnerSourceManifestSha256(),
    },
  };
}

export async function ensurePartnerCanonicalEvidence(
  runtime: NexClient,
): Promise<RegisteredPartnerEvidence> {
  const manifest = loadCanonicalPartnerManifest();
  const sourceManifestSha256 = canonicalPartnerSourceManifestSha256();
  let reusedProfileCount = 0;

  for (const profile of expectedProfiles(manifest)) {
    const response = payload(
      await runtime.memory.evidence.profiles.register({
        profileId: profile.profileId,
        profileVersion: profile.profileVersion,
        elementType: profile.elementType,
        schema: profile.schema,
        ownerPackage: OWNER_PACKAGE,
        sourceManifestSha256,
        compatibility: {
          compatibility_mode: "initial",
          previous_profile_version: null,
        },
        description: profile.description,
      }),
    );
    assertRegisteredProfile({
      item: row(response.item),
      profileId: profile.profileId,
      elementType: profile.elementType,
      sourceManifestSha256,
    });
    if (response.reused === true) reusedProfileCount += 1;
  }

  const listed = payload(await runtime.memory.evidence.profiles.list({}));
  const items = Array.isArray(listed.items) ? listed.items.map(row) : [];
  for (const profile of expectedProfiles(manifest)) {
    const matches = items.filter(
      (item) =>
        text(item.profile_id) === profile.profileId &&
        text(item.profile_version) === profile.profileVersion,
    );
    if (matches.length !== 1) {
      throw new Error(`canonical profile inventory mismatch: ${profile.profileId}`);
    }
    assertRegisteredProfile({
      item: matches[0]!,
      profileId: profile.profileId,
      elementType: profile.elementType,
      sourceManifestSha256,
    });
  }

  return {
    sourceManifestSha256,
    factProfileIds: manifest.fact_profiles.map((profile) => profile.profile_id).sort(),
    observationProfileIds: manifest.observation_profiles
      .map((profile) => profile.profile_id)
      .sort(),
    setProfileIds: manifest.sealed_set_profiles
      .map((profile) => profile.set_profile_id)
      .sort(),
    reusedProfileCount,
  };
}

export async function readPartnerCanonicalEvidenceHealth(runtime: NexClient): Promise<Row> {
  const manifest = loadCanonicalPartnerManifest();
  const sourceManifestSha256 = canonicalPartnerSourceManifestSha256();
  const listed = payload(await runtime.memory.evidence.profiles.list({}));
  const items = Array.isArray(listed.items) ? listed.items.map(row) : [];
  const expected = expectedProfiles(manifest);
  const matching = expected.filter((profile) =>
    items.some(
      (item) =>
        text(item.profile_id) === profile.profileId &&
        text(item.profile_version) === profile.profileVersion &&
        text(item.element_type) === profile.elementType &&
        text(item.owner_package) === OWNER_PACKAGE &&
        text(item.source_manifest_sha256) === sourceManifestSha256 &&
        text(item.status) === "active",
    ),
  );
  return {
    source_manifest_sha256: sourceManifestSha256,
    fact_profiles_registered: matching.filter((profile) => profile.elementType === "fact").length,
    observation_profiles_registered: matching.filter(
      (profile) => profile.elementType === "observation",
    ).length,
    set_profiles_registered_in_package: manifest.sealed_set_profiles.length,
    registration_complete: matching.length === expected.length,
    canonical_promotion_enabled: false,
  };
}
