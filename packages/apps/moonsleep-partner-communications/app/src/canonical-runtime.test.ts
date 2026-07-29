import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  loadCanonicalPartnerManifest,
  type CanonicalPartnerManifest,
} from "./canonical-prep.ts";
import {
  buildCanonicalPartnerRuntimePlan,
  type CoreSourceRevisionBinding,
} from "./canonical-runtime.ts";
import {
  prepareLegacyPartnerMigration,
  type LegacyPartnerMigrationInput,
} from "./legacy-migration.ts";

const fixture = JSON.parse(
  readFileSync(
    new URL("../fixtures/canonical/surewal-cross-channel-golden.v1.json", import.meta.url),
    "utf8",
  ),
) as LegacyPartnerMigrationInput;

function bindings(): CoreSourceRevisionBinding[] {
  return fixture.records.map((record, index) => ({
    source_record_id: record.source_record_id,
    revision_id: `record_revision_${String(index + 1).padStart(2, "0")}`,
    payload_sha256: `${(index + 10).toString(16)}`.repeat(64).slice(0, 64),
  }));
}

function runtimePlan(
  manifest = loadCanonicalPartnerManifest(),
  sourceRevisionBindings = bindings(),
) {
  return buildCanonicalPartnerRuntimePlan({
    manifest,
    migration: prepareLegacyPartnerMigration(manifest, fixture),
    sourceRevisionBindings,
  });
}

test("binds the complete Surewal cohort to exact core source revisions", () => {
  const plan = runtimePlan();
  assert.equal(plan.fact_plans.length, 26);
  assert.equal(plan.observation_plans.length, 9);
  assert.equal(
    new Set(
      plan.fact_plans.flatMap((fact) =>
        fact.create_params.sourceRevisionRefs.map((revision) => revision.revisionId),
      ),
    ).size,
    6,
  );
  assert.equal(
    new Set(plan.observation_plans.map((observation) => observation.set_profile_id)).size,
    3,
  );
});

test("keeps all canonical observation candidates staged and promotion authority false", () => {
  const plan = runtimePlan();
  assert.deepEqual(plan.authority, {
    provider_write: false,
    identity_merge: false,
    external_domain_write: false,
    draft_or_send: false,
    canonical_promotion: false,
  });
  assert.ok(
    plan.observation_plans.every(
      (observation) =>
        observation.stage_params.expectedHeadId === null &&
        observation.stage_params.actorRef === "actor:moonsleep-partner-desk-cleanroom" &&
        !("projectionEvents" in observation.stage_params),
    ),
  );
});

test("creates exact generic evidence-set scopes for every Partner observation profile", () => {
  const plan = runtimePlan();
  for (const observation of plan.observation_plans) {
    assert.equal(observation.set_create_params.definitionId, "evidence_set_v1");
    assert.equal(observation.set_create_params.evidenceScope.domain, "moonsleep.partner");
    assert.equal(
      observation.set_create_params.evidenceScope.targetProfileId,
      observation.stage_params.profileId,
    );
    assert.equal(
      observation.set_create_params.evidenceScope.resolverId,
      observation.stage_params.resolverId,
    );
    assert.deepEqual(
      [...observation.candidate_fact_ids].sort(),
      observation.candidate_fact_ids,
    );
  }
});

test("rejects missing, extra, duplicate, and malformed core revision bindings", () => {
  const exact = bindings();
  assert.throws(() => runtimePlan(undefined, exact.slice(1)), /binding is missing/);
  assert.throws(
    () =>
      runtimePlan(undefined, [
        ...exact,
        {
          source_record_id: "foreign-record",
          revision_id: "foreign-revision",
          payload_sha256: "f".repeat(64),
        },
      ]),
    /do not exactly cover/,
  );
  assert.throws(() => runtimePlan(undefined, [...exact, exact[0]!]), /duplicated/);
  assert.throws(
    () => runtimePlan(undefined, [{ ...exact[0]!, payload_sha256: "bad" }, ...exact.slice(1)]),
    /incomplete or duplicated/,
  );
});

test("rejects a set-profile resolver mismatch before any runtime request is emitted", () => {
  const manifest = structuredClone(loadCanonicalPartnerManifest()) as CanonicalPartnerManifest;
  manifest.sealed_set_profiles[1]!.resolver_id = "moonsleep.partner.foreign-resolver.v1";
  assert.throws(() => runtimePlan(manifest), /set profile resolver mismatch/);
});
