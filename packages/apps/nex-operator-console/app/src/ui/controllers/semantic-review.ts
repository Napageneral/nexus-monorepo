import type { RuntimeBrowserClient } from "../runtime.ts";
import type {
  SemanticEvidenceMember,
  SemanticEvidenceSet,
  SemanticReviewBatch,
  SemanticReviewDecisionType,
  SemanticReviewItem,
  SemanticReviewState,
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
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  state.semanticReviewEvidenceLoading = true;
  state.semanticReviewEvidenceError = null;
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
  } catch (error) {
    state.semanticReviewEvidenceError = errorText(error);
    state.semanticReviewEvidenceSet = null;
    state.semanticReviewEvidenceMembers = [];
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
      await loadSemanticEvidence(state, item.input_set_id);
    }
  } catch (error) {
    state.semanticReviewError = errorText(error);
  } finally {
    state.semanticReviewItemLoading = false;
  }
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
