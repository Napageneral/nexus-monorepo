import { html, nothing } from "lit";
import type {
  SemanticEvidenceMember,
  SemanticEvidenceSet,
  SemanticReviewBatch,
  SemanticReviewCandidate,
  SemanticReviewDecisionType,
  SemanticReviewItem,
} from "../../ui/semantic-review-types.ts";

export type SemanticReviewPageProps = {
  loading: boolean;
  error: string | null;
  batches: SemanticReviewBatch[];
  selectedBatchId: string | null;
  batchLoading: boolean;
  selectedBatch: SemanticReviewBatch | null;
  items: SemanticReviewItem[];
  selectedItemId: string | null;
  itemLoading: boolean;
  selectedItem: SemanticReviewItem | null;
  evidenceLoading: boolean;
  evidenceError: string | null;
  evidenceSet: SemanticEvidenceSet | null;
  evidenceMembers: SemanticEvidenceMember[];
  decisionBusy: boolean;
  decisionError: string | null;
  decisionMessage: string | null;
  selectedCandidateId: string | null;
  decisionNotes: string;
  correctedOutputText: string;
  reviewerRef: string;
  onBatchSelect: (batchId: string) => void;
  onItemSelect: (itemId: string) => void;
  onCandidateSelect: (candidateId: string) => void;
  onDecisionNotesChange: (value: string) => void;
  onCorrectedOutputChange: (value: string) => void;
  onReviewerRefChange: (value: string) => void;
  onDecide: (decision: SemanticReviewDecisionType) => void;
  onCompleteBatch: () => void;
  onRefresh: () => void;
};

function formatTimestamp(value: number | undefined): string {
  if (value == null) return "Not available";
  const milliseconds = value < 1_000_000_000_000 ? value * 1_000 : value;
  return new Date(milliseconds).toLocaleString();
}

function shortDigest(value: string | null | undefined): string {
  if (!value) return "Not available";
  return value.length > 20 ? `${value.slice(0, 12)}...${value.slice(-6)}` : value;
}

function formatValue(value: unknown): string {
  if (value === undefined) return "Missing";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function statusTone(value: string): string {
  if (value === "completed" || value === "approve" || value === "edit") {
    return "console-badge--success";
  }
  if (value === "reject") return "console-badge--danger";
  if (value === "defer") return "console-badge--warning";
  return "console-badge--neutral";
}

function renderLoading(label: string) {
  return html`
    <div class="semantic-review-loading" aria-live="polite">
      <div class="console-skeleton semantic-review-skeleton-line"></div>
      <div class="console-skeleton semantic-review-skeleton-line semantic-review-skeleton-line--short"></div>
      <span class="console-muted">${label}</span>
    </div>
  `;
}

function renderBatchQueue(props: SemanticReviewPageProps) {
  if (props.loading) return renderLoading("Loading review batches");
  if (props.batches.length === 0) {
    return html`
      <div class="console-empty semantic-review-empty">
        <div class="console-empty-title">No review batches yet</div>
        <div class="console-empty-description">
          Candidate jobs will place sealed evidence cohorts here for blind review.
        </div>
      </div>
    `;
  }
  return html`
    <div class="semantic-review-batch-list" aria-label="Semantic review batches">
      ${props.batches.map((batch) => {
        const selected = batch.id === props.selectedBatchId;
        return html`
          <button
            class="semantic-review-batch ${selected ? "semantic-review-batch--selected" : ""}"
            aria-pressed=${selected ? "true" : "false"}
            @click=${() => props.onBatchSelect(batch.id)}
          >
            <span class="semantic-review-batch-heading">
              <span class="console-strong">${batch.batch_label}</span>
              <span class="console-badge ${batch.completed ? "console-badge--success" : "console-badge--neutral"}">
                ${batch.completed ? "Complete" : "Open"}
              </span>
            </span>
            <span class="console-muted semantic-review-batch-domain">${batch.domain}</span>
            <span class="semantic-review-batch-progress">
              <strong>${batch.decision_count}</strong> of ${batch.item_count} decisions
            </span>
            <span class="console-faint">Created ${formatTimestamp(batch.created_at)}</span>
          </button>
        `;
      })}
    </div>
  `;
}

function renderItemQueue(props: SemanticReviewPageProps) {
  if (props.batchLoading) return renderLoading("Loading batch items");
  if (!props.selectedBatch || props.items.length === 0) {
    return html`<div class="console-empty semantic-review-empty"><div class="console-empty-title">Select a batch</div></div>`;
  }
  return html`
    <div class="semantic-review-item-strip" aria-label="Items in selected batch">
      ${props.items.map((item) => {
        const selected = item.id === props.selectedItemId;
        return html`
          <button
            class="semantic-review-item-chip ${selected ? "semantic-review-item-chip--selected" : ""}"
            aria-pressed=${selected ? "true" : "false"}
            @click=${() => props.onItemSelect(item.id)}
          >
            <span class="semantic-review-item-ordinal">${item.ordinal + 1}</span>
            <span class="semantic-review-item-copy">
              <strong>${item.subject_ref}</strong>
              <small>${item.subject_type}</small>
            </span>
            <span class="console-badge ${item.decision ? statusTone(item.decision.decision) : "console-badge--neutral"}">
              ${item.decision?.decision ?? `${item.candidate_count}/${item.required_candidate_count}`}
            </span>
          </button>
        `;
      })}
    </div>
  `;
}

function renderEvidence(props: SemanticReviewPageProps, item: SemanticReviewItem) {
  return html`
    <aside class="semantic-review-evidence" aria-label="Review evidence">
      <div class="semantic-review-panel-heading">
        <div>
          <h3>Evidence contract</h3>
          <p>Exact sealed inputs used by every candidate.</p>
        </div>
        <span class="console-badge ${props.evidenceSet?.sealedAt ? "console-badge--success" : "console-badge--warning"}">
          ${props.evidenceSet?.sealedAt ? "Sealed" : "Read only"}
        </span>
      </div>
      <dl class="semantic-review-metadata">
        <div><dt>Subject</dt><dd>${item.subject_ref}</dd></div>
        <div><dt>Source type</dt><dd>${item.subject_type}</dd></div>
        <div><dt>Input set</dt><dd class="console-mono" title=${item.input_set_id}>${item.input_set_id}</dd></div>
        <div><dt>Set digest</dt><dd class="console-mono" title=${item.input_set_digest}>${shortDigest(item.input_set_digest)}</dd></div>
        <div><dt>Target profile</dt><dd>${item.target_profile_id}@${item.target_profile_version}</dd></div>
        <div><dt>Schema</dt><dd class="console-mono" title=${item.target_profile_schema_sha256}>${shortDigest(item.target_profile_schema_sha256)}</dd></div>
      </dl>

      <div class="semantic-review-subsection">
        <h4>Set members</h4>
        ${props.evidenceLoading
          ? renderLoading("Loading evidence members")
          : props.evidenceError
            ? html`<p class="semantic-review-inline-error">${props.evidenceError}</p>`
            : props.evidenceMembers.length === 0
              ? html`<p class="console-muted">No member rows were returned.</p>`
              : html`
                  <ol class="semantic-review-members">
                    ${props.evidenceMembers.slice(0, 20).map(
                      (member) => html`
                        <li>
                          <span class="console-badge console-badge--neutral">${member.memberType}</span>
                          <code title=${member.memberId}>${member.memberId}</code>
                        </li>
                      `,
                    )}
                  </ol>
                  ${props.evidenceMembers.length > 20
                    ? html`<p class="console-faint">${props.evidenceMembers.length - 20} more members are bound to the sealed set.</p>`
                    : nothing}
                `}
      </div>

      <div class="semantic-review-subsection">
        <h4>Current observation head</h4>
        ${item.current_head
          ? html`<pre class="semantic-review-json semantic-review-json--head">${JSON.stringify(item.current_head, null, 2)}</pre>`
          : html`<p class="console-muted">No current head. This review starts a new observation chain.</p>`}
      </div>
    </aside>
  `;
}

function renderCandidate(
  props: SemanticReviewPageProps,
  item: SemanticReviewItem,
  candidate: SemanticReviewCandidate,
) {
  const selected = candidate.id === props.selectedCandidateId;
  const decided = item.decision !== null;
  const modelVisible = decided && Boolean(candidate.model_id);
  return html`
    <article
      class="semantic-review-candidate ${selected ? "semantic-review-candidate--selected" : ""}"
      data-blind-slot=${candidate.blind_slot}
    >
      <header>
        <button
          class="semantic-review-candidate-select"
          aria-pressed=${selected ? "true" : "false"}
          aria-label=${`Select candidate ${candidate.blind_slot}`}
          ?disabled=${decided || !item.ready_for_review}
          @click=${() => props.onCandidateSelect(candidate.id)}
        >
          <span class="semantic-review-slot">${candidate.blind_slot}</span>
          <span>
            <strong>Candidate ${candidate.blind_slot}</strong>
            <small>${selected ? "Selected" : decided ? "Review complete" : "Select for decision"}</small>
          </span>
        </button>
        <span class="console-badge ${statusTone(candidate.response_status)}">${candidate.response_status}</span>
      </header>
      ${modelVisible
        ? html`
            <div class="semantic-review-model-reveal">
              <strong>${candidate.model_id}</strong>
              <span>${candidate.reasoning_effort ?? "unspecified"} reasoning</span>
              ${candidate.usage
                ? html`<span>${candidate.usage.total_tokens.toLocaleString()} tokens</span>`
                : nothing}
              ${candidate.elapsed_ms != null ? html`<span>${candidate.elapsed_ms} ms</span>` : nothing}
            </div>
          `
        : nothing}
      <pre class="semantic-review-json">${JSON.stringify(candidate.output, null, 2)}</pre>
      <footer>
        <span class="console-mono" title=${candidate.output_sha256}>${shortDigest(candidate.output_sha256)}</span>
        <span class="console-faint">${formatTimestamp(candidate.completed_at)}</span>
      </footer>
    </article>
  `;
}

function renderComparisons(item: SemanticReviewItem) {
  if (item.comparisons.length === 0) {
    return html`<p class="console-muted">Candidate comparisons will appear when at least two outputs are available.</p>`;
  }
  return html`
    <div class="semantic-review-comparisons">
      ${item.comparisons.map(
        (comparison) => html`
          <details class="semantic-review-diff" ?open=${comparison.differences.length > 0}>
            <summary>
              <span>Candidate ${comparison.left_blind_slot} vs ${comparison.right_blind_slot}</span>
              <span class="console-badge ${comparison.differences.length === 0 ? "console-badge--success" : "console-badge--warning"}">
                ${comparison.differences.length} difference${comparison.differences.length === 1 ? "" : "s"}
              </span>
            </summary>
            ${comparison.differences.length === 0
              ? html`<p class="console-muted">Outputs match exactly.</p>`
              : html`
                  <div class="semantic-review-diff-table">
                    ${comparison.differences.map(
                      (difference) => html`
                        <div class="semantic-review-diff-row">
                          <code>${difference.path}</code>
                          <pre>${formatValue(difference.left)}</pre>
                          <pre>${formatValue(difference.right)}</pre>
                        </div>
                      `,
                    )}
                  </div>
                `}
          </details>
        `,
      )}
    </div>
  `;
}

function renderDecisionPanel(props: SemanticReviewPageProps, item: SemanticReviewItem) {
  if (item.decision) {
    const selected = item.candidates.find(
      (candidate) => candidate.id === item.decision?.selected_candidate_id,
    );
    return html`
      <section class="semantic-review-decision semantic-review-decision--terminal">
        <div class="semantic-review-panel-heading">
          <div>
            <h3>Review decision</h3>
            <p>Immutable decision receipt recorded by ${item.decision.reviewer_ref}.</p>
          </div>
          <span class="console-badge ${statusTone(item.decision.decision)}">${item.decision.decision}</span>
        </div>
        <div class="semantic-review-terminal-grid">
          <div><span>Selected candidate</span><strong>${selected ? `Candidate ${selected.blind_slot}` : "None"}</strong></div>
          <div><span>Golden eligible</span><strong>${item.decision.golden_eligible ? "Yes" : "No"}</strong></div>
          <div><span>Recorded</span><strong>${formatTimestamp(item.decision.created_at)}</strong></div>
        </div>
        ${item.decision.review_notes
          ? html`<p class="semantic-review-decision-notes">${item.decision.review_notes}</p>`
          : nothing}
        ${item.decision.corrected_output
          ? html`
              <div class="semantic-review-subsection">
                <h4>Corrected output</h4>
                <pre class="semantic-review-json">${JSON.stringify(item.decision.corrected_output, null, 2)}</pre>
              </div>
            `
          : nothing}
      </section>
    `;
  }

  const disabled = props.decisionBusy || !item.ready_for_review;
  return html`
    <section class="semantic-review-decision">
      <div class="semantic-review-panel-heading">
        <div>
          <h3>Record your decision</h3>
          <p>Model identities remain hidden until one terminal decision is stored.</p>
        </div>
        <span class="console-badge ${item.ready_for_review ? "console-badge--success" : "console-badge--warning"}">
          ${item.ready_for_review ? "Ready" : `${item.candidate_count}/${item.required_candidate_count} candidates`}
        </span>
      </div>
      <div class="semantic-review-form-grid">
        <label>
          <span>Reviewer reference</span>
          <input
            class="console-input"
            .value=${props.reviewerRef}
            ?disabled=${props.decisionBusy}
            @input=${(event: Event) => props.onReviewerRefChange((event.target as HTMLInputElement).value)}
          />
        </label>
        <label>
          <span>Review notes</span>
          <textarea
            class="console-input semantic-review-notes"
            placeholder="Required for edit, reject, and defer"
            .value=${props.decisionNotes}
            ?disabled=${props.decisionBusy}
            @input=${(event: Event) => props.onDecisionNotesChange((event.target as HTMLTextAreaElement).value)}
          ></textarea>
        </label>
      </div>
      <details class="semantic-review-correction" ?open=${Boolean(props.correctedOutputText)}>
        <summary>Edit selected output</summary>
        <textarea
          class="console-input semantic-review-correction-editor console-mono"
          spellcheck="false"
          placeholder="Select a candidate to start from its exact JSON output"
          .value=${props.correctedOutputText}
          ?disabled=${props.decisionBusy}
          @input=${(event: Event) => props.onCorrectedOutputChange((event.target as HTMLTextAreaElement).value)}
        ></textarea>
      </details>
      ${props.decisionError
        ? html`<p class="semantic-review-inline-error" role="alert">${props.decisionError}</p>`
        : nothing}
      ${props.decisionMessage
        ? html`<p class="semantic-review-inline-success" role="status">${props.decisionMessage}</p>`
        : nothing}
      <div class="semantic-review-actions">
        <button class="console-btn console-btn--primary" ?disabled=${disabled || !props.selectedCandidateId} @click=${() => props.onDecide("approve")}>
          Approve selected
        </button>
        <button class="console-btn console-btn--secondary" ?disabled=${disabled || !props.selectedCandidateId} @click=${() => props.onDecide("edit")}>
          Save corrected
        </button>
        <button class="console-btn console-btn--secondary" ?disabled=${disabled} @click=${() => props.onDecide("reject")}>
          Reject candidates
        </button>
        <button class="console-btn console-btn--ghost" ?disabled=${disabled} @click=${() => props.onDecide("defer")}>
          Defer
        </button>
      </div>
    </section>
  `;
}

function renderSelectedItem(props: SemanticReviewPageProps) {
  if (props.itemLoading) return renderLoading("Loading comparison item");
  const item = props.selectedItem;
  if (!item) {
    return html`
      <div class="console-empty semantic-review-empty">
        <div class="console-empty-title">Select an item to review</div>
        <div class="console-empty-description">The same evidence is shown beside every blind candidate.</div>
      </div>
    `;
  }
  return html`
    <div class="semantic-review-workspace">
      ${renderEvidence(props, item)}
      <div class="semantic-review-candidate-workspace">
        <div class="semantic-review-item-heading">
          <div>
            <p class="console-faint">${item.subject_type}</p>
            <h2>${item.subject_ref}</h2>
            <p class="console-muted">Compare outputs against one sealed evidence set. Select on substance before model identity is revealed.</p>
          </div>
          <span class="console-badge ${item.decision ? statusTone(item.decision.decision) : item.ready_for_review ? "console-badge--success" : "console-badge--warning"}">
            ${item.decision?.decision ?? (item.ready_for_review ? "Ready for review" : "Waiting for candidates")}
          </span>
        </div>
        <div class="semantic-review-candidate-grid">
          ${item.candidates.map((candidate) => renderCandidate(props, item, candidate))}
        </div>
        <section class="semantic-review-comparison-section">
          <div class="semantic-review-panel-heading">
            <div><h3>Field comparison</h3><p>Canonical payload differences only.</p></div>
          </div>
          ${renderComparisons(item)}
        </section>
        ${renderDecisionPanel(props, item)}
      </div>
    </div>
  `;
}

export function renderSemanticReviewPage(props: SemanticReviewPageProps) {
  const canComplete =
    Boolean(props.selectedBatch) &&
    !props.selectedBatch?.completed &&
    props.selectedBatch?.item_count === props.selectedBatch?.decision_count;
  return html`
    <section class="semantic-review-shell">
      <div class="semantic-review-toolbar">
        <div>
          <h2>Blind semantic review</h2>
          <p>Compare candidate outputs without model identity bias.</p>
        </div>
        <div class="semantic-review-toolbar-actions">
          ${canComplete
            ? html`
                <button class="console-btn console-btn--primary" ?disabled=${props.decisionBusy} @click=${props.onCompleteBatch}>
                  Complete batch
                </button>
              `
            : nothing}
          <button class="console-btn console-btn--secondary" ?disabled=${props.loading} @click=${props.onRefresh}>
            Refresh review
          </button>
        </div>
      </div>
      ${props.error
        ? html`<div class="semantic-review-banner semantic-review-banner--error" role="alert">${props.error}</div>`
        : nothing}
      ${props.decisionMessage
        ? html`<div class="semantic-review-banner semantic-review-banner--success" role="status">${props.decisionMessage}</div>`
        : nothing}
      <div class="semantic-review-queue-layout">
        <nav class="semantic-review-queue-panel">${renderBatchQueue(props)}</nav>
        <div class="semantic-review-review-panel">
          ${renderItemQueue(props)}
          ${renderSelectedItem(props)}
        </div>
      </div>
    </section>
  `;
}
