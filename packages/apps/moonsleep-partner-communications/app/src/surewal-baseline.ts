import type {
  IdentityResolution,
  OpenLoopAssertion,
  SourceCoverageAssertion,
  WorkspaceAssertion,
} from "./projection.ts";

export const SUREWAL_BASELINE_ID = "surewal-20260717-reviewed-baseline-v1";
export const SUREWAL_WORKSPACE_KEY = "surewal-alibaba";
export const SUREWAL_CANONICAL_ENTITY_ID = "entity_observed_71ae88c2e43ee8617b9ac9911252ea0472b2107c";
export const SUREWAL_CONTACT_ID = "contact_observed_71ae88c2e43ee8617b9ac9911252ea0472b2107c";
export const SUREWAL_PROVIDER_THREAD_ID = "2215891521413-2216843498932#11011@icbu";

export const SUREWAL_MESSAGE_RECORDS = {
  lenzing_modal_timing: "alibaba:moonsleep-alibaba:message:4201222442605:75887bf0fe543c60a0408455262c6cd85fe67c5c71c1c226b24349d226bd6857",
  ecovero_timing: "alibaba:moonsleep-alibaba:message:4201234298676:440b3fddafdd2dfccc976c82a3db5c1a318579eb97d642cbbe899690170cb9e7",
  batch4_redirect_feasible: "alibaba:moonsleep-alibaba:message:4201566382281:16b807148018dcfd4a47ac734ea8888ada6b0c0c3239351b6acf769b34c488cf",
  defective_inner_covers_question: "alibaba:moonsleep-alibaba:message:4204936723911:65bda731cb75676518e67e8db056ddf51d39ca6cc07dbe2e6ec1e2b9d22bad18",
  price_matched_plan_pending: "alibaba:moonsleep-alibaba:message:4205668829306:5a767d552b0292d0e9db09d5c3cfd015cbf7029d40e2131c50e079231b45101f",
  sample_payment_link: "alibaba:moonsleep-alibaba:message:4205752080648:b591c706152b1a682099ddb6b48d79fd2797a4e178e257618c6e84535366f4e7",
  placement_printing_explanation: "alibaba:moonsleep-alibaba:message:4205780435443:f9b0fe8ddda3accc991ba059ca21a9ac6d008b52bdd339048780c55445d3449f",
  batch6_final_confirmation: "alibaba:moonsleep-alibaba:message:4205926672177:9269b35c3eda1fea362315144ebd30a9aa35adc8bb3a34fa9cf15148ab0923dd",
  batch6_more_possible: "alibaba:moonsleep-alibaba:message:4205928686006:42c5bfbd711f5eec600dbca294e66a7c5746ceb0f0bdd73b265afbd17fdcc6a1",
  batch6_shipping_sequence_request: "alibaba:moonsleep-alibaba:message:4206780657257:142cef7d6dfb1893430e121dfe05b8bf1ed86714e46166541c9abe20a64f45db",
  chinese_viscose_positioning: "alibaba:moonsleep-alibaba:message:4208702910850:24b970ec36d48ba358d40f49b286bae04f8f762cee948d6d12916eeb10e0d639",
  graphic_file_example_question: "alibaba:moonsleep-alibaba:message:4208730829310:c858ba73f13179b3c6e0d97ef746b349a8006949596d3de6a7eeafa498294750",
  batch4_tracking_replaced: "alibaba:moonsleep-alibaba:message:4210771095864:8d0dd5627e8372e3353e535e6ca217eca37724bcb20198f7126d4b802b7b2822",
  batch6_final_quantities: "alibaba:moonsleep-alibaba:message:4211935308246:11b742c184790eb9a6b8b2dbde8ae8b1f34edd3462f1f3be61c25b249f441130",
  batch6_supplier_confirmation: "alibaba:moonsleep-alibaba:message:4211933251035:937c863ce305953a7814351d4e4051a423dd6d1f1983b4ad4c4ca754b7589f7b",
  batch6_locked: "alibaba:moonsleep-alibaba:message:4211941238442:a728ba1883aa1fd2d4a9ca6c128ae128f5f649242a2d29e2ec6e88b06e0d8c1f",
  star_and_mini_followup: "alibaba:moonsleep-alibaba:message:4213225073224:83bd8d428f9db603033ce779e3e7787b7296a8b891a4e3c2ff8f82b215ddd254",
  star_and_mini_review_pending: "alibaba:moonsleep-alibaba:message:4204160255286:735181618f510c54c556ec7c70336bfe1c6247bb51b078f58d95cfafca32af20",
  croissant_design_requested: "alibaba:moonsleep-alibaba:message:4214599481078:76e1c0723416ffbcfd42a011b939c72f7058753a1d1db95b01ee946997757695",
  larger_design_file_requested: "alibaba:moonsleep-alibaba:message:4214743056760:c185ad4c6bcccd3175e2aebd8b89cf3767a41e4edc21e2b6a184009e17fc87c0",
  printing_method_review: "alibaba:moonsleep-alibaba:message:4216591942543:a5a2002af8a93ca6782f5926c8a093754e0a62139bf6ac4274a8f87be7330abd",
  croissant_design_requirements: "alibaba:moonsleep-alibaba:message:4216643599112:b41f42d4b0ae6acb4700d29109fb9e15ca9f573949055c259802b2d3e2a4584e",
} as const;

type RecordKey = keyof typeof SUREWAL_MESSAGE_RECORDS;
type LoopSpec = Omit<OpenLoopAssertion, "canonical_entity_id" | "primary_source_record_id" | "evidence_source_record_ids" | "closure_source_record_ids"> & {
  primary: RecordKey;
  evidence: RecordKey[];
  closure?: RecordKey[];
};

const loopSpecs: LoopSpec[] = [
  {
    open_loop_id: "surewal-batch6-shipping-sequence",
    primary: "batch6_shipping_sequence_request",
    evidence: ["batch6_shipping_sequence_request"],
    title: "Confirm Batch 6 color shipping sequence",
    summary: "MoonSleep needs to send Surewal the urgency order for the SWRC26006 color shipments.",
    labels: ["batch6", "shipping", "production"],
    lifecycle: "waiting_on_moonsleep",
    review_state: "confirmed",
    assertion_origin: "operator_review",
    owner: "moonsleep-ops",
  },
  {
    open_loop_id: "surewal-star-plush-feedback",
    primary: "star_and_mini_followup",
    evidence: ["star_and_mini_followup", "star_and_mini_review_pending"],
    title: "Receive star plush feedback",
    summary: "Surewal is reviewing the requested star plush feedback and has not yet delivered it.",
    labels: ["product", "sample", "star-plush"],
    lifecycle: "waiting_on_partner",
    review_state: "confirmed",
    assertion_origin: "operator_review",
  },
  {
    open_loop_id: "surewal-mini-moon-pricing",
    primary: "star_and_mini_followup",
    evidence: ["star_and_mini_followup", "star_and_mini_review_pending"],
    title: "Receive Mini Moon price and quantity breakpoints",
    summary: "Surewal is reviewing Mini Moon pricing and quantity breakpoints and has not yet delivered them.",
    labels: ["commercial", "mini-moon", "pricing"],
    lifecycle: "waiting_on_partner",
    review_state: "confirmed",
    assertion_origin: "operator_review",
  },
  {
    open_loop_id: "surewal-croissant-design-file",
    primary: "croissant_design_requirements",
    evidence: [
      "croissant_design_requested",
      "larger_design_file_requested",
      "graphic_file_example_question",
      "placement_printing_explanation",
      "croissant_design_requirements",
    ],
    title: "Provide croissant placement-print design file",
    summary: "MoonSleep needs to provide a large design file showing the moon shape, pattern placement, Pantone colors, and dimensions.",
    labels: ["croissant", "design", "sample"],
    lifecycle: "waiting_on_moonsleep",
    review_state: "confirmed",
    assertion_origin: "operator_review",
    owner: "moonsleep-ops",
  },
  {
    open_loop_id: "surewal-croissant-printing-method",
    primary: "printing_method_review",
    evidence: ["placement_printing_explanation", "printing_method_review"],
    title: "Confirm croissant printing method",
    summary: "Surewal needs production review to select the appropriate printing technology for the fabric.",
    labels: ["croissant", "production", "sample"],
    lifecycle: "waiting_on_partner",
    review_state: "confirmed",
    assertion_origin: "operator_review",
  },
  {
    open_loop_id: "surewal-lenzing-modal-sample",
    primary: "lenzing_modal_timing",
    evidence: ["lenzing_modal_timing"],
    title: "Confirm Lenzing Modal sample completion",
    summary: "Surewal gave an expected completion date for the custom Lenzing Modal fabric; the finished sample outcome is still pending.",
    labels: ["fabric", "lenzing-modal", "sample"],
    lifecycle: "waiting_on_partner",
    review_state: "confirmed",
    assertion_origin: "operator_review",
  },
  {
    open_loop_id: "surewal-ecovero-sample",
    primary: "ecovero_timing",
    evidence: ["ecovero_timing"],
    title: "Confirm ECOVERO sample timing",
    summary: "Surewal has not yet provided the ECOVERO fabric and sample schedule.",
    labels: ["ecovero", "fabric", "sample"],
    lifecycle: "waiting_on_partner",
    review_state: "confirmed",
    assertion_origin: "operator_review",
  },
  {
    open_loop_id: "surewal-viscose-positioning",
    primary: "chinese_viscose_positioning",
    evidence: ["chinese_viscose_positioning"],
    title: "Decide Chinese viscose positioning",
    summary: "MoonSleep needs to decide whether and how to position a small Chinese viscose batch before a Lenzing upgrade.",
    labels: ["fabric", "positioning", "viscose"],
    lifecycle: "waiting_on_moonsleep",
    review_state: "confirmed",
    assertion_origin: "operator_review",
    owner: "moonsleep-ops",
  },
  {
    open_loop_id: "surewal-sample-payment",
    primary: "sample_payment_link",
    evidence: ["sample_payment_link"],
    title: "Review Alibaba sample payment",
    summary: "A sample payment link is waiting for MoonSleep review; Partner Desk has no payment execution authority.",
    labels: ["commercial", "payment-review", "sample"],
    lifecycle: "waiting_on_moonsleep",
    review_state: "confirmed",
    assertion_origin: "operator_review",
    owner: "moonsleep-ops",
  },
  {
    open_loop_id: "surewal-defective-inner-covers",
    primary: "defective_inner_covers_question",
    evidence: ["defective_inner_covers_question"],
    title: "Explain ten defective inner covers",
    summary: "Surewal asked what defect affected the ten inner covers previously reported by the factory.",
    labels: ["defect", "inner-cover", "quality"],
    lifecycle: "waiting_on_moonsleep",
    review_state: "confirmed",
    assertion_origin: "operator_review",
    owner: "moonsleep-ops",
  },
  {
    open_loop_id: "surewal-price-matched-production-plan",
    primary: "price_matched_plan_pending",
    evidence: ["price_matched_plan_pending"],
    title: "Receive price-matched production plan",
    summary: "Surewal is calculating a production plan intended to meet MoonSleep's price requirements.",
    labels: ["commercial", "pricing", "production"],
    lifecycle: "waiting_on_partner",
    review_state: "confirmed",
    assertion_origin: "operator_review",
  },
  {
    open_loop_id: "surewal-batch4-redirect",
    primary: "batch4_redirect_feasible",
    evidence: ["batch4_redirect_feasible", "batch4_tracking_replaced"],
    closure: ["batch4_tracking_replaced"],
    title: "Redirect Batch 4 shipment",
    summary: "Surewal confirmed the redirect was feasible and later confirmed that the tracking number was replaced.",
    labels: ["batch4", "shipping"],
    lifecycle: "resolved",
    review_state: "confirmed",
    assertion_origin: "operator_review",
  },
  {
    open_loop_id: "surewal-batch6-quantity-lock",
    primary: "batch6_final_quantities",
    evidence: [
      "batch6_final_quantities",
      "batch6_supplier_confirmation",
      "batch6_final_confirmation",
      "batch6_more_possible",
      "batch6_locked",
    ],
    closure: ["batch6_locked"],
    title: "Lock Batch 6 color quantities",
    summary: "MoonSleep supplied final color quantities, confirmed the lock, and Surewal acknowledged it.",
    labels: ["batch6", "production", "quantity"],
    lifecycle: "resolved",
    review_state: "confirmed",
    assertion_origin: "operator_review",
  },
];

const recordIds = Object.values(SUREWAL_MESSAGE_RECORDS).sort();
const loopIdsByRecord = new Map<string, string[]>();
for (const spec of loopSpecs) {
  for (const key of spec.evidence) {
    const recordId = SUREWAL_MESSAGE_RECORDS[key];
    const current = loopIdsByRecord.get(recordId) ?? [];
    current.push(spec.open_loop_id);
    loopIdsByRecord.set(recordId, current);
  }
}

export const surewalReviewedBaseline = {
  workspace_key: SUREWAL_WORKSPACE_KEY,
  canonical_entity_id: SUREWAL_CANONICAL_ENTITY_ID,
  record_ids: recordIds,
  identity_resolutions: recordIds.map((source_record_id): IdentityResolution => ({
    source_record_id,
    status: "confirmed",
    decision_origin: "exact_provider_anchor",
    canonical_entity_id: SUREWAL_CANONICAL_ENTITY_ID,
    contact_id: SUREWAL_CONTACT_ID,
  })),
  workspace_assertions: recordIds.map((source_record_id): WorkspaceAssertion => ({
    source_record_id,
    category: "vendor",
    status: "confirmed",
    assertion_origin: "operator_review",
  })),
  open_loop_assertions: loopSpecs.map((spec): OpenLoopAssertion => ({
    open_loop_id: spec.open_loop_id,
    canonical_entity_id: SUREWAL_CANONICAL_ENTITY_ID,
    primary_source_record_id: SUREWAL_MESSAGE_RECORDS[spec.primary],
    evidence_source_record_ids: spec.evidence.map((key) => SUREWAL_MESSAGE_RECORDS[key]),
    closure_source_record_ids: (spec.closure ?? []).map((key) => SUREWAL_MESSAGE_RECORDS[key]),
    title: spec.title,
    summary: spec.summary,
    labels: spec.labels,
    lifecycle: spec.lifecycle,
    review_state: spec.review_state,
    assertion_origin: spec.assertion_origin,
    ...(spec.owner ? { owner: spec.owner } : {}),
  })),
  source_coverage_assertions: recordIds.map((source_record_id): SourceCoverageAssertion => ({
    source_record_id,
    disposition: "open_loop_evidence",
    open_loop_ids: [...(loopIdsByRecord.get(source_record_id) ?? [])].sort(),
    assertion_origin: "operator_review",
  })),
  review_note: "Operator-reviewed Surewal baseline from the exact 2026-07-17 Alibaba capture; no reply, payment, purchase-order, shipment, or inventory authority.",
  review_idempotency_key: SUREWAL_BASELINE_ID,
  previous_revision_sha256: null,
} as const;
