import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  canonicalJson,
  loadCanonicalPartnerManifest,
  sha256,
} from "./canonical-prep.ts";
import {
  prepareLegacyPartnerMigration,
  simulateExpectedHeadCommit,
  type LegacyPartnerMigrationInput,
} from "./legacy-migration.ts";
import {
  SUREWAL_PROVIDER_THREAD_ID,
  surewalReviewedBaseline,
} from "./surewal-baseline.ts";

const fixturePath = fileURLToPath(
  new URL("../fixtures/canonical/surewal-cross-channel-golden.v1.json", import.meta.url),
);
const manifest = loadCanonicalPartnerManifest();

function fixture(): LegacyPartnerMigrationInput {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as LegacyPartnerMigrationInput;
}

function existingSurewalBaselineFixture(): LegacyPartnerMigrationInput {
  const records = surewalReviewedBaseline.record_ids.map((sourceRecordId, index) => {
    const sourceRevisionSha256 = sha256(sourceRecordId);
    return {
      source_record_id: sourceRecordId,
      source_revision_sha256: sourceRevisionSha256,
      provider: "alibaba" as const,
      connection_id: "moonsleep-alibaba",
      provider_thread_id: SUREWAL_PROVIDER_THREAD_ID,
      provider_message_id: sourceRecordId.split(":")[3] ?? `message-${index}`,
      observed_at: new Date(Date.UTC(2026, 6, 17, 0, index)).toISOString(),
      direction: "inbound" as const,
      summary: `Sanitized existing Surewal baseline row ${index + 1}`,
      attachment_count: 0,
      source_revision_ref: {
        provider: "alibaba" as const,
        adapter_package_id: "moonsleep-alibaba-evidence",
        adapter_package_version: "legacy-baseline-fixture-v1",
        connection_id: "moonsleep-alibaba",
        provider_account_id: "moonsleep-alibaba-buyer",
        provider_record_id: sourceRecordId.split(":")[3] ?? `message-${index}`,
        provider_revision_id: null,
        source_logical_record_id: sourceRecordId,
        source_revision_sha256: sourceRevisionSha256,
        payload_sha256: sha256(`payload:${sourceRecordId}`),
        source_at: new Date(Date.UTC(2026, 6, 17, 0, index)).toISOString(),
        captured_at: new Date(Date.UTC(2026, 6, 17, 1, index)).toISOString(),
        fragment_refs: [`fragment:${sourceRecordId}:body`],
        attachment_refs: [],
        source_run_receipt_ref: "source-run:alibaba:surewal-reviewed-baseline-fixture",
        provider_read_authority: true as const,
        provider_write_authority: false as const,
      },
    };
  });
  return {
    migration_id: "partner-legacy-migration:surewal-20260717-reviewed-baseline-v1",
    workspace_id: "moonsleep-ops",
    workspace_key: surewalReviewedBaseline.workspace_key,
    canonical_partner_entity_id: surewalReviewedBaseline.canonical_entity_id,
    partner_contact_id: surewalReviewedBaseline.identity_resolutions[0]!.contact_id!,
    partner_display_name: "Surewal",
    person_organization_relationships: [],
    legacy_package_version: "0.2.1",
    legacy_review_revision_sha256: sha256(canonicalJson(surewalReviewedBaseline)),
    records,
    identity_resolutions: [...surewalReviewedBaseline.identity_resolutions],
    workspace_assertions: [...surewalReviewedBaseline.workspace_assertions],
    open_loop_assertions: [...surewalReviewedBaseline.open_loop_assertions],
    source_coverage_assertions: [...surewalReviewedBaseline.source_coverage_assertions],
    structured_claims: [],
  };
}

test("Surewal golden fixture creates exact canonical fact and observation candidates", () => {
  const input = fixture();
  const plan = prepareLegacyPartnerMigration(manifest, input);
  const factsByProfile = new Map<string, typeof plan.facts>();
  for (const fact of plan.facts) {
    const current = factsByProfile.get(fact.fact_profile_id) ?? [];
    current.push(fact);
    factsByProfile.set(fact.fact_profile_id, current);
  }
  assert.equal(input.records.length, 6);
  assert.equal(factsByProfile.get("moonsleep.partner.communication-classification.v1")?.length, 6);
  assert.equal(factsByProfile.get("moonsleep.partner.workspace-admission.v1")?.length, 6);
  assert.equal(factsByProfile.get("moonsleep.partner.source-coverage.v1")?.length, 6);
  assert.equal(factsByProfile.get("moonsleep.partner.open-loop-signal.v1")?.length, 6);
  assert.equal(factsByProfile.get("moonsleep.partner.structured-claim.v1")?.length, 2);
  assert.equal(plan.facts.length, 26);
  assert.equal(plan.observation_candidates.length, 9);
  assert.equal(new Set(plan.observation_candidates.map((row) => row.head_key)).size, 9);
  assert.equal(plan.extraction_source_set.member_count, 26);
  assert.equal(plan.projection_candidate.observation_candidate_ids.length, 9);
  assert.equal(plan.authority.provider_write, false);
  assert.equal(plan.authority.identity_merge, false);
  assert.equal(plan.authority.external_domain_write, false);
  assert.equal(plan.authority.draft_or_send, false);
});

test("golden workspace preserves two native channels and two independent open loops", () => {
  const plan = prepareLegacyPartnerMigration(manifest, fixture());
  const workspace = plan.observation_candidates.find(
    (candidate) =>
      candidate.observation_profile_id === "moonsleep.partner.workspace-state.v1",
  );
  assert.ok(workspace);
  assert.equal(
    (workspace.typed_payload.native_conversation_refs as unknown[]).length,
    2,
  );
  assert.deepEqual(
    workspace.typed_payload.current_open_loop_ids,
    [
      "surewal-payment-balance-fixture",
      "surewal-production-timing-fixture",
    ],
  );

  const loops = plan.observation_candidates
    .filter((candidate) =>
      candidate.observation_profile_id === "moonsleep.partner.open-loop-state.v1"
    )
    .map((candidate) => candidate.typed_payload);
  const production = loops.find(
    (loop) => loop.open_loop_id === "surewal-production-timing-fixture",
  );
  const payment = loops.find(
    (loop) => loop.open_loop_id === "surewal-payment-balance-fixture",
  );
  assert.equal(production?.semantic_lifecycle, "resolved");
  assert.deepEqual(production?.closure_evidence_revisions, ["6".repeat(64)]);
  assert.equal(
    (production?.supporting_evidence_revisions as unknown[]).length,
    5,
  );
  assert.equal(payment?.semantic_lifecycle, "waiting_on_moonsleep");
  assert.deepEqual(payment?.closure_evidence_revisions, []);
});

test("existing 0.2.1 Surewal baseline maps completely into canonical shadow candidates", () => {
  const input = existingSurewalBaselineFixture();
  const plan = prepareLegacyPartnerMigration(manifest, input);
  assert.equal(plan.extraction_source_set.member_count, plan.facts.length);
  assert.equal(
    plan.observation_candidates.filter(
      (candidate) =>
        candidate.observation_profile_id === "moonsleep.partner.open-loop-state.v1",
    ).length,
    13,
  );
  assert.equal(
    plan.observation_candidates.filter(
      (candidate) =>
        candidate.observation_profile_id === "moonsleep.partner.source-coverage-state.v1",
    ).length,
    22,
  );
  assert.equal(
    plan.observation_candidates.filter(
      (candidate) =>
        candidate.observation_profile_id === "moonsleep.partner.workspace-state.v1",
    ).length,
    1,
  );
  assert.equal(plan.observation_candidates.length, 36);
  assert.equal(plan.authority.provider_write, false);
  assert.deepEqual(
    prepareLegacyPartnerMigration(manifest, input),
    plan,
  );
});

test("complete migration replay produces byte-identical plan and no duplicate identities", () => {
  const first = prepareLegacyPartnerMigration(manifest, fixture());
  const replay = prepareLegacyPartnerMigration(manifest, fixture());
  assert.deepEqual(replay, first);
  assert.equal(canonicalJson(replay), canonicalJson(first));
  assert.equal(replay.plan_sha256, first.plan_sha256);
  assert.equal(new Set(first.facts.map((fact) => fact.fact_id)).size, first.facts.length);
  assert.equal(
    new Set(first.observation_candidates.map((candidate) => candidate.candidate_id)).size,
    first.observation_candidates.length,
  );
});

test("migration fails closed on missing coverage and cross-entity identity", () => {
  const missingCoverage = fixture();
  missingCoverage.source_coverage_assertions.pop();
  assert.throws(
    () => prepareLegacyPartnerMigration(manifest, missingCoverage),
    /does not cover the exact migration cohort/,
  );

  const crossEntity = fixture();
  crossEntity.identity_resolutions[0] = {
    ...crossEntity.identity_resolutions[0]!,
    canonical_entity_id: "entity-other-fixture",
  };
  assert.throws(
    () => prepareLegacyPartnerMigration(manifest, crossEntity),
    /identity is not eligible/,
  );
});

test("migration fails closed on false closure, foreign evidence, and source tamper", () => {
  const falseClosure = fixture();
  falseClosure.open_loop_assertions[0] = {
    ...falseClosure.open_loop_assertions[0]!,
    lifecycle: "resolved",
    closure_source_record_ids: [],
  };
  assert.throws(
    () => prepareLegacyPartnerMigration(manifest, falseClosure),
    /resolved loop lacks closure evidence/,
  );

  const foreignEvidence = fixture();
  foreignEvidence.open_loop_assertions[0] = {
    ...foreignEvidence.open_loop_assertions[0]!,
    evidence_source_record_ids: [
      ...foreignEvidence.open_loop_assertions[0]!.evidence_source_record_ids,
      "gmail:fixture:message:foreign",
    ],
  };
  assert.throws(
    () => prepareLegacyPartnerMigration(manifest, foreignEvidence),
    /references a foreign record/,
  );

  const tamperedRevision = fixture();
  tamperedRevision.records[0] = {
    ...tamperedRevision.records[0]!,
    source_revision_sha256: "f".repeat(64),
  };
  assert.throws(
    () => prepareLegacyPartnerMigration(manifest, tamperedRevision),
    /does not bind the legacy revision/,
  );
});

test("migration fails closed on provider write authority and duplicate source identity", () => {
  const writeEnabled = fixture();
  writeEnabled.records[0] = {
    ...writeEnabled.records[0]!,
    source_revision_ref: {
      ...writeEnabled.records[0]!.source_revision_ref,
      provider_write_authority: true,
    },
  } as unknown as LegacyPartnerMigrationInput["records"][number];
  assert.throws(
    () => prepareLegacyPartnerMigration(manifest, writeEnabled),
    /authority is invalid/,
  );

  const duplicateRecord = fixture();
  duplicateRecord.records.push(structuredClone(duplicateRecord.records[0]!));
  assert.throws(
    () => prepareLegacyPartnerMigration(manifest, duplicateRecord),
    /contains duplicate/,
  );
});

test("expected-head simulation permits one successor and rejects the stale writer", () => {
  const current = "partner-observation:current";
  const first = simulateExpectedHeadCommit({
    current_head_id: current,
    expected_head_id: current,
    candidate_id: "partner-observation:candidate-a",
  });
  assert.deepEqual(first, {
    outcome: "committed",
    head_id: "partner-observation:candidate-a",
  });
  const second = simulateExpectedHeadCommit({
    current_head_id: first.head_id,
    expected_head_id: current,
    candidate_id: "partner-observation:candidate-b",
  });
  assert.deepEqual(second, {
    outcome: "stale_head",
    head_id: "partner-observation:candidate-a",
  });
});
