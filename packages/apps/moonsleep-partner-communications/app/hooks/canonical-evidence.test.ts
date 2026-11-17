import assert from "node:assert/strict";
import { test } from "vitest";
import {
  canonicalPartnerSourceManifestSha256,
  ensurePartnerCanonicalEvidence,
  partnerEvidenceSetScope,
  readPartnerCanonicalEvidenceHealth,
} from "./canonical-evidence.ts";

type Row = Record<string, unknown>;

function evidenceRuntime() {
  const profiles: Row[] = [];
  return {
    profiles,
    runtime: {
      memory: {
        evidence: {
          profiles: {
            register: async (params: Row) => {
              const existing = profiles.find(
                (profile) =>
                  profile.profile_id === params.profileId &&
                  profile.profile_version === params.profileVersion,
              );
              if (existing) {
                assert.deepEqual(existing.schema, params.schema);
                assert.equal(existing.source_manifest_sha256, params.sourceManifestSha256);
                return { payload: { item: existing, reused: true } };
              }
              const item = {
                profile_id: params.profileId,
                profile_version: params.profileVersion,
                element_type: params.elementType,
                schema: params.schema,
                owner_package: params.ownerPackage,
                source_manifest_sha256: params.sourceManifestSha256,
                status: "active",
              };
              profiles.push(item);
              return { payload: { item, reused: false } };
            },
            list: async () => ({ payload: { items: profiles } }),
          },
        },
      },
    },
  };
}

test("registers exactly five fact and three observation profiles and replays all eight", async () => {
  const fixture = evidenceRuntime();
  const first = await ensurePartnerCanonicalEvidence(fixture.runtime as never);
  assert.equal(first.factProfileIds.length, 5);
  assert.equal(first.observationProfileIds.length, 3);
  assert.equal(first.setProfileIds.length, 3);
  assert.equal(first.reusedProfileCount, 0);
  assert.equal(fixture.profiles.length, 8);

  const replay = await ensurePartnerCanonicalEvidence(fixture.runtime as never);
  assert.deepEqual(replay, { ...first, reusedProfileCount: 8 });
  assert.equal(fixture.profiles.length, 8);
});

test("binds all registrations to the exact canonical Partner source manifest", async () => {
  const fixture = evidenceRuntime();
  const result = await ensurePartnerCanonicalEvidence(fixture.runtime as never);
  assert.equal(result.sourceManifestSha256, canonicalPartnerSourceManifestSha256());
  assert.match(result.sourceManifestSha256, /^[0-9a-f]{64}$/);
  assert.ok(
    fixture.profiles.every(
      (profile) => profile.source_manifest_sha256 === result.sourceManifestSha256,
    ),
  );
});

test("maps each Partner set profile to the generic immutable core evidence-set contract", () => {
  const extraction = partnerEvidenceSetScope({
    setProfileId: "moonsleep.partner.extraction-source-set.v1",
    targetObservationProfileId: "moonsleep.partner.workspace-state.v1",
  });
  const resolver = partnerEvidenceSetScope({
    setProfileId: "moonsleep.partner.resolver-fact-set.v1",
    targetObservationProfileId: "moonsleep.partner.open-loop-state.v1",
  });
  const comparison = partnerEvidenceSetScope({
    setProfileId: "moonsleep.partner.comparison-set.v1",
    targetObservationProfileId: "moonsleep.partner.source-coverage-state.v1",
  });

  for (const profile of [extraction, resolver, comparison]) {
    assert.equal(profile.definitionId, "evidence_set_v1");
    assert.equal(profile.evidenceScope.domain, "moonsleep.partner");
    assert.equal(profile.evidenceScope.targetProfileVersion, "1.0.0");
    assert.equal(profile.evidenceScope.resolverPolicyVersion, "1.0.0");
    assert.ok(profile.evidenceScope.allowedFactProfiles.length > 0);
    assert.ok(
      profile.evidenceScope.allowedFactProfiles.every(
        (factProfile) => factProfile.profileVersion === "1.0.0",
      ),
    );
  }
  assert.equal(new Set([extraction.setProfileId, resolver.setProfileId, comparison.setProfileId]).size, 3);
});

test("rejects an unknown set profile and a cross-profile target", () => {
  assert.throws(
    () =>
      partnerEvidenceSetScope({
        setProfileId: "moonsleep.partner.unknown-set.v1",
        targetObservationProfileId: "moonsleep.partner.workspace-state.v1",
      }),
    /unknown Partner set profile/,
  );
  assert.throws(
    () =>
      partnerEvidenceSetScope({
        setProfileId: "moonsleep.partner.resolver-fact-set.v1",
        targetObservationProfileId: "moonsleep.partner.workspace-state.v1",
      }),
    /cannot target/,
  );
});

test("reports complete dormant registration without enabling canonical promotion", async () => {
  const fixture = evidenceRuntime();
  await ensurePartnerCanonicalEvidence(fixture.runtime as never);
  assert.deepEqual(await readPartnerCanonicalEvidenceHealth(fixture.runtime as never), {
    source_manifest_sha256: canonicalPartnerSourceManifestSha256(),
    fact_profiles_registered: 5,
    observation_profiles_registered: 3,
    set_profiles_registered_in_package: 3,
    registration_complete: true,
    canonical_promotion_enabled: false,
  });
});
