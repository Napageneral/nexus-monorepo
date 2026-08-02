import { html, nothing } from "lit";
import type {
  SemanticAttachmentPreview,
  SemanticEvidenceBundle,
  SemanticEvidenceElement,
  SemanticEvidenceMember,
  SemanticEvidenceSet,
  SemanticReviewBatch,
  SemanticReviewCandidate,
  SemanticReviewDecisionType,
  SemanticReviewItem,
  SemanticSourceAttachment,
  SemanticSourceEvidence,
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
  evidenceBundle: SemanticEvidenceBundle | null;
  attachmentLoading: boolean;
  attachmentError: string | null;
  attachmentPreview: SemanticAttachmentPreview | null;
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
  onAttachmentOpen: (source: SemanticSourceEvidence, attachment: SemanticSourceAttachment) => void;
  onAttachmentClose: () => void;
  onDecisionNotesChange: (value: string) => void;
  onCorrectedOutputChange: (value: string) => void;
  onReviewerRefChange: (value: string) => void;
  onDecide: (decision: SemanticReviewDecisionType) => void;
  onCompleteBatch: () => void;
  onRefresh: () => void;
};

function formatTimestamp(value: number | null | undefined): string {
  if (value == null) return "Not available";
  const milliseconds = value < 1_000_000_000_000 ? value * 1_000 : value;
  return new Date(milliseconds).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function shortDigest(value: string | null | undefined): string {
  if (!value) return "Not available";
  return value.length > 20 ? `${value.slice(0, 12)}...${value.slice(-6)}` : value;
}

function humanize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function subjectTitle(item: SemanticReviewItem): string {
  const parts = item.subject_ref.split(":").filter(Boolean);
  if (parts.length >= 3 && item.subject_type === "supplier_invoice") {
    return `${humanize(parts[1] ?? "Supplier")} invoice ${parts.slice(2).join(" ")}`;
  }
  return parts.map(humanize).join(" · ") || item.subject_ref;
}

function formatBytes(value: number | null): string {
  if (value == null) return "Size unavailable";
  if (value < 1_024) return `${value} B`;
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KB`;
  return `${(value / 1_048_576).toFixed(1)} MB`;
}

function formatFieldValue(key: string, value: unknown): string {
  if (value === undefined) return "Missing";
  if (value === null) return "Unknown";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && key.endsWith("_minor_units")) {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value / 100);
  }
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : "None";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function statusTone(value: string): string {
  if (value === "completed" || value === "approve" || value === "edit") return "console-badge--success";
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
    return html`<div class="console-empty semantic-review-empty"><div class="console-empty-title">No review batches yet</div><div class="console-empty-description">Processed evidence will appear here for human review.</div></div>`;
  }
  return html`
    <div class="semantic-review-batch-list" aria-label="Review batches">
      ${props.batches.map((batch) => {
        const selected = batch.id === props.selectedBatchId;
        return html`
          <button class="semantic-review-batch ${selected ? "semantic-review-batch--selected" : ""}" aria-pressed=${selected ? "true" : "false"} @click=${() => props.onBatchSelect(batch.id)}>
            <span class="semantic-review-batch-heading"><span class="console-strong">${batch.batch_label}</span><span class="console-badge ${batch.completed ? "console-badge--success" : "console-badge--neutral"}">${batch.completed ? "Complete" : "Open"}</span></span>
            <span class="console-muted semantic-review-batch-domain">${humanize(batch.domain)}</span>
            <span class="semantic-review-batch-progress"><strong>${batch.decision_count}</strong> of ${batch.item_count} reviewed</span>
          </button>
        `;
      })}
    </div>
  `;
}

function renderItemQueue(props: SemanticReviewPageProps) {
  if (props.batchLoading) return renderLoading("Loading review items");
  if (!props.selectedBatch || props.items.length === 0) return html`<div class="console-empty semantic-review-empty"><div class="console-empty-title">Select a batch</div></div>`;
  return html`
    <div class="semantic-review-item-strip" aria-label="Items in selected batch">
      ${props.items.map((item) => {
        const selected = item.id === props.selectedItemId;
        return html`
          <button class="semantic-review-item-chip ${selected ? "semantic-review-item-chip--selected" : ""}" aria-pressed=${selected ? "true" : "false"} @click=${() => props.onItemSelect(item.id)}>
            <span class="semantic-review-item-ordinal">${item.ordinal + 1}</span>
            <span class="semantic-review-item-copy"><strong>${subjectTitle(item)}</strong><small>${humanize(item.subject_type)}</small></span>
            <span class="console-badge ${item.decision ? statusTone(item.decision.decision) : "console-badge--neutral"}">${item.decision?.decision ?? `${item.candidate_count}/${item.required_candidate_count}`}</span>
          </button>
        `;
      })}
    </div>
  `;
}

function renderFieldTable(payload: Record<string, unknown> | null) {
  if (!payload || Object.keys(payload).length === 0) return html`<p class="console-muted">No structured fields were produced.</p>`;
  return html`
    <dl class="semantic-review-field-table">
      ${Object.entries(payload).map(([key, value]) => html`<div><dt>${humanize(key)}</dt><dd>${formatFieldValue(key, value)}</dd></div>`)}
    </dl>
  `;
}

function renderAttachment(props: SemanticReviewPageProps, source: SemanticSourceEvidence, attachment: SemanticSourceAttachment) {
  const selected = props.attachmentPreview?.record_id === source.record_id &&
    props.attachmentPreview.attachment_id === attachment.id;
  const unavailableLabel = attachment.custody_state === "skipped_size_limit"
    ? "Too large"
    : attachment.custody_state === "failed"
      ? "Capture failed"
      : "Metadata only";
  return html`
    <div class="semantic-review-attachment ${selected ? "semantic-review-attachment--selected" : ""}">
      <span class="semantic-review-file-icon" aria-hidden="true">${attachment.mime_type?.includes("pdf") ? "PDF" : "FILE"}</span>
      <span class="semantic-review-attachment-copy"><strong>${attachment.filename}</strong><small>${formatBytes(attachment.size)} · ${attachment.mime_type ?? attachment.media_type ?? "Unknown format"}</small></span>
      ${attachment.artifact_available
        ? html`<div class="semantic-review-attachment-action"><span class="console-badge console-badge--success">Verified</span><button class="console-btn console-btn--secondary" ?disabled=${props.attachmentLoading} @click=${() => props.onAttachmentOpen(source, attachment)}>${selected ? "Reload" : "Read"}</button></div>`
        : html`<span class="console-badge console-badge--warning" title=${attachment.custody_error ?? "The source retained attachment metadata, but its bytes are not in Nex artifact custody."}>${unavailableLabel}</span>`}
    </div>
  `;
}

function renderInlineAttachmentPreview(props: SemanticReviewPageProps, source: SemanticSourceEvidence) {
  const preview = props.attachmentPreview;
  if (!preview || preview.record_id !== source.record_id) return nothing;
  const isPdf = preview.mime_type.includes("pdf");
  const isImage = preview.mime_type.startsWith("image/");
  return html`
    <section class="semantic-review-document-preview" aria-label=${`Original attachment: ${preview.filename}`}>
      <header>
        <div><p class="console-eyebrow">Original document</p><h4>${preview.filename}</h4></div>
        <div class="semantic-review-document-actions"><a class="console-btn console-btn--secondary" href=${preview.object_url} download=${preview.filename}>Download</a><button class="console-btn console-btn--ghost" @click=${props.onAttachmentClose}>Close</button></div>
      </header>
      ${isPdf
        ? html`<iframe src=${preview.object_url} title=${preview.filename}></iframe>`
        : isImage
          ? html`<img src=${preview.object_url} alt=${preview.filename} />`
          : html`<div class="semantic-review-document-fallback"><p>This file is preserved and available to download, but cannot be previewed inline.</p></div>`}
    </section>
  `;
}

function renderSourceCard(props: SemanticReviewPageProps, source: SemanticSourceEvidence, index: number) {
  return html`
    <article class="semantic-review-source-card">
      <header class="semantic-review-source-header">
        <div><span class="semantic-review-source-order">${index + 1}</span><strong>${source.subject || `${humanize(source.platform)} source record`}</strong></div>
        <span class="console-badge console-badge--neutral">${humanize(source.platform)}</span>
      </header>
      <dl class="semantic-review-message-header">
        <div><dt>From</dt><dd>${source.sender ?? "Unknown sender"}</dd></div>
        <div><dt>To</dt><dd>${source.recipients.join(", ") || "Unknown recipient"}</dd></div>
        <div><dt>Effective</dt><dd>${formatTimestamp(source.source_timestamp)}</dd></div>
        <div><dt>Learned</dt><dd>${formatTimestamp(source.observed_at)}</dd></div>
      </dl>
      ${source.load_error ? html`<p class="semantic-review-inline-error">Source could not be loaded: ${source.load_error}</p>` : nothing}
      <div class="semantic-review-message-body">${source.body_text || "No message body was retained for this revision."}</div>
      ${source.attachments.length
        ? html`<div class="semantic-review-attachments"><h4>Attachments</h4>${source.attachments.map((attachment) => renderAttachment(props, source, attachment))}</div>`
        : nothing}
      ${renderInlineAttachmentPreview(props, source)}
      ${source.fragment_refs.length
        ? html`<div class="semantic-review-grounding"><span>Evidence used</span>${source.fragment_refs.map((fragment) => html`<code>${fragment}</code>`)}</div>`
        : nothing}
    </article>
  `;
}

function renderFact(element: SemanticEvidenceElement) {
  return html`
    <article class="semantic-review-fact-card">
      <header><div><span class="console-badge console-badge--neutral">${humanize(element.type)}</span><strong>${element.content || humanize(element.profile_id ?? "Extracted fact")}</strong></div><time>${formatTimestamp(element.as_of)}</time></header>
      ${renderFieldTable(element.typed_payload)}
      <details class="semantic-review-technical"><summary>Technical provenance</summary><dl class="semantic-review-metadata"><div><dt>Profile</dt><dd>${element.profile_id ?? "Not registered"}@${element.profile_version ?? "?"}</dd></div><div><dt>Producer</dt><dd>${element.producer_id ?? "Unknown"}@${element.producer_version ?? "?"}</dd></div><div><dt>Created</dt><dd>${formatTimestamp(element.created_at)}</dd></div><div><dt>Element</dt><dd class="console-mono">${element.id}</dd></div></dl></details>
    </article>
  `;
}

function renderObservationHistory(bundle: SemanticEvidenceBundle) {
  if (!bundle.observation_history.length) return html`<p class="console-muted">No prior observation exists. Approval would begin this subject's history.</p>`;
  return html`
    <ol class="semantic-review-history">
      ${bundle.observation_history.map((entry, index) => html`
        <li>
          <span class="semantic-review-history-marker"></span>
          <div><header><strong>${index === bundle.observation_history.length - 1 ? "Current understanding" : `Version ${index + 1}`}</strong><time>Effective ${formatTimestamp(entry.as_of)} · learned ${formatTimestamp(entry.created_at)}</time></header><p>${entry.content}</p>${renderFieldTable(entry.typed_payload)}</div>
        </li>
      `)}
    </ol>
  `;
}

function renderEvidence(props: SemanticReviewPageProps, item: SemanticReviewItem) {
  const bundle = props.evidenceBundle;
  return html`
    <section class="semantic-review-evidence" aria-label="Original evidence and extracted facts">
      <div class="semantic-review-panel-heading"><div><p class="console-eyebrow">Original evidence</p><h3>What Nex saw</h3><p>The real messages and files are shown in business-time order.</p></div><span class="console-badge ${props.evidenceSet?.sealedAt ? "console-badge--success" : "console-badge--warning"}">${props.evidenceSet?.sealedAt ? "Inputs sealed" : "Read only"}</span></div>
      ${props.evidenceLoading
        ? renderLoading("Loading source records and facts")
        : props.evidenceError
          ? html`<p class="semantic-review-inline-error">${props.evidenceError}</p>`
          : html`
              <div class="semantic-review-source-stack">
                ${bundle?.sources.length ? bundle.sources.map((source, index) => renderSourceCard(props, source, index)) : html`<div class="semantic-review-missing-source"><strong>No source record is linked.</strong><p>The sealed set exists, but this fact does not carry an exact source revision reference.</p></div>`}
              </div>
              <section class="semantic-review-understanding">
                <div class="semantic-review-section-title"><div><p class="console-eyebrow">Extraction</p><h3>Facts found in that evidence</h3></div><span>${bundle?.elements.length ?? 0} fact${bundle?.elements.length === 1 ? "" : "s"}</span></div>
                <div class="semantic-review-fact-list">${bundle?.elements.length ? bundle.elements.map(renderFact) : html`<p class="console-muted">No typed facts were returned.</p>`}</div>
              </section>
              <section class="semantic-review-understanding">
                <div class="semantic-review-section-title"><div><p class="console-eyebrow">History</p><h3>How our understanding changed</h3></div></div>
                ${bundle ? renderObservationHistory(bundle) : nothing}
              </section>
              <details class="semantic-review-contract"><summary>Technical evidence contract</summary><dl class="semantic-review-metadata"><div><dt>Subject</dt><dd>${item.subject_ref}</dd></div><div><dt>Input set</dt><dd class="console-mono">${item.input_set_id}</dd></div><div><dt>Set digest</dt><dd class="console-mono">${shortDigest(item.input_set_digest)}</dd></div><div><dt>Target profile</dt><dd>${item.target_profile_id}@${item.target_profile_version}</dd></div><div><dt>Schema</dt><dd class="console-mono">${shortDigest(item.target_profile_schema_sha256)}</dd></div><div><dt>Members</dt><dd>${props.evidenceMembers.length}</dd></div></dl></details>
            `}
      ${props.attachmentError ? html`<p class="semantic-review-inline-error">Attachment unavailable: ${props.attachmentError}</p>` : nothing}
    </section>
  `;
}

function renderCandidate(props: SemanticReviewPageProps, item: SemanticReviewItem, candidate: SemanticReviewCandidate, compact = false) {
  const selected = candidate.id === props.selectedCandidateId;
  const decided = item.decision !== null;
  return html`
    <article class="semantic-review-candidate ${selected ? "semantic-review-candidate--selected" : ""} ${compact ? "semantic-review-candidate--compact" : ""}">
      <header>
        <button class="semantic-review-candidate-select" aria-label=${`Select candidate ${candidate.blind_slot}`} aria-pressed=${selected ? "true" : "false"} ?disabled=${decided || !item.ready_for_review} @click=${() => props.onCandidateSelect(candidate.id)}><span class="semantic-review-slot">${candidate.blind_slot}</span><span><strong>Candidate ${candidate.blind_slot}</strong><small>${selected ? "Selected" : decided ? "Review complete" : "Select this analysis"}</small></span></button>
        <span class="console-badge ${statusTone(candidate.response_status)}">${candidate.response_status}</span>
      </header>
      ${!compact ? renderFieldTable(candidate.output) : nothing}
      ${decided && candidate.model_id ? html`<div class="semantic-review-model-reveal"><strong>${candidate.model_id}</strong><span>${candidate.reasoning_effort ?? "unspecified"} reasoning</span>${candidate.usage ? html`<span>${candidate.usage.total_tokens.toLocaleString()} tokens</span>` : nothing}</div>` : nothing}
      ${!compact ? html`<details class="semantic-review-technical"><summary>Raw output</summary><pre class="semantic-review-json">${JSON.stringify(candidate.output, null, 2)}</pre></details>` : nothing}
    </article>
  `;
}

function candidatesAgree(item: SemanticReviewItem): boolean {
  if (item.candidates.length < 2) return false;
  const first = JSON.stringify(item.candidates[0]?.output ?? {});
  return item.candidates.every((candidate) => JSON.stringify(candidate.output) === first);
}

function renderCandidates(props: SemanticReviewPageProps, item: SemanticReviewItem) {
  if (!item.candidates.length) return html`<p class="console-muted">Candidate analyses have not completed.</p>`;
  if (candidatesAgree(item)) {
    const first = item.candidates[0]!;
    return html`
      <div class="semantic-review-agreement"><div><span class="console-badge console-badge--success">Agreement</span><strong>All ${item.candidates.length} analyses produced the same fields.</strong></div><div class="semantic-review-agreement-slots">${item.candidates.map((candidate) => renderCandidate(props, item, candidate, true))}</div>${renderFieldTable(first.output)}<details class="semantic-review-technical"><summary>Raw output</summary><pre class="semantic-review-json">${JSON.stringify(first.output, null, 2)}</pre></details></div>
    `;
  }
  return html`<div class="semantic-review-candidate-grid">${item.candidates.map((candidate) => renderCandidate(props, item, candidate))}</div>`;
}

function renderComparisons(item: SemanticReviewItem) {
  const differing = item.comparisons.filter((comparison) => comparison.differences.length > 0);
  if (!differing.length) return html`<p class="console-muted">No field differences across the completed analyses.</p>`;
  return html`<div class="semantic-review-comparisons">${differing.map((comparison) => html`<details class="semantic-review-diff" open><summary><span>Analysis ${comparison.left_blind_slot} vs ${comparison.right_blind_slot}</span><span class="console-badge console-badge--warning">${comparison.differences.length} differences</span></summary><div class="semantic-review-diff-table">${comparison.differences.map((difference) => html`<div class="semantic-review-diff-row"><strong>${humanize(difference.path)}</strong><span>${formatFieldValue(difference.path, difference.left)}</span><span>${formatFieldValue(difference.path, difference.right)}</span></div>`)}</div></details>`)}</div>`;
}

function renderDecisionPanel(props: SemanticReviewPageProps, item: SemanticReviewItem) {
  if (item.decision) {
    const selected = item.candidates.find((candidate) => candidate.id === item.decision?.selected_candidate_id);
    return html`<section class="semantic-review-decision semantic-review-decision--terminal"><div class="semantic-review-panel-heading"><div><h3>Review decision</h3><p>Immutable decision receipt recorded by ${item.decision.reviewer_ref}.</p></div><span class="console-badge ${statusTone(item.decision.decision)}">${item.decision.decision}</span></div><div class="semantic-review-terminal-grid"><div><span>Selected</span><strong>${selected ? `Candidate ${selected.blind_slot}` : "None"}</strong></div><div><span>Golden eligible</span><strong>${item.decision.golden_eligible ? "Yes" : "No"}</strong></div><div><span>Recorded</span><strong>${formatTimestamp(item.decision.created_at)}</strong></div></div>${item.decision.review_notes ? html`<p class="semantic-review-decision-notes">${item.decision.review_notes}</p>` : nothing}</section>`;
  }
  const disabled = props.decisionBusy || !item.ready_for_review;
  return html`
    <section class="semantic-review-decision">
      <div class="semantic-review-panel-heading"><div><h3>Make the call</h3><p>Approve what is true, correct it, reject it, or defer it.</p></div><span class="console-badge ${item.ready_for_review ? "console-badge--success" : "console-badge--warning"}">${item.ready_for_review ? "Ready" : `${item.candidate_count}/${item.required_candidate_count}`}</span></div>
      <div class="semantic-review-form-grid"><label><span>Reviewer</span><input class="console-input" .value=${props.reviewerRef} ?disabled=${props.decisionBusy} @input=${(event: Event) => props.onReviewerRefChange((event.target as HTMLInputElement).value)} /></label><label><span>Notes</span><textarea class="console-input semantic-review-notes" placeholder="Required for corrections, rejection, or deferral" .value=${props.decisionNotes} ?disabled=${props.decisionBusy} @input=${(event: Event) => props.onDecisionNotesChange((event.target as HTMLTextAreaElement).value)}></textarea></label></div>
      <details class="semantic-review-correction"><summary>Edit selected fields as JSON</summary><textarea class="console-input semantic-review-correction-editor console-mono" spellcheck="false" .value=${props.correctedOutputText} ?disabled=${props.decisionBusy} @input=${(event: Event) => props.onCorrectedOutputChange((event.target as HTMLTextAreaElement).value)}></textarea></details>
      ${props.decisionError ? html`<p class="semantic-review-inline-error" role="alert">${props.decisionError}</p>` : nothing}
      <div class="semantic-review-actions"><button class="console-btn console-btn--primary" ?disabled=${disabled || !props.selectedCandidateId} @click=${() => props.onDecide("approve")}>Approve selected</button><button class="console-btn console-btn--secondary" ?disabled=${disabled || !props.selectedCandidateId} @click=${() => props.onDecide("edit")}>Save corrected</button><button class="console-btn console-btn--secondary" ?disabled=${disabled} @click=${() => props.onDecide("reject")}>Reject candidates</button><button class="console-btn console-btn--ghost" ?disabled=${disabled} @click=${() => props.onDecide("defer")}>Defer</button></div>
    </section>
  `;
}

function renderSelectedItem(props: SemanticReviewPageProps) {
  if (props.itemLoading) return renderLoading("Loading review item");
  const item = props.selectedItem;
  if (!item) return html`<div class="console-empty semantic-review-empty"><div class="console-empty-title">Select an item to review</div><div class="console-empty-description">Its original evidence, extracted facts, and proposed understanding will appear together.</div></div>`;
  return html`
    <div class="semantic-review-item-heading"><div><p class="console-eyebrow">${humanize(item.subject_type)}</p><h2>${subjectTitle(item)}</h2><p>Read the source first, inspect the extracted facts, then decide which proposed understanding is accurate.</p></div><span class="console-badge ${item.decision ? statusTone(item.decision.decision) : item.ready_for_review ? "console-badge--success" : "console-badge--warning"}">${item.decision?.decision ?? (item.ready_for_review ? "Ready for review" : "Processing")}</span></div>
    <div class="semantic-review-workspace">
      ${renderEvidence(props, item)}
      <div class="semantic-review-candidate-workspace"><section class="semantic-review-proposals"><div class="semantic-review-section-title"><div><p class="console-eyebrow">Proposed understanding</p><h3>What Nex thinks this means</h3><p>Model identities stay hidden until your decision is recorded.</p></div></div>${renderCandidates(props, item)}</section><section class="semantic-review-comparison-section"><div class="semantic-review-panel-heading"><div><h3>Meaningful differences</h3><p>Only fields on which the analyses disagree.</p></div></div>${renderComparisons(item)}</section>${renderDecisionPanel(props, item)}</div>
    </div>
  `;
}

export function renderSemanticReviewPage(props: SemanticReviewPageProps) {
  const canComplete = Boolean(props.selectedBatch) && !props.selectedBatch?.completed && props.selectedBatch?.item_count === props.selectedBatch?.decision_count;
  return html`
    <section class="semantic-review-shell">
      <div class="semantic-review-toolbar"><div><h2>Evidence inbox</h2><p>Original records, extracted facts, and evolving understanding in one review flow.</p></div><div class="semantic-review-toolbar-actions">${canComplete ? html`<button class="console-btn console-btn--primary" ?disabled=${props.decisionBusy} @click=${props.onCompleteBatch}>Complete batch</button>` : nothing}<button class="console-btn console-btn--secondary" ?disabled=${props.loading} @click=${props.onRefresh}>Refresh</button></div></div>
      ${props.error ? html`<div class="semantic-review-banner semantic-review-banner--error" role="alert">${props.error}</div>` : nothing}
      ${props.decisionMessage ? html`<div class="semantic-review-banner semantic-review-banner--success" role="status">${props.decisionMessage}</div>` : nothing}
      <div class="semantic-review-queue-layout"><nav class="semantic-review-queue-panel">${renderBatchQueue(props)}</nav><div class="semantic-review-review-panel">${renderItemQueue(props)}<div class="semantic-review-review-body">${renderSelectedItem(props)}</div></div></div>
    </section>
  `;
}
