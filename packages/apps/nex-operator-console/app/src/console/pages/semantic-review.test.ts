import { render } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  SemanticReviewBatch,
  SemanticReviewCandidate,
  SemanticReviewDecision,
  SemanticReviewItem,
} from "../../ui/semantic-review-types.ts";
import { renderSemanticReviewPage, type SemanticReviewPageProps } from "./semantic-review.ts";

const batch: SemanticReviewBatch = {
  id: "batch-1",
  domain: "helpdesk",
  batch_label: "Helpdesk calibration 001",
  review_policy_ref: "policy:blind-v1",
  source_manifest_sha256: "1".repeat(64),
  item_count: 1,
  decision_count: 0,
  completed: false,
  created_at: 1_722_499_200_000,
};

function candidate(
  id: string,
  blindSlot: string,
  modelId: string,
): SemanticReviewCandidate {
  return {
    id,
    blind_slot: blindSlot,
    observation_candidate_id: `observation-${blindSlot}`,
    candidate_role: "primary",
    response_status: "completed",
    output: { issue_summary: `${blindSlot} summary`, needs_reply: true },
    output_sha256: blindSlot.repeat(64),
    completed_at: 1_722_499_260_000,
    model_id: modelId,
    requested_model_id: modelId,
    reasoning_effort: "light",
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      reasoning_tokens: 10,
      total_tokens: 130,
    },
    elapsed_ms: 1_250,
  };
}

const candidates = [
  candidate("candidate-a", "A", "gpt-5.6-luna"),
  candidate("candidate-b", "B", "gpt-5.6-terra"),
  candidate("candidate-c", "C", "gpt-5.6-sol"),
];

function item(decision: SemanticReviewDecision | null = null): SemanticReviewItem {
  return {
    id: "item-1",
    batch_id: batch.id,
    ordinal: 0,
    candidate_group_key: "helpdesk:thread-1",
    subject_type: "gmail_thread",
    subject_ref: "thread-1",
    input_set_id: "set-1",
    input_set_digest: "2".repeat(64),
    target_profile_id: "helpdesk.thread_interpretation.v1",
    target_profile_version: "1.0.0",
    target_profile_schema_sha256: "3".repeat(64),
    expected_head_id: null,
    required_candidate_count: 3,
    candidate_count: 3,
    ready_for_review: true,
    current_head: null,
    candidates,
    comparisons: [
      {
        left_blind_slot: "A",
        right_blind_slot: "B",
        differences: [{ path: "$.issue_summary", left: "A summary", right: "B summary" }],
      },
    ],
    decision,
  };
}

function props(overrides: Partial<SemanticReviewPageProps> = {}): SemanticReviewPageProps {
  const reviewItem = item();
  return {
    loading: false,
    error: null,
    batches: [batch],
    selectedBatchId: batch.id,
    batchLoading: false,
    selectedBatch: batch,
    items: [reviewItem],
    selectedItemId: reviewItem.id,
    itemLoading: false,
    selectedItem: reviewItem,
    evidenceLoading: false,
    evidenceError: null,
    evidenceSet: {
      id: "set-1",
      definitionId: "helpdesk.calibration_input.v1",
      createdAt: 1_722_499_200_000,
      metadata: {},
      sealedAt: 1_722_499_210_000,
      memberCount: 1,
      memberDigest: "2".repeat(64),
      sealReceiptSha256: "4".repeat(64),
    },
    evidenceMembers: [
      {
        setId: "set-1",
        memberType: "fact",
        memberId: "fact-1",
        position: 0,
        addedAt: 1_722_499_205_000,
      },
    ],
    decisionBusy: false,
    decisionError: null,
    decisionMessage: null,
    selectedCandidateId: null,
    decisionNotes: "",
    correctedOutputText: "",
    reviewerRef: "operator:tyler",
    onBatchSelect: vi.fn(),
    onItemSelect: vi.fn(),
    onCandidateSelect: vi.fn(),
    onDecisionNotesChange: vi.fn(),
    onCorrectedOutputChange: vi.fn(),
    onReviewerRefChange: vi.fn(),
    onDecide: vi.fn(),
    onCompleteBatch: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("semantic review page", () => {
  it("keeps every model identity hidden before a decision", () => {
    const container = document.createElement("div");
    document.body.append(container);
    render(renderSemanticReviewPage(props()), container);

    const text = container.textContent ?? "";
    expect(text).toContain("Candidate A");
    expect(text).toContain("Candidate B");
    expect(text).toContain("Candidate C");
    expect(text).not.toContain("gpt-5.6-luna");
    expect(text).not.toContain("gpt-5.6-terra");
    expect(text).not.toContain("gpt-5.6-sol");
    expect(container.querySelectorAll(".semantic-review-model-reveal")).toHaveLength(0);
  });

  it("reveals model metadata only after an immutable decision exists", () => {
    const decision: SemanticReviewDecision = {
      id: "decision-1",
      review_item_id: "item-1",
      candidate_group_key: "helpdesk:thread-1",
      candidate_ids: candidates.map((entry) => entry.id),
      candidate_set_sha256: "5".repeat(64),
      selected_candidate_id: "candidate-b",
      decision: "approve",
      corrected_output: null,
      corrected_output_sha256: null,
      reviewer_ref: "operator:tyler",
      review_policy_ref: "policy:blind-v1",
      review_notes: "Candidate B preserves the evidence boundary.",
      golden_eligible: true,
      created_at: 1_722_499_300_000,
    };
    const decidedItem = item(decision);
    const container = document.createElement("div");
    document.body.append(container);
    render(
      renderSemanticReviewPage(
        props({
          selectedItem: decidedItem,
          items: [decidedItem],
          selectedCandidateId: "candidate-b",
        }),
      ),
      container,
    );

    const text = container.textContent ?? "";
    expect(text).toContain("gpt-5.6-luna");
    expect(text).toContain("gpt-5.6-terra");
    expect(text).toContain("gpt-5.6-sol");
    expect(text).toContain("Immutable decision receipt");
    expect(text).toContain("Candidate B");
    expect(container.querySelectorAll(".semantic-review-model-reveal")).toHaveLength(3);
  });

  it("routes candidate selection and each operator decision", () => {
    const onCandidateSelect = vi.fn();
    const onDecide = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    render(
      renderSemanticReviewPage(
        props({ selectedCandidateId: "candidate-a", onCandidateSelect, onDecide }),
      ),
      container,
    );

    container.querySelector<HTMLButtonElement>('[aria-label="Select candidate B"]')?.click();
    expect(onCandidateSelect).toHaveBeenCalledWith("candidate-b");

    for (const [label, decision] of [
      ["Approve selected", "approve"],
      ["Save corrected", "edit"],
      ["Reject candidates", "reject"],
      ["Defer", "defer"],
    ] as const) {
      const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
        (entry) => entry.textContent?.trim() === label,
      );
      expect(button).not.toBeUndefined();
      button?.click();
      expect(onDecide).toHaveBeenLastCalledWith(decision);
    }
  });
});
