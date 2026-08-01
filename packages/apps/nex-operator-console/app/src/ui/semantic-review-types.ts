export type SemanticReviewDecisionType = "approve" | "edit" | "reject" | "defer";

export type SemanticReviewBatch = {
  id: string;
  domain: string;
  batch_label: string;
  review_policy_ref: string;
  source_manifest_sha256: string;
  item_count: number;
  decision_count: number;
  completed: boolean;
  created_at: number;
};

export type SemanticReviewCandidateUsage = {
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
};

export type SemanticReviewCandidate = {
  id: string;
  blind_slot: string;
  observation_candidate_id: string | null;
  candidate_role: string;
  response_status: string;
  output: Record<string, unknown>;
  output_sha256: string;
  completed_at: number;
  model_id?: string;
  requested_model_id?: string;
  reasoning_effort?: string;
  prompt_id?: string;
  prompt_version?: string;
  prompt_sha256?: string;
  system_sha256?: string;
  output_schema_sha256?: string;
  provider_response_id?: string;
  usage?: SemanticReviewCandidateUsage;
  elapsed_ms?: number;
};

export type SemanticReviewDifference = {
  path: string;
  left?: unknown;
  right?: unknown;
};

export type SemanticReviewComparison = {
  left_blind_slot: string;
  right_blind_slot: string;
  differences: SemanticReviewDifference[];
};

export type SemanticReviewDecision = {
  id: string;
  review_item_id: string;
  candidate_group_key: string;
  candidate_ids: string[];
  candidate_set_sha256: string;
  selected_candidate_id: string | null;
  decision: SemanticReviewDecisionType;
  corrected_output: Record<string, unknown> | null;
  corrected_output_sha256: string | null;
  reviewer_ref: string;
  review_policy_ref: string;
  review_notes: string | null;
  golden_eligible: boolean;
  created_at: number;
};

export type SemanticReviewItem = {
  id: string;
  batch_id: string;
  ordinal: number;
  candidate_group_key: string;
  subject_type: string;
  subject_ref: string;
  input_set_id: string;
  input_set_digest: string;
  target_profile_id: string;
  target_profile_version: string;
  target_profile_schema_sha256: string;
  expected_head_id: string | null;
  required_candidate_count: number;
  candidate_count: number;
  ready_for_review: boolean;
  current_head: Record<string, unknown> | null;
  candidates: SemanticReviewCandidate[];
  comparisons: SemanticReviewComparison[];
  decision: SemanticReviewDecision | null;
};

export type SemanticEvidenceSet = {
  id: string;
  definitionId: string;
  createdAt: number;
  metadata: Record<string, unknown> | null;
  sealedAt?: number;
  memberCount?: number;
  memberDigest?: string;
  sealReceiptSha256?: string;
};

export type SemanticEvidenceMember = {
  setId: string;
  memberType: string;
  memberId: string;
  position: number | null;
  addedAt: number;
};

export type SemanticReviewState = {
  semanticReviewLoading: boolean;
  semanticReviewError: string | null;
  semanticReviewBatches: SemanticReviewBatch[];
  semanticReviewSelectedBatchId: string | null;
  semanticReviewBatchLoading: boolean;
  semanticReviewSelectedBatch: SemanticReviewBatch | null;
  semanticReviewItems: SemanticReviewItem[];
  semanticReviewSelectedItemId: string | null;
  semanticReviewItemLoading: boolean;
  semanticReviewSelectedItem: SemanticReviewItem | null;
  semanticReviewEvidenceLoading: boolean;
  semanticReviewEvidenceError: string | null;
  semanticReviewEvidenceSet: SemanticEvidenceSet | null;
  semanticReviewEvidenceMembers: SemanticEvidenceMember[];
  semanticReviewDecisionBusy: boolean;
  semanticReviewDecisionError: string | null;
  semanticReviewDecisionMessage: string | null;
  semanticReviewSelectedCandidateId: string | null;
  semanticReviewDecisionNotes: string;
  semanticReviewCorrectedOutputText: string;
  semanticReviewReviewerRef: string;
};
