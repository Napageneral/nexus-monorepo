import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNoProhibitedSchemaField,
  canonicalHeadKey,
  canonicalJson,
  createFactCandidate,
  loadCanonicalPartnerManifest,
  sealMemberSet,
  sha256,
  validateCanonicalPartnerManifest,
  validateProfilePayload,
  validateSourceRevisionRef,
  type SourceRevisionRefV1,
} from "./canonical-prep.ts";

const manifest = loadCanonicalPartnerManifest();
const digest = "a".repeat(64);

function sourceRef(): SourceRevisionRefV1 {
  return {
    provider: "alibaba",
    adapter_package_id: "moonsleep-alibaba-evidence",
    adapter_package_version: "fixture-v1",
    connection_id: "alibaba-moonsleep-fixture",
    provider_account_id: "alibaba-buyer-fixture",
    provider_record_id: "provider-message-1",
    provider_revision_id: null,
    source_logical_record_id: "alibaba:fixture:message:1",
    source_revision_sha256: "1".repeat(64),
    payload_sha256: "2".repeat(64),
    source_at: "2026-07-20T09:00:00.000Z",
    captured_at: "2026-07-20T09:01:00.000Z",
    fragment_refs: ["fragment:alibaba:message-1:body"],
    attachment_refs: [],
    source_run_receipt_ref: "source-run:alibaba:fixture-001",
    provider_read_authority: true,
    provider_write_authority: false,
  };
}

test("canonical manifest binds exactly five fact and three observation profiles", () => {
  validateCanonicalPartnerManifest(manifest);
  assert.equal(manifest.fact_profiles.length, 5);
  assert.equal(manifest.observation_profiles.length, 3);
  assert.deepEqual(
    manifest.core_contract_requirements.map((entry) => entry.requirement_id),
    ["CORE-01", "CORE-02", "CORE-03", "CORE-04", "CORE-05", "CORE-06"],
  );
  assert.equal(manifest.activation_state, "dormant_source_registration");
  assert.ok(
    [...manifest.fact_profiles, ...manifest.observation_profiles].every(
      (profile) => profile.profile_version === "1.0.0",
    ),
  );
  assert.ok(
    manifest.sealed_set_profiles.every(
      (profile) =>
        profile.core_definition_id === "evidence_set_v1" &&
        profile.member_type === "fact_element",
    ),
  );
  assert.equal(manifest.authority_ceiling.provider_write, false);
  assert.equal(manifest.authority_ceiling.identity_merge, false);
  assert.equal(manifest.authority_ceiling.external_domain_write, false);
  assert.equal(manifest.authority_ceiling.draft_or_send, false);
});

test("manifest and typed payloads contain no prohibited generic schema field", () => {
  assertNoProhibitedSchemaField(manifest);
  assert.equal(JSON.stringify(manifest).includes('"kind"'), false);
  assert.throws(
    () => assertNoProhibitedSchemaField({ nested: { kind: "forbidden" } }),
    /is prohibited/,
  );
});

test("canonical serialization is stable and rejects unsafe integers", () => {
  const left = canonicalJson({ beta: 2, alpha: { zed: 3, one: 1 } });
  const right = canonicalJson({ alpha: { one: 1, zed: 3 }, beta: 2 });
  assert.equal(left, right);
  assert.equal(sha256(left), sha256(right));
  assert.throws(
    () => canonicalJson({ unsafe: Number.MAX_SAFE_INTEGER + 1 }),
    /unsafe integer/,
  );
  assert.doesNotThrow(() => canonicalJson({ exact_large_integer: "9007199254740992" }));
});

test("source revision refs require exact read-only authority and immutable digests", () => {
  assert.doesNotThrow(() => validateSourceRevisionRef(sourceRef()));
  assert.throws(
    () => validateSourceRevisionRef({
      ...sourceRef(),
      provider_write_authority: true,
    } as unknown as SourceRevisionRefV1),
    /authority is invalid/,
  );
  assert.throws(
    () => validateSourceRevisionRef({
      ...sourceRef(),
      source_revision_sha256: "not-a-digest",
    }),
    /digests are invalid/,
  );
  assert.throws(
    () => validateSourceRevisionRef({
      ...sourceRef(),
      fragment_refs: ["fragment:a", "fragment:a"],
    }),
    /contains duplicates/,
  );
});

test("profile validation preserves review, coverage, closure, and supersession rules", () => {
  validateProfilePayload(
    manifest,
    "moonsleep.partner.source-coverage.v1",
    {
      source_logical_record_id: "alibaba:fixture:message:1",
      source_revision_sha256: "1".repeat(64),
      coverage_disposition: "open_loop_evidence",
      candidate_open_loop_ids: ["loop-1"],
      coverage_reason: "Exact fixture evidence.",
      coverage_policy_version: "fixture-v1",
      requires_human_review: false,
    },
  );
  assert.throws(
    () => validateProfilePayload(
      manifest,
      "moonsleep.partner.source-coverage.v1",
      {
        source_logical_record_id: "alibaba:fixture:message:1",
        source_revision_sha256: "1".repeat(64),
        coverage_disposition: "open_loop_evidence",
        candidate_open_loop_ids: [],
        coverage_reason: "No loop reference.",
        coverage_policy_version: "fixture-v1",
        requires_human_review: false,
      },
    ),
    /requires at least one open-loop reference/,
  );
  assert.throws(
    () => validateProfilePayload(
      manifest,
      "moonsleep.partner.workspace-admission.v1",
      {
        canonical_partner_entity_id: "entity-surewal",
        contact_id: "contact-rebecca",
        partner_category: "vendor",
        admission_status: "probable",
        decision_origin: "model_proposal",
        evidence_fragment_refs: ["fragment:1"],
        requires_human_review: false,
      },
    ),
    /must require human review/,
  );
  assert.throws(
    () => validateProfilePayload(
      manifest,
      "moonsleep.partner.open-loop-state.v1",
      {
        open_loop_id: "loop-1",
        canonical_partner_entity_id: "entity-surewal",
        title: "Production timing",
        operational_summary: "Timing remains open.",
        topic_labels: ["production_schedule"],
        semantic_lifecycle: "resolved",
        responsible_side: "unclear",
        primary_evidence_revision: "1".repeat(64),
        supporting_evidence_revisions: ["1".repeat(64)],
        closure_evidence_revisions: [],
        external_subject_refs: [],
        conflicting_fact_dispositions: [],
        review_receipt_refs: [],
        promotion_receipt_refs: [],
      },
    ),
    /requires closure evidence/,
  );
  assert.throws(
    () => validateProfilePayload(
      manifest,
      "moonsleep.partner.open-loop-state.v1",
      {
        open_loop_id: "loop-1",
        canonical_partner_entity_id: "entity-surewal",
        title: "Production timing",
        operational_summary: "Superseded without a successor.",
        topic_labels: ["production_schedule"],
        semantic_lifecycle: "superseded",
        responsible_side: "unclear",
        primary_evidence_revision: "1".repeat(64),
        supporting_evidence_revisions: ["1".repeat(64)],
        closure_evidence_revisions: [],
        external_subject_refs: [],
        conflicting_fact_dispositions: [],
        review_receipt_refs: [],
        promotion_receipt_refs: [],
      },
    ),
    /requires a successor/,
  );
});

test("sealed sets and head keys are deterministic across input order", () => {
  const first = sealMemberSet(
    manifest,
    "moonsleep.partner.resolver-fact-set.v1",
    ["fact-c", "fact-a", "fact-b"],
  );
  const replay = sealMemberSet(
    manifest,
    "moonsleep.partner.resolver-fact-set.v1",
    ["fact-b", "fact-c", "fact-a"],
  );
  assert.deepEqual(first, replay);
  assert.deepEqual(first.member_ids, ["fact-a", "fact-b", "fact-c"]);
  assert.throws(
    () => sealMemberSet(
      manifest,
      "moonsleep.partner.resolver-fact-set.v1",
      ["fact-a", "fact-a"],
    ),
    /contains duplicates/,
  );

  const left = canonicalHeadKey(
    manifest,
    "moonsleep.partner.open-loop-state.v1",
    {
      workspace_id: "moonsleep-ops",
      observation_profile_id: "moonsleep.partner.open-loop-state.v1",
      canonical_partner_entity_id: "entity-surewal",
      open_loop_id: "loop-production",
    },
  );
  const right = canonicalHeadKey(
    manifest,
    "moonsleep.partner.open-loop-state.v1",
    {
      open_loop_id: "loop-production",
      canonical_partner_entity_id: "entity-surewal",
      observation_profile_id: "moonsleep.partner.open-loop-state.v1",
      workspace_id: "moonsleep-ops",
    },
  );
  assert.equal(left, right);
  assert.throws(
    () => canonicalHeadKey(
      manifest,
      "moonsleep.partner.open-loop-state.v1",
      {
        workspace_id: "moonsleep-ops",
        observation_profile_id: "moonsleep.partner.open-loop-state.v1",
        canonical_partner_entity_id: "entity-surewal",
      },
    ),
    /head key fields are invalid/,
  );
});

test("fact candidate identity is replay-stable and exact-source-bound", () => {
  const input = {
    manifest,
    fact_profile_id: "moonsleep.partner.structured-claim.v1",
    subject_reference: "source-message:fixture-1",
    typed_payload: {
      claim_type: "money",
      claim_role: "amount_due",
      value_text: "160000.00 USD",
      currency_code: "USD",
      minor_units: "16000000",
      source_quote_digest: digest,
      explicitness: "explicit",
    },
    source_revision_refs: [sourceRef()],
    producer_version: "fixture-v1",
    source_manifest_sha256: digest,
    review_state: "reviewed" as const,
  };
  const first = createFactCandidate(input);
  const replay = createFactCandidate(structuredClone(input));
  assert.deepEqual(first, replay);
  assert.match(first.fact_id, /^partner-fact:[0-9a-f]{64}$/);

  const changed = createFactCandidate({
    ...input,
    typed_payload: {
      ...input.typed_payload,
      minor_units: "16000001",
    },
  });
  assert.notEqual(first.fact_id, changed.fact_id);
  assert.notEqual(first.payload_sha256, changed.payload_sha256);
});
