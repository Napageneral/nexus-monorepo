import { html, nothing } from "lit";
import { icons } from "../../ui/icons.ts";
import type {
  MemoryReviewAttachment,
  MemoryReviewEpisodeDetail,
  MemoryReviewEpisodeOutputs,
  MemoryReviewEntityDetail,
  MemoryReviewFact,
  MemoryReviewFactDetail,
  MemoryReviewJobOutput,
  MemoryReviewLink,
  MemoryReviewObservation,
  MemoryReviewObservationDetail,
  MemoryReviewSearchType,
  MemoryReviewQualityBucket,
  MemoryReviewQualityItemsResult,
  MemoryReviewQualitySummary,
  MemoryReviewTimelineEvent,
} from "../../ui/types.ts";

// ─── Types ────────────────────────────────────────────────────────────

export type MemoryPageProps = {
  subTab: "observations" | "facts" | "episodes";
  onSubTabChange: (sub: MemoryPageProps["subTab"]) => void;
  loading: boolean;
  error: string | null;

  // Library - runs and episodes
  runs: Array<{
    id: string;
    platform?: string | null;
    started_at?: number | null;
    completed_at?: number | null;
    created_at?: number | null;
    total_episodes?: number;
    counts?: { pending: number; in_progress: number; completed: number; failed: number };
    facts_created?: number;
    entities_created?: number;
    status?: string;
  }>;
  selectedRunId: string | null;
  onRunSelect: (runId: string) => void;
  episodes: Array<{
    id: string;
    run_id?: string;
    platform?: string | null;
    thread_id?: string | null;
    event_count?: number;
    token_estimate?: number;
    status?: string;
    facts_created?: number;
    entities_created?: number;
    started_at?: number | null;
    completed_at?: number | null;
    error_message?: string | null;
  }>;
  episodesLoading: boolean;
  selectedEpisodeId: string | null;
  onEpisodeSelect: (episodeId: string) => void;

  // Episode detail
  inspectorLoading: boolean;
  episodeDetail: {
    episode?: MemoryReviewEpisodeDetail["episode"];
    timeline?: MemoryReviewEpisodeDetail["timeline"];
  } | null;
  episodeOutputs: MemoryReviewEpisodeOutputs | null;

  // Review lists and search
  searchQuery: string;
  searchType: MemoryReviewSearchType;
  searchLoading: boolean;
  observations: MemoryReviewObservation[];
  facts: MemoryReviewFact[];
  searchResults: Array<{
    id: string;
    kind: string;
    text: string;
    score?: number;
    entity_id?: string;
  }>;
  onSearchQueryChange: (q: string) => void;
  onSearchTypeChange: (t: MemoryPageProps["searchType"]) => void;
  onSearch: () => void;

  // Quality
  qualityScope: "run" | "global";
  qualityLoading: boolean;
  qualitySummary: MemoryReviewQualitySummary | null;
  qualityItemsLoading: boolean;
  qualityBucket: MemoryReviewQualityBucket;
  qualityItems: MemoryReviewQualityItemsResult | null;
  onQualityScopeChange: (scope: MemoryPageProps["qualityScope"]) => void;
  onQualityBucketSelect: (bucket: MemoryPageProps["qualityBucket"]) => void;
  onQualityPage: (offset: number) => void;

  // Detail panel
  detailKind: "entity" | "fact" | "observation" | null;
  detailLoading: boolean;
  detailEntity: MemoryReviewEntityDetail | null;
  detailFact: MemoryReviewFactDetail | null;
  detailObservation: MemoryReviewObservationDetail | null;
  onDetailClear: () => void;
  onEntitySelect: (id: string) => void;
  onFactSelect: (id: string) => void;
  onObservationSelect: (id: string) => void;
  onOpenNativeRecord: (recordId: string) => void;

  onRefresh: () => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────

function fmtTs(ts: number | null | undefined): string {
  if (ts == null) return "—";
  const ms = ts < 1_000_000_000_000 ? ts * 1000 : ts;
  return new Date(ms).toLocaleString();
}

function fmtDate(ts: number | null | undefined): string {
  if (ts == null || !Number.isFinite(ts)) return "—";
  const ms = ts < 1_000_000_000_000 ? ts * 1000 : ts;
  return new Date(ms).toLocaleDateString();
}

function shortText(value: string | null | undefined, max = 280): string {
  const text = (value ?? "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function compactId(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (text.length <= 18) return text || "—";
  return `${text.slice(0, 10)}…${text.slice(-6)}`;
}

function normalizeSourceEpisodeId(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (!text) return null;
  if (text.startsWith("consolidation:")) {
    const source = text.slice("consolidation:".length);
    return source || text;
  }
  return text;
}

function renderFullId(value: string | null | undefined, max = 72) {
  const text = (value ?? "").trim();
  if (!text) return html`<span class="console-faint">—</span>`;
  return html`
    <span
      class="console-faint"
      title=${text}
      style="display: inline-block; max-width: ${max}ch; font-size: var(--console-text-xs); line-height: 1.35; overflow-wrap: anywhere;"
    >
      ${text}
    </span>
  `;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function renderMetric(label: string, value: string | number, detail?: string) {
  return html`
    <div class="console-card" style="padding: var(--console-space-3);">
      <div class="console-section-label" style="margin-bottom: var(--console-space-2);">${label}</div>
      <div class="console-strong" style="font-size: var(--console-text-lg);">${value}</div>
      ${detail
        ? html`<div class="console-muted" style="font-size: var(--console-text-xs); margin-top: var(--console-space-1);">${detail}</div>`
        : nothing}
    </div>
  `;
}

function renderTextChip(text: string, tone: "neutral" | "success" | "warning" | "danger" = "neutral") {
  return html`<span class="console-badge console-badge--${tone}">${text}</span>`;
}

function renderParticipantChip(
  participant: NonNullable<MemoryReviewTimelineEvent["participants"]>[number],
) {
  const contact = participant.contact_id;
  return html`
    <span class="console-badge ${participant.is_user ? "console-badge--success" : "console-badge--neutral"}">
      ${participant.label}${contact && contact !== participant.label ? ` · ${contact}` : ""}
    </span>
  `;
}

function canOpenNativeTimelineEvent(event: MemoryReviewTimelineEvent): boolean {
  return event.platform === "imessage" && Boolean(event.event_id);
}

function confidenceBadge(confidence: number | undefined) {
  if (confidence == null) return nothing;
  const pct = Math.round(confidence * 100);
  const cls =
    pct >= 80
      ? "console-badge--success"
      : pct >= 50
        ? "console-badge--warning"
        : "console-badge--danger";
  return html`<span class="console-badge ${cls}">${pct}%</span>`;
}

function kindBadge(kind: string) {
  const map: Record<string, string> = {
    entity: "console-badge--neutral",
    fact: "console-badge--success",
    observation: "console-badge--warning",
    semantic: "console-badge--neutral",
  };
  const cls = map[kind] ?? "console-badge--neutral";
  return html`<span class="console-badge ${cls}">${kind}</span>`;
}

function statusBadge(status: string | undefined) {
  if (!status) return nothing;
  const cls =
    status === "completed" || status === "done"
      ? "console-badge--success"
      : status === "running" || status === "active"
        ? "console-badge--warning"
        : status === "failed" || status === "error"
          ? "console-badge--danger"
          : "console-badge--neutral";
  return html`<span class="console-badge ${cls}">${status}</span>`;
}

function jobStatusTone(
  status: string | null | undefined,
): "neutral" | "success" | "warning" | "danger" {
  if (status === "completed" || status === "done") return "success";
  if (status === "failed" || status === "error") return "danger";
  if (status === "skipped" || status === "deduped") return "warning";
  return "neutral";
}

function formatJobType(value: string): string {
  return value
    .replace(/^memory\./, "")
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function renderJobCount(label: string, value: number | null) {
  if (value == null) return nothing;
  return html`
    <span class="console-faint" style="font-size: var(--console-text-2xs);">
      ${label}: ${value}
    </span>
  `;
}

function renderSpinner() {
  return html`
    <div style="display: flex; align-items: center; justify-content: center; padding: var(--console-space-8);">
      <span class="console-muted" style="display: flex; align-items: center; gap: var(--console-space-2); font-size: var(--console-text-sm);">
        <span style="width: 16px; height: 16px; animation: console-spin 1s linear infinite;">${icons.loader}</span>
        Loading…
      </span>
    </div>
  `;
}

// ─── Sub-tab bar ──────────────────────────────────────────────────────

function renderSubTabs(
  active: MemoryPageProps["subTab"],
  onChange: MemoryPageProps["onSubTabChange"],
) {
  const tabs: { key: MemoryPageProps["subTab"]; label: string }[] = [
    { key: "observations", label: "Observations" },
    { key: "facts", label: "Facts" },
    { key: "episodes", label: "Episodes" },
  ];
  return html`
    <div class="console-detail-tabs" style="margin-bottom: var(--console-space-5);">
      ${tabs.map(
        (t) => html`
          <button
            class="console-detail-tab ${active === t.key ? "console-detail-tab--active" : ""}"
            @click=${() => onChange(t.key)}
          >
            ${t.label}
          </button>
        `,
      )}
    </div>
  `;
}

function renderReviewSearchBar(props: MemoryPageProps, placeholder: string) {
  return html`
    <div style="display: flex; align-items: center; gap: var(--console-space-2); margin-bottom: var(--console-space-4);">
      <div class="console-search-wrap" style="max-width: 420px; position: relative;">
        <span style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); width: 13px; height: 13px; color: var(--console-text-faint); pointer-events: none;">
          ${icons.search}
        </span>
        <input
          class="console-search-input"
          style="width: 100%; padding-left: 32px;"
          type="search"
          placeholder=${placeholder}
          .value=${props.searchQuery}
          @input=${(event: Event) =>
            props.onSearchQueryChange((event.target as HTMLInputElement).value)}
          @keydown=${(event: KeyboardEvent) => {
            if (event.key === "Enter") props.onSearch();
          }}
        />
      </div>
      <button class="console-btn console-btn--primary" @click=${props.onSearch}>
        Search
      </button>
    </div>
  `;
}

function renderAttachmentCard(attachment: MemoryReviewTimelineEvent["attachments"][number]) {
  const label =
    attachment.filename ||
    attachment.url ||
    attachment.local_path ||
    attachment.source_attachment_id ||
    attachment.id ||
    "Attachment";
  const type = attachment.media_type || attachment.mime_type || "file";
  const detail = [
    attachment.mime_type,
    attachment.size_bytes != null ? `${attachment.size_bytes.toLocaleString()} bytes` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const interpretationStatus = attachment.interpretation_status;
  const interpretationText = attachment.interpretation_text?.trim();
  return html`
    <div class="console-card" style="padding: var(--console-space-2); margin-top: var(--console-space-2);">
      <div style="display: flex; justify-content: space-between; gap: var(--console-space-2); align-items: flex-start;">
        <div style="min-width: 0;">
          <div class="console-strong" style="font-size: var(--console-text-xs); line-height: 1.35; overflow-wrap: anywhere;">
            ${label}
          </div>
          ${detail
            ? html`<div class="console-faint" style="font-size: var(--console-text-2xs); margin-top: 2px;">${detail}</div>`
            : nothing}
          ${attachment.local_path
            ? html`<div class="console-faint" style="font-size: var(--console-text-2xs); margin-top: 2px; overflow-wrap: anywhere;">${attachment.local_path}</div>`
            : nothing}
        </div>
        <div style="display: flex; flex-direction: column; gap: var(--console-space-1); align-items: flex-end;">
          ${renderTextChip(type, "neutral")}
          ${interpretationStatus
            ? renderTextChip(
                interpretationStatus === "success" ? "interpreted" : interpretationStatus,
                interpretationStatus === "success" ? "success" : "warning",
              )
            : renderTextChip("uninterpreted", "neutral")}
        </div>
      </div>
      ${interpretationText
        ? html`
            <div style="margin-top: var(--console-space-2); padding-top: var(--console-space-2); border-top: 1px solid var(--console-border);">
              <div class="console-section-label" style="font-size: var(--console-text-2xs); margin-bottom: 2px;">Interpretation</div>
              <div class="console-muted" style="font-size: var(--console-text-xs); line-height: 1.45;">
                ${shortText(interpretationText, 420)}
              </div>
              ${attachment.interpretation_model || attachment.interpretation_updated_at
                ? html`
                    <div class="console-faint" style="font-size: var(--console-text-2xs); margin-top: var(--console-space-1);">
                      ${attachment.interpretation_model || "attachment interpreter"}
                      ${attachment.interpretation_updated_at ? html` · ${fmtTs(attachment.interpretation_updated_at)}` : nothing}
                    </div>
                  `
                : nothing}
            </div>
          `
        : nothing}
    </div>
  `;
}

function renderLinkStatusChip(link: MemoryReviewLink) {
  const status = link.enrichment_status || "not enriched";
  const tone =
    status === "success"
      ? "success"
      : status === "blocked" ||
          status === "inaccessible" ||
          status === "failed" ||
          status === "insufficient_context"
        ? "warning"
        : "neutral";
  return renderTextChip(status, tone);
}

function renderEvidenceBasis(link: MemoryReviewLink) {
  const basis = link.enrichment_evidence_basis ?? {};
  const method = typeof basis.method === "string" ? basis.method : null;
  const browserFallback =
    typeof basis.browser_fallback === "string" ? basis.browser_fallback : null;
  const pieces = [
    method ? `method ${method}` : "",
    link.enrichment_access_status ? `access ${link.enrichment_access_status}` : "",
    link.enrichment_http_status != null ? `http ${link.enrichment_http_status}` : "",
    browserFallback ? `browser ${browserFallback}` : "",
  ].filter(Boolean);
  return pieces.length > 0 ? pieces.join(" · ") : null;
}

function renderLinkCard(link: MemoryReviewLink, attachments: MemoryReviewAttachment[]) {
  const title = link.enrichment_title || link.normalized_url || link.raw_url;
  const summary =
    link.enrichment_summary_text ||
    link.enrichment_description ||
    link.enrichment_extracted_text ||
    link.extraction_notes ||
    "";
  const previewIds = new Set(
    (link.preview_attachment_ids ?? [])
      .map((id) => (typeof id === "string" ? id.trim() : ""))
      .filter(Boolean),
  );
  const previewAttachments = attachments.filter((attachment) => previewIds.has(attachment.id));
  const evidenceBasis = renderEvidenceBasis(link);
  return html`
    <div class="console-card" style="padding: var(--console-space-2); margin-top: var(--console-space-2);">
      <div style="display: flex; justify-content: space-between; gap: var(--console-space-2); align-items: flex-start;">
        <div style="min-width: 0;">
          <div class="console-section-label" style="font-size: var(--console-text-2xs); margin-bottom: 2px;">Shared Link</div>
          <div class="console-strong" style="font-size: var(--console-text-xs); line-height: 1.35; overflow-wrap: anywhere;">
            ${title}
          </div>
          <div class="console-faint" style="font-size: var(--console-text-2xs); margin-top: 2px; overflow-wrap: anywhere;">
            ${link.normalized_url}
          </div>
          ${link.enrichment_site_name || link.enrichment_content_type || evidenceBasis
            ? html`
                <div class="console-faint" style="font-size: var(--console-text-2xs); margin-top: 2px;">
                  ${[link.enrichment_site_name, link.enrichment_content_type, evidenceBasis]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              `
            : nothing}
        </div>
        <div style="display: flex; flex-direction: column; gap: var(--console-space-1); align-items: flex-end;">
          ${renderLinkStatusChip(link)}
          ${link.enrichment_updated_at
            ? html`<span class="console-faint" style="font-size: var(--console-text-2xs);">${fmtTs(link.enrichment_updated_at)}</span>`
            : nothing}
        </div>
      </div>
      ${summary
        ? html`
            <div style="margin-top: var(--console-space-2); padding-top: var(--console-space-2); border-top: 1px solid var(--console-border);">
              <div class="console-muted" style="font-size: var(--console-text-xs); line-height: 1.45;">
                ${shortText(summary, 520)}
              </div>
            </div>
          `
        : nothing}
      ${previewAttachments.length > 0
        ? html`
            <div style="margin-top: var(--console-space-2);">
              <div class="console-section-label" style="font-size: var(--console-text-2xs); margin-bottom: var(--console-space-1);">
                Preview Payloads
              </div>
              ${previewAttachments.map((attachment) => renderAttachmentCard(attachment))}
            </div>
          `
        : previewIds.size > 0
          ? html`
              <div class="console-faint" style="font-size: var(--console-text-2xs); margin-top: var(--console-space-2);">
                Preview payload ids: ${Array.from(previewIds).join(", ")}
              </div>
            `
          : nothing}
    </div>
  `;
}

function renderInlineDetailPanel(props: MemoryPageProps) {
  const shouldShowDetail =
    (props.subTab === "observations" && props.detailKind === "observation") ||
    (props.subTab === "facts" && props.detailKind === "fact");
  const panel = shouldShowDetail ? renderDetailPanel(props) : nothing;
  if (panel !== nothing) {
    return panel;
  }
  return html`
    <div class="console-card" style="position: sticky; top: var(--console-space-4);">
      <div class="console-empty">
        <div class="console-empty-icon">${icons.brain}</div>
        <div class="console-empty-title">Select a row</div>
        <div class="console-empty-description">
          Choose an item to inspect its supporting facts, source episode, source records, and linked entities.
        </div>
      </div>
    </div>
  `;
}

function renderReviewSplit(left: unknown, right: unknown) {
  return html`
    <div style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(360px, 440px); gap: var(--console-space-4); align-items: start;">
      <div>${left}</div>
      <aside>${right}</aside>
    </div>
  `;
}

function renderObservationsTab(props: MemoryPageProps) {
  const rows = props.observations;
  const selectedId = props.detailKind === "observation" ? props.detailObservation?.observation.id : null;
  const list = props.searchLoading
    ? renderSpinner()
    : rows.length === 0
      ? html`
          <div class="console-card">
            <div class="console-empty">
              <div class="console-empty-icon">${icons.brain}</div>
              <div class="console-empty-title">No observations found</div>
              <div class="console-empty-description">
                Search for another observation.
              </div>
            </div>
          </div>
        `
      : html`
          <div class="console-card" style="padding: 0; overflow: hidden;">
            <table class="console-table">
              <thead>
                <tr>
                  <th>Observation</th>
                  <th>Status</th>
                  <th>Episode</th>
                  <th>Completed</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(
                  (obs) => html`
                    <tr
                      style="cursor: pointer; ${selectedId === obs.id ? "background: var(--console-row-selected, #f8f3e6);" : ""}"
                      @click=${() => props.onObservationSelect(obs.id)}
                    >
                      <td>
                        <span class="console-strong" style="font-size: var(--console-text-sm); line-height: 1.4;">
                          ${shortText(obs.output_text || "Observation output is empty.", 180)}
                        </span>
                        ${obs.is_stale ? html`<div style="margin-top: var(--console-space-1);">${renderTextChip("stale", "warning")}</div>` : nothing}
                      </td>
                      <td>${statusBadge(obs.status)}</td>
                      <td>
                        ${renderFullId(normalizeSourceEpisodeId(obs.episode_id), 34)}
                      </td>
                      <td>
                        <span class="console-faint" style="font-size: var(--console-text-xs);">${fmtDate(obs.completed_at ?? obs.created_at)}</span>
                      </td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          </div>
        `;

  return html`
    ${renderReviewSearchBar(props, "Search observations...")}
    ${renderReviewSplit(list, renderInlineDetailPanel(props))}
  `;
}

function renderFactsTab(props: MemoryPageProps) {
  const rows = props.facts;
  const selectedId = props.detailKind === "fact" ? props.detailFact?.fact.id : null;
  const list = props.searchLoading
    ? renderSpinner()
    : rows.length === 0
      ? html`
          <div class="console-card">
            <div class="console-empty">
              <div class="console-empty-icon">${icons.fileText}</div>
              <div class="console-empty-title">No facts found</div>
              <div class="console-empty-description">
                Search for another retained fact.
              </div>
            </div>
          </div>
        `
      : html`
          <div class="console-card" style="padding: 0; overflow: hidden;">
            <table class="console-table">
              <thead>
                <tr>
                  <th>Fact</th>
                  <th>Status</th>
                  <th>Episode</th>
                  <th>Record</th>
                  <th>As Of</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(
                  (fact) => html`
                    <tr
                      style="cursor: pointer; ${selectedId === fact.id ? "background: var(--console-row-selected, #f8f3e6);" : ""}"
                      @click=${() => props.onFactSelect(fact.id)}
                    >
                      <td>
                        <span class="console-strong" style="font-size: var(--console-text-sm); line-height: 1.4;">
                          ${shortText(fact.text || "Fact text is empty.", 180)}
                        </span>
                        ${fact.context
                          ? html`
                              <span class="console-faint" style="display: block; margin-top: var(--console-space-1); font-size: var(--console-text-xs);">
                                ${shortText(fact.context, 120)}
                              </span>
                            `
                          : nothing}
                      </td>
                      <td>${fact.is_consolidated ? renderTextChip("consolidated", "success") : renderTextChip("retained", "neutral")}</td>
                      <td>${renderFullId(normalizeSourceEpisodeId(fact.source_episode_id), 34)}</td>
                      <td>${renderFullId(fact.source_event_id, 26)}</td>
                      <td><span class="console-faint" style="font-size: var(--console-text-xs);">${fmtDate(fact.as_of)}</span></td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          </div>
        `;

  return html`
    ${renderReviewSearchBar(props, "Search facts...")}
    ${renderReviewSplit(list, renderInlineDetailPanel(props))}
  `;
}

function renderEpisodesTab(props: MemoryPageProps) {
  const query = props.searchQuery.trim().toLowerCase();
  const rows = query
    ? props.episodes.filter((episode) =>
        [episode.id, episode.run_id, episode.platform, episode.thread_id, episode.status]
          .some((value) => String(value ?? "").toLowerCase().includes(query)),
      )
    : props.episodes;
  const list = props.episodesLoading
    ? renderSpinner()
    : rows.length === 0
      ? html`
          <div class="console-card">
            <div class="console-empty">
              <div class="console-empty-icon">${icons.fileText}</div>
              <div class="console-empty-title">No episodes found</div>
              <div class="console-empty-description">
                Search for a different thread or episode.
              </div>
            </div>
          </div>
        `
      : html`
          <div class="console-card" style="padding: 0; overflow: hidden;">
            <table class="console-table">
              <thead>
                <tr>
                  <th>Episode</th>
                  <th>Platform</th>
                  <th>Records</th>
                  <th>Facts</th>
                  <th>Status</th>
                  <th>Completed</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(
                  (episode) => html`
                    <tr
                      style="cursor: pointer; ${props.selectedEpisodeId === episode.id ? "background: var(--console-row-selected, #f8f3e6);" : ""}"
                      @click=${() => props.onEpisodeSelect(episode.id)}
                    >
                      <td>
                        <span class="console-strong" style="display: block; font-size: var(--console-text-sm);">
                          ${shortText(episode.thread_id || episode.id, 120)}
                        </span>
                        <span class="console-faint" style="display: block; margin-top: var(--console-space-1);">
                          ${renderFullId(episode.id, 64)}
                        </span>
                      </td>
                      <td>${renderTextChip(episode.platform || "memory", "neutral")}</td>
                      <td>${episode.event_count ?? 0}</td>
                      <td>${episode.facts_created ?? 0}</td>
                      <td>${statusBadge(episode.status || "unknown")}</td>
                      <td><span class="console-faint" style="font-size: var(--console-text-xs);">${fmtDate(episode.completed_at)}</span></td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          </div>
        `;

  return html`
    <div style="display: flex; align-items: end; gap: var(--console-space-3); flex-wrap: wrap; margin-bottom: var(--console-space-4);">
      ${renderReviewSearchBar(props, "Search episodes...")}
    </div>
    ${renderReviewSplit(list, renderEpisodeInspector(props))}
  `;
}

// ─── Library sub-tab ──────────────────────────────────────────────────

function renderRunCard(
  run: MemoryPageProps["runs"][number],
  selected: boolean,
  onClick: () => void,
) {
  return html`
    <div
      class="console-card console-card--interactive"
      style="
        padding: var(--console-space-3); margin-bottom: var(--console-space-2); cursor: pointer;
        ${selected ? "border-color: var(--console-accent); box-shadow: 0 0 0 1px var(--console-accent);" : ""}
      "
      @click=${onClick}
    >
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--console-space-1);">
        <span class="console-strong" style="font-size: var(--console-text-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px;">
          ${run.platform || run.id}
        </span>
        ${statusBadge(run.status)}
      </div>
      <div class="console-muted" style="font-size: var(--console-text-2xs);">${fmtTs(run.started_at)}</div>
      <div class="console-faint" style="font-size: var(--console-text-2xs); margin-top: var(--console-space-1);">
        ${plural(run.total_episodes ?? 0, "episode")}
        ${run.facts_created ? html` · ${plural(run.facts_created, "fact")}` : nothing}
      </div>
    </div>
  `;
}

function renderEpisodeRow(
  ep: MemoryPageProps["episodes"][number],
  selected: boolean,
  onClick: () => void,
) {
  return html`
    <div
      class="console-card console-card--interactive"
      style="
        padding: var(--console-space-2) var(--console-space-3); margin-bottom: var(--console-space-1); cursor: pointer;
        ${selected ? "border-color: var(--console-accent); box-shadow: 0 0 0 1px var(--console-accent);" : ""}
      "
      @click=${onClick}
    >
      <div style="display: flex; align-items: center; justify-content: space-between; gap: var(--console-space-2);">
        <div class="console-strong" style="font-size: var(--console-text-xs); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${ep.thread_id || ep.id}
        </div>
        ${statusBadge(ep.status)}
      </div>
      <div style="display: flex; gap: var(--console-space-3); margin-top: var(--console-space-1);">
        ${ep.event_count != null
          ? html`<span class="console-faint" style="font-size: var(--console-text-2xs);">${plural(ep.event_count, "record")}</span>`
          : nothing}
        ${ep.facts_created != null && ep.facts_created > 0
          ? html`<span class="console-faint" style="font-size: var(--console-text-2xs);">${plural(ep.facts_created, "fact")}</span>`
          : nothing}
        ${ep.started_at != null
          ? html`<span class="console-faint" style="font-size: var(--console-text-2xs);">${fmtTs(ep.started_at)}</span>`
          : nothing}
      </div>
    </div>
  `;
}

function renderObservationCard(
  obs: MemoryReviewObservation,
  onSelect: (id: string) => void,
) {
  const text = obs.output_text || "Observation output is empty.";
  return html`
    <div
      class="console-card console-card--interactive"
      style="padding: var(--console-space-3); margin-bottom: var(--console-space-2); cursor: pointer;"
      @click=${() => onSelect(obs.id)}
    >
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--console-space-2);">
        <div class="console-muted" style="font-size: var(--console-text-sm); flex: 1; line-height: 1.45;">${text}</div>
        ${statusBadge(obs.status)}
      </div>
      <div class="console-faint" style="font-size: var(--console-text-2xs); margin-top: var(--console-space-2);">
        ${obs.completed_at ? `Completed ${fmtTs(obs.completed_at)}` : `Created ${fmtTs(obs.created_at)}`}
      </div>
    </div>
  `;
}

function renderFactCard(
  fact: MemoryReviewFact,
  onSelect: (id: string) => void,
) {
  return html`
    <div
      class="console-card console-card--interactive"
      style="padding: var(--console-space-3); margin-bottom: var(--console-space-2); cursor: pointer;"
      @click=${() => onSelect(fact.id)}
    >
      <div style="display: flex; justify-content: space-between; align-items: center; gap: var(--console-space-2);">
        <div style="flex: 1;">
          <div class="console-strong" style="font-size: var(--console-text-sm); line-height: 1.45;">
            ${fact.text || "Fact text is empty."}
          </div>
          <div class="console-faint" style="font-size: var(--console-text-2xs); margin-top: var(--console-space-1);">
            ${fact.is_consolidated ? "Consolidated" : "Retained"} · as of ${fmtDate(fact.as_of)}
            ${fact.source_event_id ? html` · source ${compactId(fact.source_event_id)}` : nothing}
          </div>
        </div>
        ${fact.is_consolidated
          ? renderTextChip("consolidated", "success")
          : renderTextChip("retained", "neutral")}
      </div>
    </div>
  `;
}

function renderTimelineEvent(
  event: MemoryReviewTimelineEvent,
  onOpenNativeRecord?: (recordId: string) => void,
) {
  const senderLabel = event.sender?.label ?? event.sender_id;
  const senderContact = event.sender?.contact_id;
  const threadContact = event.thread_contact;
  const participants = event.participants ?? [];
  const hasText = Boolean((event.content ?? "").trim());
  const links = event.links ?? [];
  const previewAttachmentIds = new Set(
    links.flatMap((link) =>
      (link.preview_attachment_ids ?? [])
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean),
    ),
  );
  const standaloneAttachments = event.attachments.filter(
    (attachment) => !previewAttachmentIds.has(attachment.id),
  );
  return html`
    <div class="console-card" style="padding: var(--console-space-3); margin-bottom: var(--console-space-2);">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: var(--console-space-3); margin-bottom: var(--console-space-2);">
        <div>
          <div class="console-strong" style="font-size: var(--console-text-xs);">
            ${senderLabel}${senderContact && senderContact !== senderLabel ? html`<span class="console-faint"> · ${senderContact}</span>` : nothing}
          </div>
          ${threadContact
            ? html`
                <div class="console-faint" style="font-size: var(--console-text-2xs); margin-top: 2px;">
                  Conversation: ${threadContact.label}${threadContact.contact_id ? ` · ${threadContact.contact_id}` : ""}
                </div>
              `
            : nothing}
        </div>
        <div style="display: flex; align-items: center; gap: var(--console-space-2);">
          ${canOpenNativeTimelineEvent(event) && onOpenNativeRecord
            ? html`
                <button
                  class="console-btn console-btn--secondary"
                  style="padding: 5px 8px; font-size: var(--console-text-2xs);"
                  title="Open this source record in Messages"
                  @click=${(clickEvent: Event) => {
                    clickEvent.stopPropagation();
                    onOpenNativeRecord(event.event_id);
                  }}
                >
                  ${icons.messageSquare}
                  Open in Messages
                </button>
              `
            : nothing}
          <div class="console-faint" style="font-size: var(--console-text-2xs);">${fmtTs(event.timestamp)}</div>
        </div>
      </div>
      <div class="console-muted" style="font-size: var(--console-text-sm); line-height: 1.45;">
        ${hasText ? shortText(event.content, 520) : "Attachment-only record"}
      </div>
      ${links.length > 0
        ? html`${links.map((link) => renderLinkCard(link, event.attachments))}`
        : nothing}
      ${standaloneAttachments.length > 0
        ? html`${standaloneAttachments.map(renderAttachmentCard)}`
        : nothing}
      ${participants.length > 0
        ? html`
            <div style="display: flex; flex-wrap: wrap; gap: var(--console-space-1); margin-top: var(--console-space-2);">
              ${participants.map(renderParticipantChip)}
            </div>
          `
        : nothing}
    </div>
  `;
}

function renderEntityOutput(entity: MemoryReviewEpisodeOutputs["entities"][number]) {
  return html`
    <div class="console-card" style="padding: var(--console-space-3);">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: var(--console-space-2);">
        <div>
          <div class="console-strong" style="font-size: var(--console-text-sm);">${entity.name || "Unnamed entity"}</div>
          <div class="console-faint" style="font-size: var(--console-text-2xs); margin-top: var(--console-space-1);">
            ${entity.normalized || entity.type || "entity"}
          </div>
        </div>
        <div style="display: flex; gap: var(--console-space-1);">
          ${entity.is_user ? renderTextChip("user", "success") : nothing}
          ${entity.type ? renderTextChip(entity.type, "neutral") : nothing}
        </div>
      </div>
    </div>
  `;
}

function renderMemoryJobDiagnostics(job: MemoryReviewJobOutput) {
  const outputStatus = job.output_status ?? job.status;
  const hasExcerpt = Boolean(job.raw_output_excerpt?.trim());
  return html`
    <div class="console-card" style="padding: var(--console-space-3);">
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: var(--console-space-3);">
        <div>
          <div class="console-strong" style="font-size: var(--console-text-sm);">
            ${formatJobType(job.type_id)}
          </div>
          <div class="console-faint" style="font-size: var(--console-text-2xs); margin-top: var(--console-space-1);">
            ${job.model ?? "model not recorded"} · completed ${job.completed_at_iso ? fmtTs(job.completed_at) : "not completed"}
          </div>
        </div>
        <div style="display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--console-space-1);">
          ${renderTextChip(job.status, jobStatusTone(job.status))}
          ${outputStatus && outputStatus !== job.status
            ? renderTextChip(outputStatus, jobStatusTone(outputStatus))
            : nothing}
        </div>
      </div>

      <div style="display: flex; flex-wrap: wrap; gap: var(--console-space-3); margin-top: var(--console-space-2);">
        ${renderJobCount("facts", job.facts_written)}
        ${renderJobCount("entities", job.entities_created)}
        ${renderJobCount("entity links", job.entity_links_written)}
        ${renderJobCount("merge proposals", job.merge_proposals_written)}
      </div>

      ${job.error_message || job.blocked_reason
        ? html`
            <div class="console-card" style="padding: var(--console-space-2); margin-top: var(--console-space-3); border-color: color-mix(in srgb, var(--console-danger) 24%, var(--console-border));">
              <div class="console-section-label" style="font-size: var(--console-text-2xs); margin-bottom: var(--console-space-1);">
                Runtime issue
              </div>
              <div class="console-muted" style="font-size: var(--console-text-xs); line-height: 1.45;">
                ${job.error_message ?? job.blocked_reason}
              </div>
            </div>
          `
        : nothing}

      ${job.review_gaps.length > 0
        ? html`
            <div style="margin-top: var(--console-space-3);">
              <div class="console-section-label" style="font-size: var(--console-text-2xs); margin-bottom: var(--console-space-1);">
                Review gaps
              </div>
              <ul style="margin: 0; padding-left: var(--console-space-4);">
                ${job.review_gaps.map(
                  (gap) => html`
                    <li class="console-muted" style="font-size: var(--console-text-xs); line-height: 1.45; margin-bottom: var(--console-space-1);">
                      ${gap}
                    </li>
                  `,
                )}
              </ul>
            </div>
          `
        : nothing}

      ${job.matched_existing_facts.length > 0
        ? html`
            <div style="margin-top: var(--console-space-3);">
              <div class="console-section-label" style="font-size: var(--console-text-2xs); margin-bottom: var(--console-space-1);">
                Matched existing facts
              </div>
              ${job.matched_existing_facts.map(
                (fact) => html`
                  <div class="console-card" style="padding: var(--console-space-2); margin-bottom: var(--console-space-1);">
                    <div class="console-muted" style="font-size: var(--console-text-xs); line-height: 1.45;">
                      ${fact}
                    </div>
                  </div>
                `,
              )}
            </div>
          `
        : nothing}

      ${hasExcerpt
        ? html`
            <details style="margin-top: var(--console-space-3);">
              <summary class="console-faint" style="font-size: var(--console-text-2xs); cursor: pointer;">
                Raw output excerpt
              </summary>
              <pre style="white-space: pre-wrap; overflow-wrap: anywhere; margin: var(--console-space-2) 0 0; font-size: var(--console-text-2xs); color: var(--console-text-muted);">${job.raw_output_excerpt}</pre>
            </details>
          `
        : nothing}
    </div>
  `;
}

function renderEpisodeDiagnostics(outputs: MemoryReviewEpisodeOutputs | null) {
  const jobs = outputs?.job_outputs ?? [];
  const reviewGaps = outputs?.review_gaps ?? [];
  const matchedFacts = outputs?.matched_existing_facts ?? [];
  if (jobs.length === 0 && reviewGaps.length === 0 && matchedFacts.length === 0) {
    return nothing;
  }
  return html`
    <div class="console-section-label" style="margin-bottom: var(--console-space-2);">
      Agent Diagnostics
      <span class="console-faint" style="font-weight: 400; margin-left: var(--console-space-1);">(${jobs.length})</span>
    </div>
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--console-space-2); margin-bottom: var(--console-space-4);">
      ${jobs.length > 0
        ? jobs.map(renderMemoryJobDiagnostics)
        : html`
            <div class="console-card" style="padding: var(--console-space-3);">
              <div class="console-muted" style="font-size: var(--console-text-xs); line-height: 1.45;">
                No memory job rows were found for this episode, but diagnostics were returned.
              </div>
            </div>
          `}
    </div>
  `;
}

function renderEpisodeInspector(props: MemoryPageProps) {
  if (props.inspectorLoading) return renderSpinner();

  if (!props.selectedEpisodeId || !props.episodeDetail) {
    return html`
      <div class="console-card">
        <div class="console-empty">
          <div class="console-empty-icon">${icons.brain}</div>
          <div class="console-empty-title">Select an episode to inspect</div>
          <div class="console-empty-description">
            Choose a run and episode from the left panel to view its extracted observations and facts.
          </div>
        </div>
      </div>
    `;
  }

  const detail = props.episodeDetail;
  const episode = detail.episode;
  const timeline = detail.timeline ?? [];
  const outputs = props.episodeOutputs;
  const observations = outputs?.observations ?? [];
  const facts = outputs?.facts ?? [];
  const entities = outputs?.entities ?? [];
  const linkedFactCount = outputs?.fact_entities.length ?? 0;
  const unresolvedEntityLinkCount = outputs?.unresolved_fact_entities?.length ?? 0;
  const linkedObservationCount = outputs?.observation_facts.length ?? 0;

  return html`
    <div>
      <div class="console-card" style="padding: var(--console-space-4); margin-bottom: var(--console-space-4);">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: var(--console-space-4); margin-bottom: var(--console-space-4);">
          <div>
            <div class="console-section-label" style="margin-bottom: var(--console-space-2);">Selected Episode</div>
            <div class="console-strong" style="font-size: var(--console-text-md);">${episode?.thread_id || props.selectedEpisodeId}</div>
            <div class="console-muted" style="font-size: var(--console-text-xs); margin-top: var(--console-space-1);">
              ${episode?.platform || "unknown platform"} · ${episode?.status || "unknown status"}
            </div>
          </div>
          ${episode?.status ? statusBadge(episode.status) : nothing}
        </div>

        <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--console-space-3);">
          ${renderMetric("Episode Records", episode?.event_count ?? timeline.length)}
          ${renderMetric(
            "Retained Facts",
            facts.length,
            unresolvedEntityLinkCount > 0
              ? `${linkedFactCount} entity links · ${unresolvedEntityLinkCount} unresolved`
              : `${linkedFactCount} entity links`,
          )}
          ${renderMetric("Entities", entities.length)}
          ${renderMetric("Consolidations", observations.length, `${linkedObservationCount} fact links`)}
        </div>
      </div>

      ${renderEpisodeDiagnostics(outputs)}

      <div class="console-section-label" style="margin-bottom: var(--console-space-2);">
        Episode Timeline
        <span class="console-faint" style="font-weight: 400; margin-left: var(--console-space-1);">(${timeline.length})</span>
      </div>
      ${timeline.length === 0
        ? html`<div class="console-muted" style="font-size: var(--console-text-xs); padding: var(--console-space-3);">No episode records found.</div>`
        : html`
            ${timeline.map((event) => renderTimelineEvent(event, props.onOpenNativeRecord))}
          `}

      <div class="console-section-label" style="margin-bottom: var(--console-space-2);">
        Retained Facts
        <span class="console-faint" style="font-weight: 400; margin-left: var(--console-space-1);">(${facts.length})</span>
      </div>
      ${facts.length === 0
        ? html`<div class="console-muted" style="font-size: var(--console-text-xs); padding: var(--console-space-3);">No retained facts for this episode yet.</div>`
        : facts.map((f) => renderFactCard(f, props.onFactSelect))}

      <div class="console-section-label" style="margin-bottom: var(--console-space-2); margin-top: var(--console-space-4);">
        Consolidated Observations
        <span class="console-faint" style="font-weight: 400; margin-left: var(--console-space-1);">(${observations.length})</span>
      </div>
      ${observations.length === 0
        ? html`<div class="console-muted" style="font-size: var(--console-text-xs); padding: var(--console-space-3);">No consolidated observations for this episode yet.</div>`
        : observations.map((o) => renderObservationCard(o, props.onObservationSelect))}

      <div class="console-section-label" style="margin-bottom: var(--console-space-2); margin-top: var(--console-space-4);">
        Linked Entities
        <span class="console-faint" style="font-weight: 400; margin-left: var(--console-space-1);">(${entities.length})</span>
      </div>
      ${entities.length === 0
        ? html`<div class="console-muted" style="font-size: var(--console-text-xs); padding: var(--console-space-3);">No memory entities linked to this episode yet.</div>`
        : html`
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--console-space-2);">
              ${entities.map(renderEntityOutput)}
            </div>
          `}

    </div>
  `;
}

function renderLibraryTab(props: MemoryPageProps) {
  return html`
    <div style="display: grid; grid-template-columns: 280px 1fr; gap: 16px; min-height: 400px;">
      <!-- Left panel: runs + episodes -->
      <div style="overflow-y: auto; max-height: 70vh;">
        <div class="console-section-label" style="margin-bottom: var(--console-space-2);">
          Runs
          <span class="console-faint" style="font-weight: 400; margin-left: var(--console-space-1);">(${props.runs.length})</span>
        </div>
        ${props.runs.length === 0
          ? html`<div class="console-muted" style="font-size: var(--console-text-xs); padding: var(--console-space-3);">No memory runs found.</div>`
          : props.runs.map((r) =>
              renderRunCard(r, r.id === props.selectedRunId, () => props.onRunSelect(r.id)),
            )}

        ${props.selectedRunId != null
          ? html`
              <div class="console-section-label" style="margin-top: var(--console-space-4); margin-bottom: var(--console-space-2);">
                Episodes
                ${props.episodesLoading
                  ? html`<span class="console-faint" style="font-weight: 400; margin-left: var(--console-space-1);">loading…</span>`
                  : html`<span class="console-faint" style="font-weight: 400; margin-left: var(--console-space-1);">(${props.episodes.length})</span>`}
              </div>
              ${props.episodesLoading
                ? renderSpinner()
                : props.episodes.length === 0
                  ? html`<div class="console-muted" style="font-size: var(--console-text-xs); padding: var(--console-space-3);">No episodes in this run.</div>`
                  : props.episodes.map((ep) =>
                      renderEpisodeRow(
                        ep,
                        ep.id === props.selectedEpisodeId,
                        () => props.onEpisodeSelect(ep.id),
                      ),
                    )}
            `
          : nothing}
      </div>

      <!-- Right panel: episode inspector -->
      <div style="overflow-y: auto; max-height: 70vh;">
        ${renderEpisodeInspector(props)}
      </div>
    </div>
  `;
}

// ─── Search sub-tab ───────────────────────────────────────────────────

function renderSearchTab(props: MemoryPageProps) {
  const types: { key: MemoryPageProps["searchType"]; label: string }[] = [
    { key: "all", label: "All" },
    { key: "entities", label: "Entities" },
    { key: "facts", label: "Facts" },
    { key: "observations", label: "Observations" },
  ];

  return html`
    <div>
      <!-- Search bar -->
      <div style="display: flex; gap: var(--console-space-2); margin-bottom: var(--console-space-4);">
        <select
          class="console-search-input"
          style="width: 150px; flex-shrink: 0;"
          .value=${props.searchType}
          @change=${(e: Event) =>
            props.onSearchTypeChange(
              (e.target as HTMLSelectElement).value as MemoryPageProps["searchType"],
            )}
        >
          ${types.map(
            (t) => html`<option value=${t.key} ?selected=${props.searchType === t.key}>${t.label}</option>`,
          )}
        </select>
        <div class="console-search-wrap" style="flex: 1;">
          ${icons.search}
          <input
            class="console-search-input"
            type="text"
            placeholder="Search across the memory graph…"
            .value=${props.searchQuery}
            @input=${(e: Event) =>
              props.onSearchQueryChange((e.target as HTMLInputElement).value)}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter") props.onSearch();
            }}
          />
        </div>
        <button class="console-btn console-btn--primary" @click=${props.onSearch}>Search</button>
      </div>

      <!-- Results -->
      ${props.searchLoading
        ? renderSpinner()
        : props.searchResults.length === 0
          ? html`
              <div class="console-card">
                <div class="console-empty">
                  <div class="console-empty-icon">${icons.search}</div>
                  <div class="console-empty-title">Search the memory graph</div>
                  <div class="console-empty-description">
                    Search across entities, facts, observations, and semantic content.
                  </div>
                </div>
              </div>
            `
          : html`
              <div style="display: flex; flex-direction: column; gap: var(--console-space-2);">
                ${props.searchResults.map((r) => renderSearchResult(r, props))}
              </div>
            `}
    </div>
  `;
}

function renderSearchResult(
  result: MemoryPageProps["searchResults"][number],
  props: MemoryPageProps,
) {
  const handleClick = () => {
    if (result.kind === "entity" || result.entity_id) {
      props.onEntitySelect(result.entity_id ?? result.id);
    } else if (result.kind === "fact") {
      props.onFactSelect(result.id);
    } else if (result.kind === "observation") {
      props.onObservationSelect(result.id);
    }
  };

  return html`
    <div
      class="console-card console-card--interactive"
      style="padding: var(--console-space-3); cursor: pointer;"
      @click=${handleClick}
    >
      <div style="display: flex; align-items: center; gap: var(--console-space-2); margin-bottom: var(--console-space-1);">
        ${kindBadge(result.kind)}
        ${result.score != null
          ? html`<span class="console-faint" style="font-size: var(--console-text-2xs); margin-left: auto;">score: ${result.score.toFixed(3)}</span>`
          : nothing}
      </div>
      <div class="console-muted" style="font-size: var(--console-text-sm);">${result.text}</div>
    </div>
  `;
}

function renderQualitySource(item: MemoryReviewQualityItemsResult["items"][number]) {
  const sourceLabels: string[] = [];
  if (item.episode_id) {
    sourceLabels.push(`Episode ${compactId(item.episode_id)}`);
  }
  if (item.source_event_id) {
    sourceLabels.push(`Record ${compactId(item.source_event_id)}`);
  }
  if (item.record_type === "entity" && item.linked_facts != null) {
    sourceLabels.push(plural(item.linked_facts, "linked fact"));
  }
  if (sourceLabels.length === 0) {
    sourceLabels.push(item.status || "No source");
  }
  return html`
    <div style="display: flex; flex-direction: column; gap: var(--console-space-1);">
      ${sourceLabels.map(
        (label) => html`
          <span class="console-faint" style="font-size: var(--console-text-xs);">${label}</span>
        `,
      )}
    </div>
  `;
}

// ─── Quality sub-tab ──────────────────────────────────────────────────

function renderQualityTab(props: MemoryPageProps) {
  const summary = props.qualitySummary;
  const buckets: {
    key: MemoryPageProps["qualityBucket"];
    label: string;
    description: string;
    count: number;
  }[] = summary
    ? Object.values(summary.buckets)
    : [];
  const qualityItems = props.qualityItems?.items ?? [];
  const qualityTotal = props.qualityItems?.total ?? 0;
  const qualityLimit = props.qualityItems?.limit ?? 100;
  const qualityOffset = props.qualityItems?.offset ?? 0;
  const hasPrev = qualityOffset > 0;
  const nextOffset = qualityOffset + qualityLimit;
  const hasNext = nextOffset < qualityTotal;

  return html`
    <div>
      <!-- Summary cards -->
      ${props.qualityLoading && !summary
        ? renderSpinner()
        : !summary
          ? html`
              <div class="console-card" style="margin-bottom: var(--console-space-5);">
                <div class="console-empty">
                  <div class="console-empty-icon">${icons.barChart}</div>
                  <div class="console-empty-title">No quality data</div>
                  <div class="console-empty-description">
                    Quality triage data will appear here once memory review has completed.
                  </div>
                </div>
              </div>
            `
          : html`
              <div class="console-card" style="padding: var(--console-space-4); margin-bottom: var(--console-space-4);">
                <div style="display: flex; align-items: end; justify-content: space-between; gap: var(--console-space-4); flex-wrap: wrap;">
                  <div>
                    <div class="console-label">Scope</div>
                    <div class="console-muted" style="font-size: var(--console-text-xs);">
                      ${summary.scope.mode === "run"
                        ? summary.scope.run_id
                          ? `run ${summary.scope.run_id}`
                          : "run"
                        : "global"}
                    </div>
                  </div>
                  <label class="console-field" style="min-width: 160px;">
                    <span class="console-label">View</span>
                    <select
                      class="console-select"
                      .value=${props.qualityScope}
                      @change=${(event: Event) =>
                        props.onQualityScopeChange(
                          (event.target as HTMLSelectElement).value as MemoryPageProps["qualityScope"],
                        )}
                    >
                      <option value="run">Run</option>
                      <option value="global">Global</option>
                    </select>
                  </label>
                </div>
              </div>

              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--console-space-3); margin-bottom: var(--console-space-5);">
                ${buckets.map(
                  (bucket) => html`
                    <div
                      class="console-card console-card--interactive"
                      style="
                        padding: var(--console-space-4); cursor: pointer;
                        ${props.qualityBucket === bucket.key ? `border-color: var(--console-accent); box-shadow: 0 0 0 1px var(--console-accent);` : ""}
                      "
                      title=${bucket.description}
                      @click=${() => props.onQualityBucketSelect(bucket.key)}
                    >
                      <div style="display: flex; align-items: center; justify-content: space-between; gap: var(--console-space-3);">
                        <div class="console-strong" style="font-size: var(--console-text-sm);">${bucket.label}</div>
                        <span class="console-badge console-badge--neutral">${bucket.count}</span>
                      </div>
                      <div class="console-muted" style="font-size: var(--console-text-xs); margin-top: var(--console-space-2); line-height: 1.4;">
                        ${bucket.description}
                      </div>
                    </div>
                  `,
                )}
              </div>
            `}

      <!-- Quality items table -->
      ${props.qualityItemsLoading
        ? renderSpinner()
        : qualityItems.length === 0
          ? html`
              <div class="console-card">
                <div class="console-empty">
                  <div class="console-empty-icon">${icons.barChart}</div>
                  <div class="console-empty-title">No quality items found</div>
                  <div class="console-empty-description">
                    This bucket is currently clear for the selected scope.
                  </div>
                </div>
              </div>
            `
          : html`
              <div style="display: flex; align-items: center; justify-content: space-between; gap: var(--console-space-3); margin-bottom: var(--console-space-3);">
                <div class="console-muted" style="font-size: var(--console-text-xs);">
                  ${qualityTotal} total item${qualityTotal === 1 ? "" : "s"}
                </div>
                <div style="display: flex; gap: var(--console-space-2);">
                  <button
                    class="console-btn console-btn--secondary"
                    ?disabled=${!hasPrev}
                    @click=${() => props.onQualityPage(Math.max(0, qualityOffset - qualityLimit))}
                  >
                    Prev
                  </button>
                  <button
                    class="console-btn console-btn--secondary"
                    ?disabled=${!hasNext}
                    @click=${() => props.onQualityPage(nextOffset)}
                  >
                    Next
                  </button>
                </div>
              </div>
              <div class="console-card" style="padding: 0; overflow: hidden;">
                <table class="console-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Content</th>
                      <th>Status</th>
                      <th>Source</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${qualityItems.map(
                      (item) => html`
                        <tr
                          style="${item.record_type !== "episode" ? "cursor: pointer;" : ""}"
                          @click=${() => {
                            if (item.record_type === "entity" && item.entity_id) props.onEntitySelect(item.entity_id);
                            else if (item.record_type === "fact" && item.fact_id) props.onFactSelect(item.fact_id);
                            else if (item.record_type === "observation" && item.observation_id) props.onObservationSelect(item.observation_id);
                          }}
                        >
                          <td>${kindBadge(item.record_type)}</td>
                          <td>
                            <span class="console-strong" style="display: block; font-size: var(--console-text-sm);">
                              ${item.primary_text}
                            </span>
                            ${item.secondary_text
                              ? html`
                                  <span class="console-faint" style="display: block; margin-top: var(--console-space-1); font-size: var(--console-text-xs);">
                                    ${item.secondary_text}
                                  </span>
                                `
                              : nothing}
                          </td>
                          <td>
                            <span class="console-faint" style="font-size: var(--console-text-xs);">
                              ${item.status || "n/a"}
                            </span>
                          </td>
                          <td>${renderQualitySource(item)}</td>
                          <td>
                            <span class="console-faint" style="font-size: var(--console-text-xs);">
                              ${item.timestamp_iso || item.ingested_at_iso || "—"}
                            </span>
                          </td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
              </div>
            `}
    </div>
  `;
}

// ─── Detail panel ─────────────────────────────────────────────────────

function renderDetailPanel(props: MemoryPageProps) {
  if (!props.detailKind) return nothing;

  if (props.detailLoading) {
    return html`
      <div class="console-card">
        ${renderSpinner()}
      </div>
    `;
  }

  if (props.detailKind === "entity" && props.detailEntity) {
    return renderEntityDetail(props.detailEntity, props);
  }
  if (props.detailKind === "fact" && props.detailFact) {
    return renderFactDetail(props.detailFact, props);
  }
  if (props.detailKind === "observation" && props.detailObservation) {
    return renderObservationDetail(props.detailObservation, props);
  }
  return nothing;
}

function renderEntityDetail(
  entity: NonNullable<MemoryPageProps["detailEntity"]>,
  props: MemoryPageProps,
) {
  const record = entity.entity;
  const facts = entity.linked_facts ?? [];
  const observations = entity.linked_observations ?? [];

  return html`
    <div class="console-card" style="position: relative;">
      <button
        class="console-icon-btn"
        style="position: absolute; top: var(--console-space-2); right: var(--console-space-2);"
        @click=${props.onDetailClear}
        title="Close"
      >
        ${icons.x}
      </button>

      <div style="display: flex; align-items: center; gap: var(--console-space-2); margin-bottom: var(--console-space-3);">
        <span class="console-badge console-badge--neutral">Entity</span>
        <span class="console-strong" style="font-size: var(--console-text-md);">${record.name || "Unnamed entity"}</span>
        ${record.is_user ? renderTextChip("user", "success") : nothing}
        ${record.type ? renderTextChip(record.type, "neutral") : nothing}
      </div>

      ${facts.length > 0
        ? html`
            <div class="console-section-label" style="margin-bottom: var(--console-space-2);">
              Linked Facts
              <span class="console-faint" style="font-weight: 400;">(${facts.length})</span>
            </div>
            ${facts.map(
              (f) => html`
                <div
                  class="console-card console-card--interactive"
                  style="padding: var(--console-space-2) var(--console-space-3); margin-bottom: var(--console-space-1); cursor: pointer;"
                  @click=${() => props.onFactSelect(f.id)}
                >
                  <span class="console-muted" style="font-size: var(--console-text-sm);">${f.text}</span>
                </div>
              `,
            )}
          `
        : html`<div class="console-faint" style="font-size: var(--console-text-xs); margin-bottom: var(--console-space-3);">No linked facts.</div>`}

      ${observations.length > 0
        ? html`
            <div class="console-section-label" style="margin-top: var(--console-space-3); margin-bottom: var(--console-space-2);">
              Linked Observations
              <span class="console-faint" style="font-weight: 400;">(${observations.length})</span>
            </div>
            ${observations.map(
              (o) => html`
                <div
                  class="console-card console-card--interactive"
                  style="padding: var(--console-space-2) var(--console-space-3); margin-bottom: var(--console-space-1); cursor: pointer;"
                  @click=${() => props.onObservationSelect(o.id)}
                >
                  <span class="console-muted" style="font-size: var(--console-text-sm);">${o.output_text || "Observation output is empty."}</span>
                </div>
              `,
            )}
          `
        : html`<div class="console-faint" style="font-size: var(--console-text-xs);">No linked observations.</div>`}
    </div>
  `;
}

function renderFactDetail(
  fact: NonNullable<MemoryPageProps["detailFact"]>,
  props: MemoryPageProps,
) {
  const record = fact.fact;
  const sourceParticipants = fact.source_event?.participants ?? [];
  const unresolvedLinks = fact.unresolved_fact_links ?? [];
  const openSourceEpisode = () => {
    const episodeId = record.source_episode_id ?? fact.source_episode?.id;
    if (!episodeId) return;
    props.onSubTabChange("episodes");
    props.onEpisodeSelect(episodeId);
  };
  return html`
    <div class="console-card" style="position: relative;">
      <button
        class="console-icon-btn"
        style="position: absolute; top: var(--console-space-2); right: var(--console-space-2);"
        @click=${props.onDetailClear}
        title="Close"
      >
        ${icons.x}
      </button>

      <div style="display: flex; align-items: center; gap: var(--console-space-2); margin-bottom: var(--console-space-3);">
        <span class="console-badge console-badge--success">Fact</span>
        ${record.is_consolidated ? renderTextChip("consolidated", "success") : renderTextChip("retained", "neutral")}
      </div>

      <div class="console-strong" style="font-size: var(--console-text-md); line-height: 1.45; margin-bottom: var(--console-space-4);">
        ${record.text || "Fact text is empty."}
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--console-space-3); margin-bottom: var(--console-space-4);">
        ${renderMetric("Linked Entities", fact.entities.length)}
        ${renderMetric("Source Participants", sourceParticipants.length)}
        ${renderMetric("Source Record", fact.source_event ? "found" : "missing")}
        ${renderMetric("As Of", fmtDate(record.as_of))}
      </div>

      ${fact.entities.length > 0
        ? html`
            <div class="console-section-label" style="margin-bottom: var(--console-space-2);">Entities</div>
            <div style="display: flex; flex-wrap: wrap; gap: var(--console-space-2); margin-bottom: var(--console-space-4);">
              ${fact.entities.map((entity) => renderTextChip(entity.name || "Unnamed entity", entity.is_user ? "success" : "neutral"))}
            </div>
          `
        : nothing}

      ${unresolvedLinks.length > 0
        ? html`
            <div class="console-card" style="padding: var(--console-space-3); margin-bottom: var(--console-space-4); border-color: color-mix(in srgb, var(--console-danger) 24%, var(--console-border));">
              <div class="console-section-label" style="margin-bottom: var(--console-space-2);">Unresolved entity links</div>
              <div class="console-muted" style="font-size: var(--console-text-xs); line-height: 1.45;">
                ${plural(unresolvedLinks.length, "stored entity link")} no longer resolve in the current identity graph.
                This usually means memory was retained against an older identity import and should be regenerated.
              </div>
            </div>
          `
        : nothing}

      ${sourceParticipants.length > 0
        ? html`
            <div class="console-section-label" style="margin-bottom: var(--console-space-2);">Source Participants</div>
            <div style="display: flex; flex-wrap: wrap; gap: var(--console-space-2); margin-bottom: var(--console-space-4);">
              ${sourceParticipants.map(renderParticipantChip)}
            </div>
          `
        : nothing}

      ${fact.source_event
        ? html`
            <div class="console-section-label" style="margin-bottom: var(--console-space-2);">Source Record</div>
            ${renderTimelineEvent(fact.source_event, props.onOpenNativeRecord)}
          `
        : nothing}

      ${fact.observations.length > 0
        ? html`
            <div class="console-section-label" style="margin-top: var(--console-space-4); margin-bottom: var(--console-space-2);">Consolidated Into</div>
            ${fact.observations.map((obs) => renderObservationCard(obs, props.onObservationSelect))}
          `
        : nothing}

      <div class="console-faint" style="font-size: var(--console-text-2xs); margin-top: var(--console-space-3);">
        Source episode ${compactId(record.source_episode_id)}
        ${record.source_episode_id
          ? html`
              <button class="console-link-button" style="margin-left: var(--console-space-2);" @click=${openSourceEpisode}>
                Open episode
              </button>
            `
          : nothing}
      </div>
    </div>
  `;
}

function renderObservationDetail(
  obs: NonNullable<MemoryPageProps["detailObservation"]>,
  props: MemoryPageProps,
) {
  const record = obs.observation;
  const sourceEvents = obs.source_events ?? [];
  const sourceParticipants = Array.from(
    new Map(
      sourceEvents
        .flatMap((event) => event.participants ?? [])
        .map((participant) => [
          participant.entity_id ?? participant.contact_id ?? participant.raw_id ?? participant.label,
          participant,
        ]),
    ).values(),
  );
  const sourceEpisodeId =
    normalizeSourceEpisodeId(obs.supporting_facts.find((fact) => fact.source_episode_id)?.source_episode_id) ??
    normalizeSourceEpisodeId(obs.source_episode?.id) ??
    normalizeSourceEpisodeId(record.episode_id);
  const sourceEpisodeIds = new Set(
    [
      ...obs.supporting_facts.map((fact) => normalizeSourceEpisodeId(fact.source_episode_id)).filter(Boolean),
      normalizeSourceEpisodeId(obs.source_episode?.id),
      normalizeSourceEpisodeId(record.episode_id),
    ].filter(Boolean) as string[],
  );
  const openSourceEpisode = () => {
    if (!sourceEpisodeId) return;
    props.onSubTabChange("episodes");
    props.onEpisodeSelect(sourceEpisodeId);
  };
  return html`
    <div class="console-card" style="position: relative;">
      <button
        class="console-icon-btn"
        style="position: absolute; top: var(--console-space-2); right: var(--console-space-2);"
        @click=${props.onDetailClear}
        title="Close"
      >
        ${icons.x}
      </button>

      <div style="display: flex; align-items: center; gap: var(--console-space-2); margin-bottom: var(--console-space-3);">
        <span class="console-badge console-badge--warning">Observation</span>
        ${statusBadge(record.status)}
      </div>

      <div class="console-strong" style="font-size: var(--console-text-md); line-height: 1.45; margin-bottom: var(--console-space-4);">
        ${record.output_text || "Observation output is empty."}
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--console-space-3); margin-bottom: var(--console-space-4);">
        ${renderMetric("Facts", obs.supporting_facts.length)}
        ${renderMetric("Source Episodes", sourceEpisodeIds.size)}
        ${renderMetric("Supporting Entities", obs.supporting_entities.length)}
      </div>

      ${obs.supporting_entities.length > 0
        ? html`
            <div class="console-section-label" style="margin-bottom: var(--console-space-2);">Supporting Entities</div>
            <div style="display: flex; flex-wrap: wrap; gap: var(--console-space-2); margin-bottom: var(--console-space-4);">
              ${obs.supporting_entities.map((entity) => renderTextChip(entity.name || "Unnamed entity", entity.is_user ? "success" : "neutral"))}
            </div>
          `
        : nothing}

      ${sourceParticipants.length > 0
        ? html`
            <div class="console-section-label" style="margin-bottom: var(--console-space-2);">Source Participants</div>
            <div style="display: flex; flex-wrap: wrap; gap: var(--console-space-2); margin-bottom: var(--console-space-4);">
              ${sourceParticipants.map(renderParticipantChip)}
            </div>
          `
        : nothing}

      ${obs.supporting_facts.length > 0
        ? html`
            <div class="console-section-label" style="margin-bottom: var(--console-space-2);">Supporting Facts</div>
            ${obs.supporting_facts.map((fact) => renderFactCard(fact, props.onFactSelect))}
            ${obs.supporting_facts.length > 1
              ? html`
                  <div class="console-muted" style="font-size: var(--console-text-xs); line-height: 1.45; margin: var(--console-space-2) 0 var(--console-space-4);">
                    These facts were processed by the same consolidation job. No separate consolidation rationale was stored with this observation.
                  </div>
                `
              : nothing}
          `
        : nothing}

      ${sourceEvents.length > 0
        ? html`
            <div class="console-section-label" style="margin-top: var(--console-space-4); margin-bottom: var(--console-space-2);">Source Records</div>
            ${sourceEvents.map((event) => renderTimelineEvent(event, props.onOpenNativeRecord))}
          `
        : nothing}

      <div class="console-faint" style="font-size: var(--console-text-2xs); margin-top: var(--console-space-3);">
        Source episode ${compactId(sourceEpisodeId)}
        ${sourceEpisodeId
          ? html`
              <button class="console-link-button" style="margin-left: var(--console-space-2);" @click=${openSourceEpisode}>
                Open episode
              </button>
            `
          : nothing}
      </div>
    </div>
  `;
}

// ─── Main render ──────────────────────────────────────────────────────

export function renderMemoryPage(props: MemoryPageProps) {
  const content =
    props.subTab === "observations"
      ? (props.loading ? renderSpinner() : renderObservationsTab(props))
      : props.subTab === "facts"
        ? (props.loading ? renderSpinner() : renderFactsTab(props))
        : props.subTab === "episodes"
          ? (props.loading ? renderSpinner() : renderEpisodesTab(props))
          : nothing;
  return html`
    <div class="console-page-header">
      <div class="console-page-header-row">
        <div>
          <h1 class="console-page-title">Memory</h1>
          <p class="console-page-subtitle">
            Review observations, retained facts, source episodes, and the evidence chain behind memory.
          </p>
        </div>
        <div class="console-row">
          <button class="console-btn console-btn--secondary" @click=${props.onRefresh}>
            ${icons.loader}
            Refresh
          </button>
        </div>
      </div>
    </div>

    ${renderSubTabs(props.subTab, props.onSubTabChange)}

    ${props.error
      ? html`
          <div class="console-card" style="border-color: var(--console-red, #ef4444); margin-bottom: var(--console-space-4);">
            <div style="display: flex; align-items: center; gap: var(--console-space-2);">
              <span class="console-badge console-badge--danger">Error</span>
              <span class="console-muted" style="font-size: var(--console-text-sm);">${props.error}</span>
            </div>
          </div>
        `
      : nothing}

    ${content}
  `;
}
