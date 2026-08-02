import type { RuntimeBrowserClient } from "../runtime.ts";
import type {
  SemanticAttachmentPreview,
  SemanticEvidenceBundle,
  SemanticEvidenceElement,
  SemanticEvidenceMember,
  SemanticEvidenceSet,
  SemanticObservationHistoryEntry,
  SemanticReviewBatch,
  SemanticReviewDecisionType,
  SemanticReviewItem,
  SemanticReviewState,
  SemanticSourceAttachment,
  SemanticSourceEvidence,
  SemanticSourceRevisionRef,
} from "../semantic-review-types.ts";

export type SemanticReviewControllerState = SemanticReviewState & {
  client: RuntimeBrowserClient | null;
  connected: boolean;
  memorySubTab: "library" | "search" | "quality" | "review";
};

type BatchListResponse = { items?: SemanticReviewBatch[] };
type BatchGetResponse = {
  item?: { batch?: SemanticReviewBatch; items?: SemanticReviewItem[] };
};
type ItemGetResponse = { item?: SemanticReviewItem };
type SetGetResponse = { set?: SemanticEvidenceSet };
type MembersListResponse = { members?: SemanticEvidenceMember[] };
type ElementGetResponse = { element?: Record<string, unknown> };
type RevisionGetResponse = { revision?: Record<string, unknown> };
type RecordGetResponse = { record?: Record<string, unknown> };
type AttachmentGetResponse = {
  attachment?: Record<string, unknown>;
  body_base64?: string;
  encoding?: string;
};

type ReviewUrlState = {
  batchId: string | null;
  itemId: string | null;
  reviewActive: boolean;
};

function readReviewUrlState(): ReviewUrlState {
  if (typeof window === "undefined") {
    return { batchId: null, itemId: null, reviewActive: false };
  }
  const url = new URL(window.location.href);
  return {
    batchId: url.searchParams.get("memory_batch"),
    itemId: url.searchParams.get("memory_item"),
    reviewActive: url.searchParams.get("memory_tab") === "review",
  };
}

function writeReviewUrlState(patch: Partial<ReviewUrlState>): void {
  if (typeof window === "undefined") {
    return;
  }
  const url = new URL(window.location.href);
  if ("reviewActive" in patch) {
    if (patch.reviewActive) {
      url.searchParams.set("memory_tab", "review");
    } else {
      url.searchParams.delete("memory_tab");
    }
  }
  if ("batchId" in patch) {
    if (patch.batchId) {
      url.searchParams.set("memory_batch", patch.batchId);
    } else {
      url.searchParams.delete("memory_batch");
    }
  }
  if ("itemId" in patch) {
    if (patch.itemId) {
      url.searchParams.set("memory_item", patch.itemId);
    } else {
      url.searchParams.delete("memory_item");
    }
  }
  window.history.replaceState({}, "", url.toString());
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function firstUndecided(items: SemanticReviewItem[]): SemanticReviewItem | null {
  return items.find((item) => item.decision === null) ?? items[0] ?? null;
}

function normalizeBatches(response: BatchListResponse | undefined): SemanticReviewBatch[] {
  return Array.isArray(response?.items) ? response.items : [];
}

function normalizeItems(response: BatchGetResponse | undefined): SemanticReviewItem[] {
  return Array.isArray(response?.item?.items) ? response.item.items : [];
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return asObject(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return asObject(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown): string | null {
  return asString(value) || null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(asString).filter(Boolean) : [];
}

function parseSourceRevisionRefs(metadata: Record<string, unknown>): SemanticSourceRevisionRef[] {
  const rows = Array.isArray(metadata.source_revision_refs) ? metadata.source_revision_refs : [];
  return rows
    .map((entry) => {
      const row = asObject(entry);
      return {
        revision_id: asString(row.revision_id),
        payload_sha256: asString(row.payload_sha256),
        fragment_refs: asStringArray(row.fragment_refs),
      };
    })
    .filter((entry) => entry.revision_id && entry.payload_sha256);
}

function normalizeEvidenceElement(value: Record<string, unknown>): SemanticEvidenceElement {
  const metadata = parseObject(value.metadata);
  return {
    id: asString(value.id),
    type: asString(value.type),
    content: asString(value.content),
    as_of: asNullableNumber(value.as_of),
    created_at: asNullableNumber(value.created_at) ?? 0,
    profile_id: asNullableString(value.profile_id),
    profile_version: asNullableString(value.profile_version),
    payload_sha256: asNullableString(value.payload_sha256),
    subject_type: asNullableString(value.subject_type),
    subject_ref: asNullableString(value.subject_ref),
    producer_id: asNullableString(value.producer_id),
    producer_version: asNullableString(value.producer_version),
    typed_payload: Object.keys(asObject(metadata.typed_payload)).length
      ? asObject(metadata.typed_payload)
      : null,
    source_revision_refs: parseSourceRevisionRefs(metadata),
  };
}

function normalizeAttachment(value: unknown): SemanticSourceAttachment | null {
  const attachment = asObject(value);
  const id = asString(attachment.id);
  if (!id) return null;
  const metadata = asObject(attachment.metadata);
  return {
    id,
    filename: asString(attachment.filename) || "Attachment",
    mime_type: asNullableString(attachment.mime_type),
    media_type: asNullableString(attachment.media_type),
    size: asNullableNumber(attachment.size),
    artifact_available: Object.keys(asObject(metadata.artifact)).length > 0,
  };
}

function displayRecipients(record: Record<string, unknown>, payload: Record<string, unknown>): string[] {
  const metadata = asObject(record.metadata);
  const explicit = asString(metadata.to);
  if (explicit) return [explicit];
  const recipients = Array.isArray(record.recipients)
    ? record.recipients
    : Array.isArray(payload.recipients)
      ? payload.recipients
      : [];
  return recipients
    .map((entry) => {
      const recipient = asObject(entry);
      return asString(recipient.name) || asString(recipient.id);
    })
    .filter(Boolean);
}

function normalizeSourceEvidence(
  ref: SemanticSourceRevisionRef,
  revision: Record<string, unknown>,
  record: Record<string, unknown>,
  loadError: string | null,
): SemanticSourceEvidence {
  const payload = asObject(revision.payload);
  const metadata = asObject(record.metadata);
  const payloadMetadata = asObject(payload.source_metadata);
  const attachments = (Array.isArray(record.attachments)
    ? record.attachments
    : Array.isArray(payload.attachments)
      ? payload.attachments
      : [])
    .map(normalizeAttachment)
    .filter((entry): entry is SemanticSourceAttachment => entry !== null);
  return {
    revision_id: ref.revision_id,
    revision_ordinal: asNullableNumber(revision.revision_ordinal) ?? 0,
    payload_sha256: asString(revision.payload_sha256) || ref.payload_sha256,
    record_id: asString(revision.record_row_id) || asString(record.id),
    platform: asString(revision.platform) || asString(record.platform),
    source_record_type: asString(revision.source_record_type),
    source_timestamp: asNullableNumber(revision.source_timestamp) ?? asNullableNumber(record.timestamp),
    observed_at: asNullableNumber(revision.observed_at) ?? asNullableNumber(record.received_at),
    provider_account_ref: asNullableString(revision.provider_account_ref),
    provider_thread_id: asNullableString(revision.provider_thread_id),
    provider_message_id: asNullableString(revision.provider_message_id),
    subject: asNullableString(metadata.subject) ?? asNullableString(payloadMetadata.subject),
    sender: asNullableString(metadata.from) ?? asNullableString(payloadMetadata.from),
    recipients: displayRecipients(record, payload),
    body_text:
      asNullableString(metadata.body_text) ??
      asNullableString(payloadMetadata.body_text) ??
      asNullableString(record.content) ??
      asNullableString(payload.content),
    direction: asNullableString(metadata.direction) ?? asNullableString(payloadMetadata.direction),
    attachments,
    fragment_refs: ref.fragment_refs,
    load_error: loadError,
  };
}

function normalizeObservationHistoryEntry(value: Record<string, unknown>): SemanticObservationHistoryEntry {
  const metadata = parseObject(value.metadata);
  return {
    id: asString(value.id),
    parent_id: asNullableString(value.parent_id),
    created_at: asNullableNumber(value.created_at) ?? 0,
    as_of: asNullableNumber(value.as_of),
    content: asString(value.content),
    profile_id: asNullableString(value.profile_id),
    profile_version: asNullableString(value.profile_version),
    typed_payload: Object.keys(asObject(metadata.typed_payload)).length
      ? asObject(metadata.typed_payload)
      : null,
  };
}

async function loadObservationHistory(
  client: RuntimeBrowserClient,
  currentHead: Record<string, unknown> | null,
): Promise<SemanticObservationHistoryEntry[]> {
  if (!currentHead || !asString(currentHead.id)) return [];
  const entries: SemanticObservationHistoryEntry[] = [];
  const visited = new Set<string>();
  let cursor: Record<string, unknown> | null = currentHead;
  while (cursor && entries.length < 50) {
    const id = asString(cursor.id);
    if (!id || visited.has(id)) break;
    visited.add(id);
    const entry = normalizeObservationHistoryEntry(cursor);
    entries.push(entry);
    if (!entry.parent_id) break;
    const response = await client.request<ElementGetResponse>("memory.elements.get", {
      id: entry.parent_id,
    });
    cursor = response?.element ?? null;
  }
  return entries.reverse();
}

async function loadEvidenceBundle(
  client: RuntimeBrowserClient,
  members: SemanticEvidenceMember[],
  currentHead: Record<string, unknown> | null,
): Promise<SemanticEvidenceBundle> {
  const elementMembers = members.filter((member) =>
    ["element", "fact", "observation"].includes(member.memberType),
  );
  const elements = await Promise.all(
    elementMembers.map(async (member) => {
      const response = await client.request<ElementGetResponse>("memory.elements.get", {
        id: member.memberId,
      });
      return normalizeEvidenceElement(response?.element ?? {});
    }),
  );
  const refs = new Map<string, SemanticSourceRevisionRef>();
  for (const element of elements) {
    for (const ref of element.source_revision_refs) refs.set(ref.revision_id, ref);
  }
  const sources = await Promise.all(
    Array.from(refs.values()).map(async (ref) => {
      try {
        const revisionResponse = await client.request<RevisionGetResponse>(
          "records.revisions.get",
          { revision_id: ref.revision_id },
        );
        const revision = revisionResponse?.revision ?? {};
        const recordId = asString(revision.record_row_id);
        const recordResponse = recordId
          ? await client.request<RecordGetResponse>("records.get", { id: recordId })
          : undefined;
        return normalizeSourceEvidence(ref, revision, recordResponse?.record ?? {}, null);
      } catch (error) {
        return normalizeSourceEvidence(ref, {}, {}, errorText(error));
      }
    }),
  );
  sources.sort((left, right) => (left.source_timestamp ?? 0) - (right.source_timestamp ?? 0));
  return {
    elements,
    sources,
    observation_history: await loadObservationHistory(client, currentHead),
  };
}

function clearAttachmentPreview(state: SemanticReviewControllerState): void {
  if (state.semanticReviewAttachmentPreview?.object_url.startsWith("blob:")) {
    URL.revokeObjectURL(state.semanticReviewAttachmentPreview.object_url);
  }
  state.semanticReviewAttachmentPreview = null;
  state.semanticReviewAttachmentError = null;
}

export function restoreSemanticReviewRoute(state: SemanticReviewControllerState): boolean {
  const requested = readReviewUrlState().reviewActive;
  if (requested) {
    state.memorySubTab = "review";
  }
  return requested;
}

export function setSemanticReviewRouteActive(active: boolean): void {
  writeReviewUrlState(
    active
      ? { reviewActive: true }
      : { reviewActive: false, batchId: null, itemId: null },
  );
}

export async function loadSemanticReviewBatches(
  state: SemanticReviewControllerState,
  options: { keepSelection?: boolean; batchId?: string | null } = {},
): Promise<void> {
  if (!state.client || !state.connected || state.semanticReviewLoading) {
    return;
  }
  state.semanticReviewLoading = true;
  state.semanticReviewError = null;
  try {
    const response = await state.client.request<BatchListResponse>(
      "memory.calibration.batches.list",
      { limit: 100 },
    );
    const batches = normalizeBatches(response);
    state.semanticReviewBatches = batches;
    const urlState = readReviewUrlState();
    const requestedBatchId =
      options.batchId ??
      (options.keepSelection ? state.semanticReviewSelectedBatchId : null) ??
      urlState.batchId;
    const selectedBatch =
      (requestedBatchId && batches.find((batch) => batch.id === requestedBatchId)) ??
      batches.find((batch) => !batch.completed) ??
      batches[0] ??
      null;
    state.semanticReviewSelectedBatchId = selectedBatch?.id ?? null;
    writeReviewUrlState({
      reviewActive: true,
      batchId: selectedBatch?.id ?? null,
      itemId: selectedBatch ? urlState.itemId : null,
    });
    if (selectedBatch) {
      await loadSemanticReviewBatch(state, selectedBatch.id, {
        keepItemSelection: options.keepSelection === true,
        itemId: urlState.itemId,
      });
    } else {
      clearSelectedBatch(state);
    }
  } catch (error) {
    state.semanticReviewError = errorText(error);
  } finally {
    state.semanticReviewLoading = false;
  }
}

function clearSelectedBatch(state: SemanticReviewControllerState): void {
  state.semanticReviewSelectedBatch = null;
  state.semanticReviewItems = [];
  state.semanticReviewSelectedItemId = null;
  state.semanticReviewSelectedItem = null;
  state.semanticReviewEvidenceSet = null;
  state.semanticReviewEvidenceMembers = [];
  state.semanticReviewEvidenceBundle = null;
  clearAttachmentPreview(state);
}

export async function loadSemanticReviewBatch(
  state: SemanticReviewControllerState,
  batchId: string,
  options: { keepItemSelection?: boolean; itemId?: string | null } = {},
): Promise<void> {
  if (!state.client || !state.connected || !batchId || state.semanticReviewBatchLoading) {
    return;
  }
  state.semanticReviewBatchLoading = true;
  state.semanticReviewError = null;
  state.semanticReviewSelectedBatchId = batchId;
  try {
    const response = await state.client.request<BatchGetResponse>(
      "memory.calibration.batches.get",
      { id: batchId },
    );
    const items = normalizeItems(response);
    state.semanticReviewSelectedBatch = response?.item?.batch ?? null;
    state.semanticReviewItems = items;
    const requestedItemId =
      options.itemId ??
      (options.keepItemSelection ? state.semanticReviewSelectedItemId : null) ??
      readReviewUrlState().itemId;
    const selectedItem =
      (requestedItemId && items.find((item) => item.id === requestedItemId)) ??
      firstUndecided(items);
    state.semanticReviewSelectedItemId = selectedItem?.id ?? null;
    writeReviewUrlState({
      reviewActive: true,
      batchId,
      itemId: selectedItem?.id ?? null,
    });
    if (selectedItem) {
      await loadSemanticReviewItem(state, selectedItem.id);
    } else {
      state.semanticReviewSelectedItem = null;
      state.semanticReviewEvidenceSet = null;
      state.semanticReviewEvidenceMembers = [];
      state.semanticReviewEvidenceBundle = null;
      clearAttachmentPreview(state);
    }
  } catch (error) {
    state.semanticReviewError = errorText(error);
  } finally {
    state.semanticReviewBatchLoading = false;
  }
}

async function loadSemanticEvidence(
  state: SemanticReviewControllerState,
  inputSetId: string,
  currentHead: Record<string, unknown> | null,
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  state.semanticReviewEvidenceLoading = true;
  state.semanticReviewEvidenceError = null;
  state.semanticReviewEvidenceBundle = null;
  clearAttachmentPreview(state);
  try {
    const [setResponse, memberResponse] = await Promise.all([
      state.client.request<SetGetResponse>("memory.sets.get", { id: inputSetId }),
      state.client.request<MembersListResponse>("memory.sets.members.list", {
        setId: inputSetId,
      }),
    ]);
    state.semanticReviewEvidenceSet = setResponse?.set ?? null;
    state.semanticReviewEvidenceMembers = Array.isArray(memberResponse?.members)
      ? memberResponse.members
      : [];
    state.semanticReviewEvidenceBundle = await loadEvidenceBundle(
      state.client,
      state.semanticReviewEvidenceMembers,
      currentHead,
    );
  } catch (error) {
    state.semanticReviewEvidenceError = errorText(error);
    state.semanticReviewEvidenceSet = null;
    state.semanticReviewEvidenceMembers = [];
    state.semanticReviewEvidenceBundle = null;
  } finally {
    state.semanticReviewEvidenceLoading = false;
  }
}

export async function loadSemanticReviewItem(
  state: SemanticReviewControllerState,
  itemId: string,
): Promise<void> {
  if (!state.client || !state.connected || !itemId || state.semanticReviewItemLoading) {
    return;
  }
  state.semanticReviewItemLoading = true;
  state.semanticReviewError = null;
  state.semanticReviewSelectedItemId = itemId;
  try {
    const response = await state.client.request<ItemGetResponse>(
      "memory.calibration.items.get",
      { id: itemId },
    );
    const item = response?.item ?? null;
    state.semanticReviewSelectedItem = item;
    state.semanticReviewSelectedCandidateId = item?.decision?.selected_candidate_id ?? null;
    state.semanticReviewDecisionNotes = item?.decision?.review_notes ?? "";
    state.semanticReviewCorrectedOutputText = item?.decision?.corrected_output
      ? JSON.stringify(item.decision.corrected_output, null, 2)
      : "";
    state.semanticReviewDecisionError = null;
    writeReviewUrlState({
      reviewActive: true,
      batchId: item?.batch_id ?? state.semanticReviewSelectedBatchId,
      itemId: item?.id ?? null,
    });
    if (item) {
      await loadSemanticEvidence(state, item.input_set_id, item.current_head);
    }
  } catch (error) {
    state.semanticReviewError = errorText(error);
  } finally {
    state.semanticReviewItemLoading = false;
  }
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function openSemanticReviewAttachment(
  state: SemanticReviewControllerState,
  source: SemanticSourceEvidence,
  attachment: SemanticSourceAttachment,
): Promise<void> {
  if (!state.client || !state.connected || state.semanticReviewAttachmentLoading) return;
  state.semanticReviewAttachmentLoading = true;
  state.semanticReviewAttachmentError = null;
  try {
    const response = await state.client.request<AttachmentGetResponse>(
      "records.attachments.get",
      {
        record_id: source.record_id,
        attachment_id: attachment.id,
        include_body: true,
      },
    );
    if (!response?.body_base64 || response.encoding !== "base64") {
      throw new Error("The attachment body was not returned by the source record store.");
    }
    clearAttachmentPreview(state);
    const mimeType = attachment.mime_type || "application/octet-stream";
    const bytes = decodeBase64(response.body_base64);
    const objectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    state.semanticReviewAttachmentPreview = {
      record_id: source.record_id,
      attachment_id: attachment.id,
      filename: attachment.filename,
      mime_type: mimeType,
      object_url: objectUrl,
    } satisfies SemanticAttachmentPreview;
  } catch (error) {
    state.semanticReviewAttachmentError = errorText(error);
    state.semanticReviewAttachmentPreview = null;
  } finally {
    state.semanticReviewAttachmentLoading = false;
  }
}

export function closeSemanticReviewAttachment(state: SemanticReviewControllerState): void {
  clearAttachmentPreview(state);
}

export function selectSemanticReviewCandidate(
  state: SemanticReviewControllerState,
  candidateId: string,
): void {
  state.semanticReviewSelectedCandidateId = candidateId;
  const candidate = state.semanticReviewSelectedItem?.candidates.find(
    (entry) => entry.id === candidateId,
  );
  if (candidate) {
    state.semanticReviewCorrectedOutputText = JSON.stringify(candidate.output, null, 2);
  }
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure SHA-256 is unavailable in this browser context.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export async function submitSemanticReviewDecision(
  state: SemanticReviewControllerState,
  decision: SemanticReviewDecisionType,
): Promise<void> {
  const item = state.semanticReviewSelectedItem;
  if (!state.client || !state.connected || !item || state.semanticReviewDecisionBusy) {
    return;
  }
  state.semanticReviewDecisionBusy = true;
  state.semanticReviewDecisionError = null;
  state.semanticReviewDecisionMessage = null;
  try {
    const selectedCandidateId = state.semanticReviewSelectedCandidateId;
    if ((decision === "approve" || decision === "edit") && !selectedCandidateId) {
      throw new Error("Select a candidate before approving or editing.");
    }
    const notes = state.semanticReviewDecisionNotes.trim();
    if ((decision === "edit" || decision === "reject" || decision === "defer") && !notes) {
      throw new Error("Add review notes before editing, rejecting, or deferring.");
    }
    let correctedOutput: Record<string, unknown> | null = null;
    if (decision === "edit") {
      const parsed = JSON.parse(state.semanticReviewCorrectedOutputText) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Corrected output must be a JSON object.");
      }
      correctedOutput = parsed as Record<string, unknown>;
    }
    const reviewerRef = state.semanticReviewReviewerRef.trim();
    if (!reviewerRef) {
      throw new Error("Reviewer reference is required.");
    }
    const idempotencySeed = JSON.stringify({
      review_item_id: item.id,
      candidate_set: item.candidates.map((candidate) => candidate.output_sha256),
      decision,
      selected_candidate_id: selectedCandidateId,
      corrected_output: correctedOutput,
      reviewer_ref: reviewerRef,
      review_policy_ref: state.semanticReviewSelectedBatch?.review_policy_ref,
      review_notes: notes || null,
    });
    const idempotencyKey = `semantic-review-decision:${await sha256Hex(idempotencySeed)}`;
    await state.client.request("memory.calibration.items.decide", {
      reviewItemId: item.id,
      decision,
      selectedCandidateId:
        decision === "approve" || decision === "edit" ? selectedCandidateId : null,
      correctedOutput: decision === "edit" ? correctedOutput : null,
      reviewerRef,
      reviewPolicyRef: state.semanticReviewSelectedBatch?.review_policy_ref ?? "",
      reviewNotes: notes || null,
      idempotencyKey,
    });
    state.semanticReviewDecisionMessage = "Decision recorded. Model identities are now visible.";
    await refreshSemanticReviewSelection(state);
  } catch (error) {
    state.semanticReviewDecisionError = errorText(error);
  } finally {
    state.semanticReviewDecisionBusy = false;
  }
}

export async function completeSemanticReviewBatch(
  state: SemanticReviewControllerState,
): Promise<void> {
  const batch = state.semanticReviewSelectedBatch;
  if (!state.client || !state.connected || !batch || state.semanticReviewDecisionBusy) {
    return;
  }
  state.semanticReviewDecisionBusy = true;
  state.semanticReviewDecisionError = null;
  state.semanticReviewDecisionMessage = null;
  try {
    await state.client.request("memory.calibration.batches.complete", {
      batchId: batch.id,
      completedBy: state.semanticReviewReviewerRef.trim() || "operator:console",
    });
    state.semanticReviewDecisionMessage = "Batch completed with an immutable receipt.";
    await loadSemanticReviewBatches(state, {
      keepSelection: true,
      batchId: batch.id,
    });
  } catch (error) {
    state.semanticReviewDecisionError = errorText(error);
  } finally {
    state.semanticReviewDecisionBusy = false;
  }
}

async function refreshSemanticReviewSelection(state: SemanticReviewControllerState): Promise<void> {
  const batchId = state.semanticReviewSelectedBatchId;
  const itemId = state.semanticReviewSelectedItemId;
  if (!state.client || !batchId || !itemId) {
    return;
  }
  const [batchResponse, itemResponse] = await Promise.all([
    state.client.request<BatchGetResponse>("memory.calibration.batches.get", { id: batchId }),
    state.client.request<ItemGetResponse>("memory.calibration.items.get", { id: itemId }),
  ]);
  state.semanticReviewSelectedBatch = batchResponse?.item?.batch ?? null;
  state.semanticReviewItems = normalizeItems(batchResponse);
  state.semanticReviewSelectedItem = itemResponse?.item ?? null;
  const listResponse = await state.client.request<BatchListResponse>(
    "memory.calibration.batches.list",
    { limit: 100 },
  );
  state.semanticReviewBatches = normalizeBatches(listResponse);
}
