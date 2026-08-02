import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeBrowserClient } from "../runtime.ts";
import type {
  SemanticReviewBatch,
  SemanticReviewDecision,
  SemanticReviewItem,
} from "../semantic-review-types.ts";
import {
  completeSemanticReviewBatch,
  loadSemanticReviewBatches,
  restoreSemanticReviewRoute,
  setSemanticReviewRouteActive,
  submitSemanticReviewDecision,
  type SemanticReviewControllerState,
} from "./semantic-review.ts";

const batch: SemanticReviewBatch = {
  id: "batch-1",
  domain: "finance",
  batch_label: "Finance calibration 001",
  review_policy_ref: "policy:blind-v1",
  source_manifest_sha256: "1".repeat(64),
  item_count: 1,
  decision_count: 0,
  completed: false,
  created_at: 1_722_499_200_000,
};

function reviewItem(decision: SemanticReviewDecision | null = null): SemanticReviewItem {
  return {
    id: "item-1",
    batch_id: batch.id,
    ordinal: 0,
    candidate_group_key: "finance:invoice-1",
    subject_type: "supplier_invoice",
    subject_ref: "invoice-1",
    input_set_id: "set-1",
    input_set_digest: "2".repeat(64),
    target_profile_id: "finance.supplier_invoice.v1",
    target_profile_version: "1.0.0",
    target_profile_schema_sha256: "3".repeat(64),
    expected_head_id: null,
    required_candidate_count: 3,
    candidate_count: 3,
    ready_for_review: true,
    current_head: null,
    candidates: ["A", "B", "C"].map((slot) => ({
      id: `candidate-${slot.toLowerCase()}`,
      blind_slot: slot,
      observation_candidate_id: `observation-${slot}`,
      candidate_role: "primary",
      response_status: "completed",
      output: { total_cents: slot === "B" ? 20_000 : 19_500 },
      output_sha256: slot.repeat(64),
      completed_at: 1_722_499_260_000,
    })),
    comparisons: [],
    decision,
  };
}

function createState(
  request: ReturnType<typeof vi.fn>,
  overrides: Partial<SemanticReviewControllerState> = {},
): SemanticReviewControllerState {
  return {
    client: { request } as unknown as RuntimeBrowserClient,
    connected: true,
    memorySubTab: "library",
    semanticReviewLoading: false,
    semanticReviewError: null,
    semanticReviewBatches: [],
    semanticReviewSelectedBatchId: null,
    semanticReviewBatchLoading: false,
    semanticReviewSelectedBatch: null,
    semanticReviewItems: [],
    semanticReviewSelectedItemId: null,
    semanticReviewItemLoading: false,
    semanticReviewSelectedItem: null,
    semanticReviewEvidenceLoading: false,
    semanticReviewEvidenceError: null,
    semanticReviewEvidenceSet: null,
    semanticReviewEvidenceMembers: [],
    semanticReviewEvidenceBundle: null,
    semanticReviewAttachmentLoading: false,
    semanticReviewAttachmentError: null,
    semanticReviewAttachmentPreview: null,
    semanticReviewDecisionBusy: false,
    semanticReviewDecisionError: null,
    semanticReviewDecisionMessage: null,
    semanticReviewSelectedCandidateId: null,
    semanticReviewDecisionNotes: "",
    semanticReviewCorrectedOutputText: "",
    semanticReviewReviewerRef: "operator:tyler",
    ...overrides,
  };
}

beforeEach(() => {
  window.history.replaceState({}, "", "/memory");
});

afterEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("semantic review controller", () => {
  it("restores the exact batch and item route and hydrates sealed evidence", async () => {
    window.history.replaceState(
      {},
      "",
      "/memory?memory_tab=review&memory_batch=batch-1&memory_item=item-1",
    );
    const item = reviewItem();
    const request = vi.fn(async (method: string) => {
      if (method === "memory.calibration.batches.list") return { items: [batch] };
      if (method === "memory.calibration.batches.get") {
        return { item: { batch, items: [item] } };
      }
      if (method === "memory.calibration.items.get") return { item };
      if (method === "memory.sets.get") {
        return {
          set: {
            id: "set-1",
            definitionId: "finance.calibration_input.v1",
            createdAt: 1_722_499_200_000,
            metadata: {},
            sealedAt: 1_722_499_210_000,
            memberCount: 1,
            memberDigest: "2".repeat(64),
            sealReceiptSha256: "4".repeat(64),
          },
        };
      }
      if (method === "memory.sets.members.list") {
        return {
          members: [
            {
              setId: "set-1",
              memberType: "fact",
              memberId: "fact-1",
              position: 0,
              addedAt: 1_722_499_205_000,
            },
          ],
        };
      }
      if (method === "memory.elements.get") {
        return {
          element: {
            id: "fact-1",
            type: "fact",
            content: "Invoice 27968 is due for $15,569.51.",
            as_of: 1_722_499_100_000,
            created_at: 1_722_499_220_000,
            profile_id: "finance.supplier_invoice.v1",
            profile_version: "1.0.0",
            payload_sha256: "5".repeat(64),
            metadata: {
              typed_payload: {
                invoice_ref: "27968",
                amount_due_minor_units: 1_556_951,
              },
              source_revision_refs: [
                {
                  revision_id: "revision-1",
                  payload_sha256: "6".repeat(64),
                  fragment_refs: ["attachment:invoice.pdf:page:1"],
                },
              ],
            },
          },
        };
      }
      if (method === "records.revisions.get") {
        return {
          revision: {
            revision_id: "revision-1",
            revision_ordinal: 1,
            payload_sha256: "6".repeat(64),
            record_row_id: "record-1",
            platform: "gmail",
            source_record_type: "message",
            source_timestamp: 1_722_499_100_000,
            observed_at: 1_722_499_200_000,
            provider_thread_id: "thread-1",
            provider_message_id: "message-1",
            payload: {},
          },
        };
      }
      if (method === "records.get") {
        return {
          record: {
            id: "record-1",
            platform: "gmail",
            metadata: {
              subject: "Inv # 27968",
              from: "Jim at Borden",
              to: "MoonSleep",
              body_text: "Please see the attached invoice.",
            },
            attachments: [
              {
                id: "attachment-1",
                filename: "invoice.pdf",
                mime_type: "application/pdf",
                size: 482_104,
                metadata: {},
              },
            ],
          },
        };
      }
      if (method === "records.list") {
        return {
          records: [
            {
              id: "record-custody-1",
              platform: "gmail",
              metadata: { message_id: "message-1" },
              attachments: [
                {
                  id: "attachment-1",
                  filename: "invoice.pdf",
                  mime_type: "application/pdf",
                  size: 482_104,
                  metadata: {
                    custody_state: "captured",
                    artifact: { artifact_id: "artifact-1" },
                  },
                },
              ],
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const state = createState(request);

    expect(restoreSemanticReviewRoute(state)).toBe(true);
    expect(state.memorySubTab).toBe("review");
    await loadSemanticReviewBatches(state);

    expect(state.semanticReviewSelectedBatchId).toBe("batch-1");
    expect(state.semanticReviewSelectedItemId).toBe("item-1");
    expect(state.semanticReviewSelectedItem?.input_set_digest).toBe("2".repeat(64));
    expect(state.semanticReviewEvidenceSet?.sealedAt).toBe(1_722_499_210_000);
    expect(state.semanticReviewEvidenceMembers.map((entry) => entry.memberId)).toEqual(["fact-1"]);
    expect(state.semanticReviewEvidenceBundle?.elements[0]?.typed_payload).toMatchObject({
      invoice_ref: "27968",
      amount_due_minor_units: 1_556_951,
    });
    expect(state.semanticReviewEvidenceBundle?.sources[0]).toMatchObject({
      subject: "Inv # 27968",
      sender: "Jim at Borden",
      body_text: "Please see the attached invoice.",
      source_timestamp: 1_722_499_100_000,
      observed_at: 1_722_499_200_000,
      attachments: [
        expect.objectContaining({
          record_id: "record-custody-1",
          artifact_available: true,
          custody_context: expect.stringContaining("same provider message"),
        }),
      ],
    });
    expect(new URL(window.location.href).searchParams.get("memory_item")).toBe("item-1");
    expect(request.mock.calls.map(([method]) => method)).toEqual([
      "memory.calibration.batches.list",
      "memory.calibration.batches.get",
      "memory.calibration.items.get",
      "memory.sets.get",
      "memory.sets.members.list",
      "memory.elements.get",
      "records.revisions.get",
      "records.get",
      "records.list",
    ]);
  });

  it("submits an idempotent blind decision and refreshes the revealed item", async () => {
    const decision: SemanticReviewDecision = {
      id: "decision-1",
      review_item_id: "item-1",
      candidate_group_key: "finance:invoice-1",
      candidate_ids: ["candidate-a", "candidate-b", "candidate-c"],
      candidate_set_sha256: "5".repeat(64),
      selected_candidate_id: "candidate-b",
      decision: "approve",
      corrected_output: null,
      corrected_output_sha256: null,
      reviewer_ref: "operator:tyler",
      review_policy_ref: "policy:blind-v1",
      review_notes: null,
      golden_eligible: true,
      created_at: 1_722_499_300_000,
    };
    const beforeDecision = reviewItem();
    const afterDecision = reviewItem(decision);
    afterDecision.candidates = afterDecision.candidates.map((entry, index) => ({
      ...entry,
      model_id: ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"][index],
    }));
    const request = vi.fn(async (method: string, params: Record<string, unknown>) => {
      if (method === "memory.calibration.items.decide") {
        expect(params.reviewItemId).toBe("item-1");
        expect(params.decision).toBe("approve");
        expect(params.selectedCandidateId).toBe("candidate-b");
        expect(params.idempotencyKey).toMatch(/^semantic-review-decision:[0-9a-f]{64}$/);
        return { item: afterDecision, reused: false };
      }
      if (method === "memory.calibration.batches.get") {
        return { item: { batch: { ...batch, decision_count: 1 }, items: [afterDecision] } };
      }
      if (method === "memory.calibration.items.get") return { item: afterDecision };
      if (method === "memory.calibration.batches.list") {
        return { items: [{ ...batch, decision_count: 1 }] };
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const state = createState(request, {
      semanticReviewSelectedBatchId: batch.id,
      semanticReviewSelectedBatch: batch,
      semanticReviewSelectedItemId: beforeDecision.id,
      semanticReviewSelectedItem: beforeDecision,
      semanticReviewItems: [beforeDecision],
      semanticReviewBatches: [batch],
      semanticReviewSelectedCandidateId: "candidate-b",
    });

    await submitSemanticReviewDecision(state, "approve");

    expect(state.semanticReviewDecisionError).toBeNull();
    expect(state.semanticReviewDecisionMessage).toContain("Model identities are now visible");
    expect(state.semanticReviewSelectedItem?.decision?.id).toBe("decision-1");
    expect(state.semanticReviewSelectedItem?.candidates[1]?.model_id).toBe("gpt-5.6-terra");
    expect(request).toHaveBeenCalledTimes(4);
  });

  it("fails closed on an invalid corrected output before calling the runtime", async () => {
    const request = vi.fn();
    const item = reviewItem();
    const state = createState(request, {
      semanticReviewSelectedBatchId: batch.id,
      semanticReviewSelectedBatch: batch,
      semanticReviewSelectedItemId: item.id,
      semanticReviewSelectedItem: item,
      semanticReviewSelectedCandidateId: "candidate-a",
      semanticReviewDecisionNotes: "Correct the extracted amount.",
      semanticReviewCorrectedOutputText: "not json",
    });

    await submitSemanticReviewDecision(state, "edit");

    expect(request).not.toHaveBeenCalled();
    expect(state.semanticReviewDecisionError).toContain("Unexpected token");
    expect(state.semanticReviewDecisionBusy).toBe(false);
  });

  it("completes a fully decided batch and clears review routes when the subtab closes", async () => {
    const terminalBatch = { ...batch, decision_count: 1 };
    const item = reviewItem();
    const request = vi.fn(async (method: string) => {
      if (method === "memory.calibration.batches.complete") {
        return { item: { batch_id: batch.id }, reused: false };
      }
      if (method === "memory.calibration.batches.list") {
        return { items: [{ ...terminalBatch, completed: true }] };
      }
      if (method === "memory.calibration.batches.get") {
        return {
          item: {
            batch: { ...terminalBatch, completed: true },
            items: [item],
          },
        };
      }
      if (method === "memory.calibration.items.get") return { item };
      if (method === "memory.sets.get") return { set: null };
      if (method === "memory.sets.members.list") return { members: [] };
      throw new Error(`unexpected method: ${method}`);
    });
    const state = createState(request, {
      semanticReviewSelectedBatchId: terminalBatch.id,
      semanticReviewSelectedBatch: terminalBatch,
      semanticReviewSelectedItemId: item.id,
      semanticReviewSelectedItem: item,
      semanticReviewItems: [item],
      semanticReviewBatches: [terminalBatch],
    });
    window.history.replaceState(
      {},
      "",
      "/memory?memory_tab=review&memory_batch=batch-1&memory_item=item-1",
    );

    await completeSemanticReviewBatch(state);

    expect(request.mock.calls[0]?.[0]).toBe("memory.calibration.batches.complete");
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      batchId: "batch-1",
      completedBy: "operator:tyler",
    });
    expect(state.semanticReviewSelectedBatch?.completed).toBe(true);
    expect(state.semanticReviewDecisionMessage).toContain("immutable receipt");

    setSemanticReviewRouteActive(false);
    const url = new URL(window.location.href);
    expect(url.searchParams.get("memory_tab")).toBeNull();
    expect(url.searchParams.get("memory_batch")).toBeNull();
    expect(url.searchParams.get("memory_item")).toBeNull();
  });
});
