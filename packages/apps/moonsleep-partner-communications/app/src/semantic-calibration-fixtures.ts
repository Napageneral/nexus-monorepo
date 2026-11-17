import {
  canonicalJson,
  sha256,
  type CanonicalPartnerManifest,
  type SourceRevisionRefV1,
} from "./canonical-prep.js";

export type PartnerCalibrationProvider = "gmail" | "alibaba";
export type PartnerCalibrationTargetProfile =
  | "moonsleep.partner.workspace-state.v1"
  | "moonsleep.partner.open-loop-state.v1"
  | "moonsleep.partner.source-coverage-state.v1";

type StructuredClaim = {
  claim_type: "money" | "quantity" | "date" | "document" | "status_statement";
  claim_role: string;
  value_text: string;
  date_value?: string;
  quantity_text?: string;
  unit_code?: string;
  currency_code?: string;
  minor_units?: string;
};

export type PartnerCalibrationFixture = {
  fixture_id: string;
  scenario: string;
  providers: PartnerCalibrationProvider[];
  topic_label:
    | "production_schedule"
    | "purchase_order"
    | "shipment_freight"
    | "payment_balance"
    | "sample_prototype"
    | "product_specification"
    | "material_fabric"
    | "quality_defect"
    | "inventory_allocation"
    | "packaging_labeling"
    | "compliance_testing"
    | "pricing_quote"
    | "document_attachment"
    | "general_relationship";
  target_profile_id: PartnerCalibrationTargetProfile;
  signal_type:
    | "question"
    | "request"
    | "commitment"
    | "decision"
    | "blocker"
    | "progress"
    | "closure_candidate"
    | "informational";
  responsible_side: "moonsleep" | "partner" | "shared" | "unclear";
  candidate_action:
    | "create"
    | "attach"
    | "transition"
    | "propose_resolution"
    | "informational_only"
    | "needs_review";
  semantic_lifecycle:
    | "open"
    | "waiting_on_partner"
    | "waiting_on_moonsleep"
    | "blocked"
    | "resolved"
    | "superseded"
    | "dismissed";
  coverage_disposition:
    | "open_loop_evidence"
    | "informational"
    | "provider_system"
    | "attachment_only"
    | "needs_review";
  requires_human_review: boolean;
  claim?: StructuredClaim;
};

const FIXTURES: readonly PartnerCalibrationFixture[] = [
  {
    fixture_id: "PD-CAL-001-PRODUCTION-PROMISE",
    scenario: "Alibaba supplier promises a production completion date.",
    providers: ["alibaba"],
    topic_label: "production_schedule",
    target_profile_id: "moonsleep.partner.open-loop-state.v1",
    signal_type: "commitment",
    responsible_side: "partner",
    candidate_action: "transition",
    semantic_lifecycle: "waiting_on_partner",
    coverage_disposition: "open_loop_evidence",
    requires_human_review: false,
    claim: { claim_type: "date", claim_role: "promised_completion_date", value_text: "2026-08-14", date_value: "2026-08-14" },
  },
  {
    fixture_id: "PD-CAL-002-CROSS-CHANNEL-CONFLICT",
    scenario: "Alibaba and Gmail provide conflicting production dates.",
    providers: ["alibaba", "gmail"],
    topic_label: "production_schedule",
    target_profile_id: "moonsleep.partner.open-loop-state.v1",
    signal_type: "blocker",
    responsible_side: "shared",
    candidate_action: "needs_review",
    semantic_lifecycle: "blocked",
    coverage_disposition: "needs_review",
    requires_human_review: true,
    claim: { claim_type: "date", claim_role: "conflicting_completion_date", value_text: "2026-08-18", date_value: "2026-08-18" },
  },
  {
    fixture_id: "PD-CAL-003-PAYMENT-QUESTION",
    scenario: "Gmail asks MoonSleep to confirm a remaining supplier payment balance.",
    providers: ["gmail"],
    topic_label: "payment_balance",
    target_profile_id: "moonsleep.partner.open-loop-state.v1",
    signal_type: "question",
    responsible_side: "moonsleep",
    candidate_action: "create",
    semantic_lifecycle: "waiting_on_moonsleep",
    coverage_disposition: "open_loop_evidence",
    requires_human_review: false,
    claim: { claim_type: "money", claim_role: "claimed_balance_due", value_text: "USD 12,450.00", currency_code: "USD", minor_units: "1245000" },
  },
  {
    fixture_id: "PD-CAL-004-PACKAGING-APPROVAL",
    scenario: "Alibaba requests approval of revised carton artwork.",
    providers: ["alibaba"],
    topic_label: "packaging_labeling",
    target_profile_id: "moonsleep.partner.open-loop-state.v1",
    signal_type: "request",
    responsible_side: "moonsleep",
    candidate_action: "create",
    semantic_lifecycle: "waiting_on_moonsleep",
    coverage_disposition: "open_loop_evidence",
    requires_human_review: false,
    claim: { claim_type: "document", claim_role: "carton_artwork_revision", value_text: "Synthetic carton artwork revision B" },
  },
  {
    fixture_id: "PD-CAL-005-SAMPLE-APPROVAL",
    scenario: "Gmail asks for a prototype sample approval decision.",
    providers: ["gmail"],
    topic_label: "sample_prototype",
    target_profile_id: "moonsleep.partner.open-loop-state.v1",
    signal_type: "request",
    responsible_side: "moonsleep",
    candidate_action: "create",
    semantic_lifecycle: "waiting_on_moonsleep",
    coverage_disposition: "open_loop_evidence",
    requires_human_review: false,
    claim: { claim_type: "status_statement", claim_role: "sample_status", value_text: "Synthetic prototype ready for review" },
  },
  {
    fixture_id: "PD-CAL-006-FREIGHT-BOOKING",
    scenario: "Alibaba confirms it is arranging a freight booking.",
    providers: ["alibaba"],
    topic_label: "shipment_freight",
    target_profile_id: "moonsleep.partner.open-loop-state.v1",
    signal_type: "progress",
    responsible_side: "partner",
    candidate_action: "transition",
    semantic_lifecycle: "waiting_on_partner",
    coverage_disposition: "open_loop_evidence",
    requires_human_review: false,
    claim: { claim_type: "status_statement", claim_role: "booking_status", value_text: "Synthetic booking requested from forwarder" },
  },
  {
    fixture_id: "PD-CAL-007-INSPECTION-BLOCKER",
    scenario: "Alibaba reports an inspection failure blocking shipment.",
    providers: ["alibaba"],
    topic_label: "quality_defect",
    target_profile_id: "moonsleep.partner.open-loop-state.v1",
    signal_type: "blocker",
    responsible_side: "partner",
    candidate_action: "transition",
    semantic_lifecycle: "blocked",
    coverage_disposition: "open_loop_evidence",
    requires_human_review: false,
    claim: { claim_type: "status_statement", claim_role: "inspection_result", value_text: "Synthetic inspection failed pending rework" },
  },
  {
    fixture_id: "PD-CAL-008-MATERIAL-DECISION",
    scenario: "A reviewed Gmail decision closes a material specification question.",
    providers: ["gmail"],
    topic_label: "material_fabric",
    target_profile_id: "moonsleep.partner.open-loop-state.v1",
    signal_type: "closure_candidate",
    responsible_side: "shared",
    candidate_action: "propose_resolution",
    semantic_lifecycle: "resolved",
    coverage_disposition: "open_loop_evidence",
    requires_human_review: false,
    claim: { claim_type: "status_statement", claim_role: "material_decision", value_text: "Synthetic reviewed fabric specification accepted" },
  },
  {
    fixture_id: "PD-CAL-009-MOQ-QUOTE",
    scenario: "Gmail requests a minimum-order pricing quote.",
    providers: ["gmail"],
    topic_label: "pricing_quote",
    target_profile_id: "moonsleep.partner.open-loop-state.v1",
    signal_type: "question",
    responsible_side: "partner",
    candidate_action: "create",
    semantic_lifecycle: "waiting_on_partner",
    coverage_disposition: "open_loop_evidence",
    requires_human_review: false,
    claim: { claim_type: "quantity", claim_role: "requested_quote_quantity", value_text: "6000 units", quantity_text: "6000", unit_code: "unit" },
  },
  {
    fixture_id: "PD-CAL-010-INVENTORY-ALLOCATION",
    scenario: "Alibaba records a shared decision about color allocation.",
    providers: ["alibaba"],
    topic_label: "inventory_allocation",
    target_profile_id: "moonsleep.partner.open-loop-state.v1",
    signal_type: "decision",
    responsible_side: "shared",
    candidate_action: "attach",
    semantic_lifecycle: "open",
    coverage_disposition: "open_loop_evidence",
    requires_human_review: false,
    claim: { claim_type: "quantity", claim_role: "allocated_units", value_text: "3200 units", quantity_text: "3200", unit_code: "unit" },
  },
  {
    fixture_id: "PD-CAL-011-COMPLIANCE-DOCUMENTS",
    scenario: "Alibaba and Gmail both reference outstanding compliance documents.",
    providers: ["alibaba", "gmail"],
    topic_label: "compliance_testing",
    target_profile_id: "moonsleep.partner.open-loop-state.v1",
    signal_type: "request",
    responsible_side: "partner",
    candidate_action: "attach",
    semantic_lifecycle: "waiting_on_partner",
    coverage_disposition: "open_loop_evidence",
    requires_human_review: false,
    claim: { claim_type: "document", claim_role: "required_test_report", value_text: "Synthetic compliance report" },
  },
  {
    fixture_id: "PD-CAL-012-CORRECTIVE-ACTION",
    scenario: "Gmail requests evidence of supplier corrective action.",
    providers: ["gmail"],
    topic_label: "quality_defect",
    target_profile_id: "moonsleep.partner.open-loop-state.v1",
    signal_type: "request",
    responsible_side: "partner",
    candidate_action: "create",
    semantic_lifecycle: "waiting_on_partner",
    coverage_disposition: "open_loop_evidence",
    requires_human_review: false,
    claim: { claim_type: "document", claim_role: "corrective_action_report", value_text: "Synthetic corrective action report" },
  },
  {
    fixture_id: "PD-CAL-013-PO-QUANTITY-CHANGE",
    scenario: "Cross-channel evidence updates a purchase order quantity.",
    providers: ["gmail", "alibaba"],
    topic_label: "purchase_order",
    target_profile_id: "moonsleep.partner.open-loop-state.v1",
    signal_type: "decision",
    responsible_side: "moonsleep",
    candidate_action: "transition",
    semantic_lifecycle: "waiting_on_moonsleep",
    coverage_disposition: "open_loop_evidence",
    requires_human_review: true,
    claim: { claim_type: "quantity", claim_role: "revised_purchase_order_quantity", value_text: "6000 units", quantity_text: "6000", unit_code: "unit" },
  },
  {
    fixture_id: "PD-CAL-014-ATTACHMENT-COVERAGE",
    scenario: "An Alibaba attachment is classified as evidence without an open-loop decision.",
    providers: ["alibaba"],
    topic_label: "document_attachment",
    target_profile_id: "moonsleep.partner.source-coverage-state.v1",
    signal_type: "informational",
    responsible_side: "unclear",
    candidate_action: "informational_only",
    semantic_lifecycle: "dismissed",
    coverage_disposition: "attachment_only",
    requires_human_review: false,
    claim: { claim_type: "document", claim_role: "source_attachment", value_text: "Synthetic packing-list attachment" },
  },
  {
    fixture_id: "PD-CAL-015-WORKSPACE-ADMISSION",
    scenario: "Exact Gmail and Alibaba anchors establish one reviewed supplier workspace.",
    providers: ["gmail", "alibaba"],
    topic_label: "general_relationship",
    target_profile_id: "moonsleep.partner.workspace-state.v1",
    signal_type: "informational",
    responsible_side: "shared",
    candidate_action: "informational_only",
    semantic_lifecycle: "open",
    coverage_disposition: "informational",
    requires_human_review: false,
    claim: { claim_type: "status_statement", claim_role: "workspace_admission", value_text: "Synthetic reviewed supplier identity" },
  },
  {
    fixture_id: "PD-CAL-016-EXPLICIT-CLOSURE",
    scenario: "Alibaba explicitly confirms completion and closes the open loop.",
    providers: ["alibaba"],
    topic_label: "production_schedule",
    target_profile_id: "moonsleep.partner.open-loop-state.v1",
    signal_type: "closure_candidate",
    responsible_side: "partner",
    candidate_action: "propose_resolution",
    semantic_lifecycle: "resolved",
    coverage_disposition: "open_loop_evidence",
    requires_human_review: false,
    claim: { claim_type: "status_statement", claim_role: "completion_confirmation", value_text: "Synthetic production completion confirmed" },
  },
];

export function listPartnerCalibrationFixtures(): PartnerCalibrationFixture[] {
  return FIXTURES.map((fixture) => structuredClone(fixture));
}

export function partnerCalibrationSourceRevisions(
  fixture: PartnerCalibrationFixture,
): SourceRevisionRefV1[] {
  const fixtureIndex = FIXTURES.findIndex((candidate) => candidate.fixture_id === fixture.fixture_id);
  if (fixtureIndex < 0) throw new Error(`unknown Partner calibration fixture ${fixture.fixture_id}`);
  return fixture.providers.map((provider, providerIndex) => {
    const ordinal = fixtureIndex * 2 + providerIndex + 1;
    const providerRecordId = `${fixture.fixture_id.toLowerCase()}-${providerIndex + 1}`;
    const sourceLogicalRecordId = `${provider}:fixture:message:${providerRecordId}`;
    const payloadSha256 = sha256(canonicalJson({
      fixture_id: fixture.fixture_id,
      provider,
      scenario: fixture.scenario,
      ordinal,
    }));
    const sourceRevisionSha256 = sha256(canonicalJson({
      source_logical_record_id: sourceLogicalRecordId,
      payload_sha256: payloadSha256,
      revision_ordinal: 1,
    }));
    const hour = String(8 + Math.floor(ordinal / 4)).padStart(2, "0");
    const minute = String((ordinal * 7) % 60).padStart(2, "0");
    return {
      provider,
      adapter_package_id: provider === "gmail" ? "gog" : "moonsleep-alibaba-evidence",
      adapter_package_version: "calibration-fixture-v1",
      connection_id: `${provider}-moonsleep-calibration-fixture`,
      provider_account_id: `${provider}-account-calibration-fixture`,
      provider_record_id: providerRecordId,
      provider_revision_id: provider === "gmail" ? `gmail-history-calibration-${ordinal}` : null,
      source_logical_record_id: sourceLogicalRecordId,
      source_revision_sha256: sourceRevisionSha256,
      payload_sha256: payloadSha256,
      source_at: `2026-07-29T${hour}:${minute}:00.000Z`,
      captured_at: `2026-07-29T${hour}:${minute}:30.000Z`,
      fragment_refs: [`fragment:${provider}:${providerRecordId}:body`],
      attachment_refs:
        fixture.topic_label === "document_attachment" || fixture.claim?.claim_type === "document"
          ? [`attachment:${provider}:${providerRecordId}:synthetic`]
          : [],
      source_run_receipt_ref: `source-run:${provider}:calibration-fixture-v1`,
      provider_read_authority: true,
      provider_write_authority: false,
    };
  });
}

function fixtureIdentity(fixture: PartnerCalibrationFixture) {
  const slug = fixture.fixture_id.toLowerCase();
  return {
    entity_id: `entity:partner-fixture:${slug}`,
    contact_id: `contact:partner-fixture:${slug}`,
    open_loop_id: `open-loop:partner-fixture:${slug}`,
  };
}

export function partnerCalibrationFactPayloads(
  fixture: PartnerCalibrationFixture,
): Array<{ profile_id: string; payload: Record<string, unknown> }> {
  const revisions = partnerCalibrationSourceRevisions(fixture);
  const identity = fixtureIdentity(fixture);
  const coverageLoopIds =
    fixture.coverage_disposition === "open_loop_evidence" ? [identity.open_loop_id] : [];
  const payloads: Array<{ profile_id: string; payload: Record<string, unknown> }> = [
    {
      profile_id: "moonsleep.partner.communication-classification.v1",
      payload: {
        relationship_labels: ["supplier"],
        topic_labels: [fixture.topic_label],
        partner_relevance: fixture.requires_human_review ? "review_required" : "included",
        confidence_millionths: fixture.requires_human_review ? 760000 : 990000,
        rationale: fixture.scenario,
        language_code: "en",
        contains_actionable_signal: fixture.candidate_action !== "informational_only",
        ...(fixture.requires_human_review
          ? { classifier_review_reason: "Synthetic ambiguity intentionally requires review." }
          : {}),
      },
    },
    {
      profile_id: "moonsleep.partner.source-coverage.v1",
      payload: {
        source_logical_record_id: revisions[0]!.source_logical_record_id,
        source_revision_sha256: revisions[0]!.source_revision_sha256,
        coverage_disposition: fixture.coverage_disposition,
        candidate_open_loop_ids: coverageLoopIds,
        coverage_reason: fixture.scenario,
        coverage_policy_version: "partner-semantic-calibration-v1",
        requires_human_review: fixture.requires_human_review,
      },
    },
  ];
  if (fixture.target_profile_id === "moonsleep.partner.open-loop-state.v1") {
    payloads.push({
      profile_id: "moonsleep.partner.open-loop-signal.v1",
      payload: {
        signal_type: fixture.signal_type,
        responsible_side: fixture.responsible_side,
        statement_summary: fixture.scenario,
        explicitness: fixture.requires_human_review ? "ambiguous" : "explicit",
        candidate_open_loop_id: identity.open_loop_id,
        candidate_title: fixture.scenario,
        candidate_action: fixture.candidate_action,
        referenced_subjects: [identity.entity_id],
        evidence_fragment_refs: revisions.flatMap((revision) => revision.fragment_refs),
        requires_human_review: fixture.requires_human_review,
        ...(fixture.requires_human_review
          ? { review_reason: "Synthetic conflict or identity ambiguity." }
          : {}),
      },
    });
  }
  if (fixture.claim) {
    payloads.push({
      profile_id: "moonsleep.partner.structured-claim.v1",
      payload: {
        ...fixture.claim,
        source_quote_digest: sha256(canonicalJson({
          fixture_id: fixture.fixture_id,
          claim: fixture.claim,
        })),
        explicitness: fixture.requires_human_review ? "ambiguous" : "explicit",
      },
    });
  }
  if (fixture.target_profile_id === "moonsleep.partner.workspace-state.v1") {
    payloads.push({
      profile_id: "moonsleep.partner.workspace-admission.v1",
      payload: {
        canonical_partner_entity_id: identity.entity_id,
        contact_id: identity.contact_id,
        partner_category: "vendor",
        admission_status: "confirmed",
        decision_origin: "exact_provider_anchor",
        evidence_fragment_refs: revisions.flatMap((revision) => revision.fragment_refs),
        requires_human_review: false,
      },
    });
  }
  return payloads;
}

export function partnerCalibrationObservationPayload(
  manifest: CanonicalPartnerManifest,
  fixture: PartnerCalibrationFixture,
): Record<string, unknown> {
  const revisions = partnerCalibrationSourceRevisions(fixture);
  const identity = fixtureIdentity(fixture);
  const revisionRefs = revisions.map((revision) => revision.source_revision_sha256);
  const profile = manifest.observation_profiles.find(
    (candidate) => candidate.profile_id === fixture.target_profile_id,
  );
  if (!profile) throw new Error(`missing Partner target profile ${fixture.target_profile_id}`);
  if (fixture.target_profile_id === "moonsleep.partner.workspace-state.v1") {
    return {
      canonical_partner_entity_id: identity.entity_id,
      partner_categories: ["vendor"],
      person_organization_relationships: [],
      contact_ids: [identity.contact_id],
      connection_ids: revisions.map((revision) => revision.connection_id).sort(),
      native_conversation_refs: revisions.map((revision) => revision.source_logical_record_id).sort(),
      unresolved_identity_count: 0,
      unresolved_admission_count: 0,
      source_freshness_by_provider: Object.fromEntries(
        revisions.map((revision) => [revision.provider, revision.captured_at]),
      ),
      current_open_loop_ids: [],
      source_coverage_summary: { exact_revision_count: revisions.length },
    };
  }
  if (fixture.target_profile_id === "moonsleep.partner.source-coverage-state.v1") {
    return {
      source_logical_record_id: revisions[0]!.source_logical_record_id,
      current_source_revision_sha256: revisions[0]!.source_revision_sha256,
      coverage_disposition: fixture.coverage_disposition,
      reviewed_open_loop_ids: [],
      superseded_source_revision_refs: [],
      proposal_conflicts: [],
      missing_reason: null,
    };
  }
  return {
    open_loop_id: identity.open_loop_id,
    canonical_partner_entity_id: identity.entity_id,
    title: fixture.scenario,
    operational_summary: fixture.scenario,
    topic_labels: [fixture.topic_label],
    semantic_lifecycle: fixture.semantic_lifecycle,
    responsible_side: fixture.responsible_side,
    primary_evidence_revision: revisionRefs[0]!,
    supporting_evidence_revisions: revisionRefs,
    closure_evidence_revisions: fixture.semantic_lifecycle === "resolved" ? revisionRefs : [],
    external_subject_refs: fixture.claim ? [`claim:${fixture.fixture_id.toLowerCase()}`] : [],
    ...(fixture.claim?.date_value ? { deadline_date: fixture.claim.date_value } : {}),
    ...(fixture.requires_human_review
      ? { conflicting_fact_dispositions: [{ disposition: "review_required" }] }
      : { conflicting_fact_dispositions: [] }),
    review_receipt_refs: [],
    promotion_receipt_refs: [],
  };
}

export function partnerCalibrationSetProfileId(
  targetProfileId: PartnerCalibrationTargetProfile,
): string {
  if (targetProfileId === "moonsleep.partner.workspace-state.v1") {
    return "moonsleep.partner.extraction-source-set.v1";
  }
  if (targetProfileId === "moonsleep.partner.source-coverage-state.v1") {
    return "moonsleep.partner.comparison-set.v1";
  }
  return "moonsleep.partner.resolver-fact-set.v1";
}
