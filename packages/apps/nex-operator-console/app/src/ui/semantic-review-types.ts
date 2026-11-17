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

export type SemanticSourceRevisionRef = {
  revision_id: string;
  payload_sha256: string;
  fragment_refs: string[];
};

export type SemanticEvidenceElement = {
  id: string;
  type: string;
  content: string;
  as_of: number | null;
  created_at: number;
  profile_id: string | null;
  profile_version: string | null;
  payload_sha256: string | null;
  subject_type: string | null;
  subject_ref: string | null;
  producer_id: string | null;
  producer_version: string | null;
  typed_payload: Record<string, unknown> | null;
  source_revision_refs: SemanticSourceRevisionRef[];
};

export type SemanticSourceAttachment = {
  id: string;
  record_id: string;
  filename: string;
  mime_type: string | null;
  media_type: string | null;
  size: number | null;
  artifact_available: boolean;
  custody_state: string | null;
  custody_error: string | null;
  custody_context: string | null;
};

export type SemanticSourceEvidence = {
  revision_id: string;
  revision_ordinal: number;
  payload_sha256: string;
  record_id: string;
  platform: string;
  source_record_type: string;
  source_timestamp: number | null;
  observed_at: number | null;
  provider_account_ref: string | null;
  provider_thread_id: string | null;
  provider_message_id: string | null;
  subject: string | null;
  sender: string | null;
  recipients: string[];
  body_text: string | null;
  direction: string | null;
  attachments: SemanticSourceAttachment[];
  fragment_refs: string[];
  load_error: string | null;
};

export type SemanticObservationHistoryEntry = {
  id: string;
  parent_id: string | null;
  created_at: number;
  as_of: number | null;
  content: string;
  profile_id: string | null;
  profile_version: string | null;
  typed_payload: Record<string, unknown> | null;
};

export type SemanticEvidenceBundle = {
  elements: SemanticEvidenceElement[];
  sources: SemanticSourceEvidence[];
  observation_history: SemanticObservationHistoryEntry[];
};

export type SemanticAttachmentPreview = {
  record_id: string;
  attachment_id: string;
  filename: string;
  mime_type: string;
  object_url: string;
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
  semanticReviewEvidenceBundle: SemanticEvidenceBundle | null;
  semanticReviewAttachmentLoading: boolean;
  semanticReviewAttachmentError: string | null;
  semanticReviewAttachmentPreview: SemanticAttachmentPreview | null;
  semanticReviewDecisionBusy: boolean;
  semanticReviewDecisionError: string | null;
  semanticReviewDecisionMessage: string | null;
  semanticReviewSelectedCandidateId: string | null;
  semanticReviewDecisionNotes: string;
  semanticReviewCorrectedOutputText: string;
  semanticReviewReviewerRef: string;
};
