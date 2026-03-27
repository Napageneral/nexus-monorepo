import { html, nothing } from "lit";
import type { TemplateResult } from "lit";
import { icons } from "../../ui/icons.ts";
import { renderPlatformIcon } from "../components/platform-icons.ts";

// ─── Types ──────────────────────────────────────────────────────────

export type RecordsSubTab = "browse" | "channels" | "search";

export type RecordsPageProps = {
  subTab: RecordsSubTab;
  onSubTabChange: (tab: string) => void;
  // Browse
  records: Array<{
    id: string;
    platform: string;
    channel: string;
    recordId: string;
    type: string;
    status: string;
    preview: string;
    payload?: unknown;
    timestamp: number;
  }>;
  recordsLoading: boolean;
  recordsTotal: number;
  recordsOffset: number;
  recordsLimit: number;
  platformFilter: string;
  statusFilter: string;
  onPlatformFilterChange: (platform: string) => void;
  onStatusFilterChange: (status: string) => void;
  onRecordsPage: (offset: number) => void;
  expandedRecordId: string | null;
  onRecordExpand: (id: string | null) => void;
  // Channels
  channels: Array<{
    id: string;
    platform: string;
    name: string;
    recordCount: number;
    lastActivity: number;
    status: string;
  }>;
  channelsLoading: boolean;
  onChannelSelect: (channelId: string) => void;
  // Search
  searchQuery: string;
  searchType: string;
  searchResults: Array<{
    id: string;
    platform: string;
    channel: string;
    recordId: string;
    type: string;
    preview: string;
    timestamp: number;
    score?: number;
  }> | null;
  searchLoading: boolean;
  onSearchQueryChange: (query: string) => void;
  onSearchTypeChange: (type: string) => void;
  onSearch: () => void;
  // General
  onRefresh: () => void;
};

// ─── Helpers ────────────────────────────────────────────────────────

function truncate(str: string, len: number): string {
  if (!str) return "--";
  return str.length > len ? str.slice(0, len) + "\u2026" : str;
}

function formatTimestamp(ts: number): string {
  if (!ts) return "--";
  const now = Date.now();
  const diff = now - ts;
  if (diff < 0) return "just now";
  if (diff < 60_000) return `${Math.max(1, Math.floor(diff / 1000))}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "ingested") return html`<span class="v2-badge v2-badge--success">ingested</span>`;
  if (s === "skipped") return html`<span class="v2-badge v2-badge--neutral">skipped</span>`;
  if (s === "failed") return html`<span class="v2-badge v2-badge--danger">failed</span>`;
  return html`<span class="v2-badge v2-badge--neutral">${status}</span>`;
}

function channelStatusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "active") return html`<span class="v2-badge v2-badge--success">active</span>`;
  return html`<span class="v2-badge v2-badge--neutral">idle</span>`;
}

const PLATFORMS = ["All", "slack", "gmail", "github", "jira", "notion", "stripe", "salesforce", "hubspot", "asana"];
const STATUSES = ["All", "ingested", "skipped", "failed"];
const SEARCH_TYPES = ["All", "Messages", "Emails", "Commits", "Issues"];

const selectStyle = `
  background: var(--v2-bg-nav-pill, rgba(255,255,255,0.06));
  border: 1px solid var(--v2-border, rgba(255,255,255,0.08));
  border-radius: 6px;
  color: var(--v2-text, #e5e5e5);
  padding: 6px 10px;
  font-size: var(--v2-text-sm, 13px);
  outline: none;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
`;

// ─── Reusable table renderer ────────────────────────────────────────

function renderV2Table(opts: {
  headers: string[];
  rows: TemplateResult[];
  empty: string;
  loading: boolean;
}) {
  if (opts.loading) {
    return html`<div style="padding: var(--v2-space-8); text-align: center;"><span class="v2-muted">Loading\u2026</span></div>`;
  }
  if (opts.rows.length === 0) {
    return html`
      <div style="padding: var(--v2-space-8); text-align: center;">
        <span class="v2-muted">${opts.empty}</span>
      </div>
    `;
  }
  return html`
    <div class="v2-table-wrap">
      <table class="v2-table">
        <thead><tr>${opts.headers.map((h) => html`<th>${h}</th>`)}</tr></thead>
        <tbody>${opts.rows}</tbody>
      </table>
    </div>
  `;
}

// ─── Sub-tab bar ────────────────────────────────────────────────────

const SUB_TABS: { key: RecordsSubTab; label: string }[] = [
  { key: "browse", label: "Browse" },
  { key: "channels", label: "Channels" },
  { key: "search", label: "Search" },
];

function renderSubTabs(active: RecordsSubTab, onChange: (tab: string) => void) {
  return html`
    <div class="v2-detail-tabs">
      ${SUB_TABS.map(
        (t) => html`
          <button
            class="v2-detail-tab ${active === t.key ? "v2-detail-tab--active" : ""}"
            @click=${() => onChange(t.key)}
          >${t.label}</button>
        `,
      )}
    </div>
  `;
}

// ─── Browse sub-tab ─────────────────────────────────────────────────

function renderFilterBar(props: RecordsPageProps) {
  return html`
    <div style="display:flex; gap:8px; align-items:center; margin-bottom: var(--v2-space-4); flex-wrap: wrap;">
      <select
        style="${selectStyle}"
        .value=${props.platformFilter}
        @change=${(e: Event) => props.onPlatformFilterChange((e.target as HTMLSelectElement).value)}
      >
        ${PLATFORMS.map((p) => html`<option value=${p === "All" ? "" : p} ?selected=${props.platformFilter === (p === "All" ? "" : p)}>${p === "All" ? "All Platforms" : p}</option>`)}
      </select>

      <select
        style="${selectStyle}"
        .value=${props.statusFilter}
        @change=${(e: Event) => props.onStatusFilterChange((e.target as HTMLSelectElement).value)}
      >
        ${STATUSES.map((s) => html`<option value=${s === "All" ? "" : s} ?selected=${props.statusFilter === (s === "All" ? "" : s)}>${s === "All" ? "All Statuses" : s}</option>`)}
      </select>

      <div style="flex: 1;"></div>

      <button class="v2-btn v2-btn--secondary" @click=${props.onRefresh}>Refresh</button>
    </div>
  `;
}

function renderExpandedPayload(payload: unknown) {
  let formatted: string;
  try {
    formatted = JSON.stringify(payload, null, 2);
  } catch {
    formatted = String(payload);
  }
  return html`
    <tr>
      <td colspan="7" style="padding: 0;">
        <div style="padding: var(--v2-space-4); background: var(--v2-bg-nav-pill, rgba(255,255,255,0.03));">
          <div class="v2-section-label" style="margin-bottom: var(--v2-space-2);">Record Payload</div>
          <pre class="v2-code-block" style="margin: 0; max-height: 320px; overflow: auto; font-size: var(--v2-text-xs, 12px);">${formatted}</pre>
        </div>
      </td>
    </tr>
  `;
}

function renderPagination(props: RecordsPageProps) {
  const start = props.recordsOffset + 1;
  const end = Math.min(props.recordsOffset + props.recordsLimit, props.recordsTotal);
  const hasPrev = props.recordsOffset > 0;
  const hasNext = props.recordsOffset + props.recordsLimit < props.recordsTotal;

  return html`
    <div style="display:flex; justify-content:space-between; align-items:center; padding: var(--v2-space-3) 0;">
      <span class="v2-muted" style="font-size: var(--v2-text-xs);">
        Showing ${start}\u2013${end} of ${props.recordsTotal.toLocaleString()}
      </span>
      <div style="display:flex; gap:8px;">
        <button
          class="v2-btn v2-btn--secondary"
          ?disabled=${!hasPrev}
          @click=${() => props.onRecordsPage(Math.max(0, props.recordsOffset - props.recordsLimit))}
        >Prev</button>
        <button
          class="v2-btn v2-btn--secondary"
          ?disabled=${!hasNext}
          @click=${() => props.onRecordsPage(props.recordsOffset + props.recordsLimit)}
        >Next</button>
      </div>
    </div>
  `;
}

function renderBrowseTab(props: RecordsPageProps) {
  const rows: TemplateResult[] = [];
  for (const rec of props.records) {
    const isExpanded = props.expandedRecordId === rec.id;
    rows.push(html`
      <tr
        style="cursor: pointer;"
        @click=${() => props.onRecordExpand(isExpanded ? null : rec.id)}
      >
        <td><span class="v2-muted" style="font-size: var(--v2-text-xs);">${formatTimestamp(rec.timestamp)}</span></td>
        <td>
          <div style="display:flex; align-items:center; gap:6px;">
            ${renderPlatformIcon(rec.platform, 18)}
            <span>${rec.platform}</span>
          </div>
        </td>
        <td><span class="v2-muted" title="${rec.channel}">${truncate(rec.channel, 24)}</span></td>
        <td><span class="v2-mono" style="font-size: var(--v2-text-xs);" title="${rec.recordId}">${truncate(rec.recordId, 16)}</span></td>
        <td>${rec.type}</td>
        <td>${statusBadge(rec.status)}</td>
        <td><span class="v2-faint" style="font-size: var(--v2-text-xs);">${truncate(rec.preview, 60)}</span></td>
      </tr>
    `);
    if (isExpanded && rec.payload != null) {
      rows.push(renderExpandedPayload(rec.payload));
    }
  }

  return html`
    <div class="v2-page-header">
      <div class="v2-page-header-row">
        <div>
          <h1 class="v2-page-title">Records</h1>
          <p class="v2-page-subtitle">Canonical persisted external data \u2014 every observation from adapters and connectors.</p>
        </div>
      </div>
    </div>

    ${renderFilterBar(props)}

    <div class="v2-card" style="padding: 0; overflow: hidden;">
      ${renderV2Table({
        headers: ["Time", "Platform", "Channel", "Record ID", "Type", "Status", "Preview"],
        rows,
        empty: "No records ingested yet. Records appear here when your connectors observe external data.",
        loading: props.recordsLoading,
      })}
    </div>

    ${!props.recordsLoading && props.records.length > 0 ? renderPagination(props) : nothing}
  `;
}

// ─── Channels sub-tab ───────────────────────────────────────────────

function renderChannelsTab(props: RecordsPageProps) {
  const rows = props.channels.map(
    (ch) => html`
      <tr style="cursor: pointer;" @click=${() => props.onChannelSelect(ch.id)}>
        <td><span class="v2-strong" title="${ch.name}">${truncate(ch.name, 32)}</span></td>
        <td>
          <div style="display:flex; align-items:center; gap:6px;">
            ${renderPlatformIcon(ch.platform, 18)}
            <span>${ch.platform}</span>
          </div>
        </td>
        <td>${ch.recordCount.toLocaleString()}</td>
        <td><span class="v2-muted" style="font-size: var(--v2-text-xs);">${formatTimestamp(ch.lastActivity)}</span></td>
        <td>${channelStatusBadge(ch.status)}</td>
      </tr>
    `,
  );

  return html`
    <div class="v2-page-header">
      <div class="v2-page-header-row">
        <div>
          <h1 class="v2-page-title">Channels</h1>
          <p class="v2-page-subtitle">Distinct channels observed from record ingestion.</p>
        </div>
        <button class="v2-btn v2-btn--secondary" @click=${props.onRefresh}>Refresh</button>
      </div>
    </div>

    <div class="v2-card" style="padding: 0; overflow: hidden;">
      ${renderV2Table({
        headers: ["Channel", "Platform", "Records", "Last Activity", "Status"],
        rows,
        empty: "No channels observed yet.",
        loading: props.channelsLoading,
      })}
    </div>
  `;
}

// ─── Search sub-tab ─────────────────────────────────────────────────

function renderSearchTab(props: RecordsPageProps) {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") props.onSearch();
  };

  const hasSearched = props.searchResults !== null;
  const hasResults = hasSearched && props.searchResults!.length > 0;

  return html`
    <div class="v2-page-header">
      <div class="v2-page-header-row">
        <div>
          <h1 class="v2-page-title">Search</h1>
          <p class="v2-page-subtitle">Full-text search across all ingested records.</p>
        </div>
      </div>
    </div>

    <div style="display:flex; gap:8px; align-items:center; margin-bottom: var(--v2-space-4); flex-wrap: wrap;">
      <div class="v2-search-wrap" style="flex: 1; min-width: 240px;">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input
          class="v2-search-input"
          type="text"
          placeholder="Search records by keyword, phrase, or record ID\u2026"
          .value=${props.searchQuery}
          @input=${(e: Event) => props.onSearchQueryChange((e.target as HTMLInputElement).value)}
          @keydown=${handleKeyDown}
        />
      </div>

      <select
        style="${selectStyle}"
        .value=${props.searchType}
        @change=${(e: Event) => props.onSearchTypeChange((e.target as HTMLSelectElement).value)}
      >
        ${SEARCH_TYPES.map((t) => html`<option value=${t} ?selected=${props.searchType === t}>${t}</option>`)}
      </select>

      <button
        class="v2-btn v2-btn--primary"
        ?disabled=${props.searchLoading || !props.searchQuery.trim()}
        @click=${props.onSearch}
      >${props.searchLoading ? "Searching\u2026" : "Search"}</button>
    </div>

    ${props.searchLoading
      ? html`<div style="padding: var(--v2-space-8); text-align: center;"><span class="v2-muted">Searching\u2026</span></div>`
      : !hasSearched
        ? html`
            <div style="padding: var(--v2-space-8); text-align: center;">
              <span class="v2-muted">Search across all ingested records. Use keywords, phrases, or record IDs.</span>
            </div>
          `
        : !hasResults
          ? html`
              <div style="padding: var(--v2-space-8); text-align: center;">
                <span class="v2-muted">No records match your search.</span>
              </div>
            `
          : html`
              <div style="display: flex; flex-direction: column; gap: var(--v2-space-3);">
                ${props.searchResults!.map((r) => html`
                  <div class="v2-card v2-card--interactive">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom: var(--v2-space-2);">
                      ${renderPlatformIcon(r.platform, 18)}
                      <span class="v2-muted" style="font-size: var(--v2-text-xs);">${r.channel}</span>
                      <span class="v2-faint" style="font-size: var(--v2-text-2xs);">\u00b7</span>
                      <span class="v2-faint" style="font-size: var(--v2-text-2xs);">${formatTimestamp(r.timestamp)}</span>
                      ${r.score != null
                        ? html`
                            <span style="margin-left: auto;" class="v2-badge v2-badge--neutral" title="Relevance score">
                              ${Math.round(r.score * 100)}%
                            </span>
                          `
                        : nothing}
                    </div>
                    <div style="font-size: var(--v2-text-sm); line-height: 1.5; margin-bottom: var(--v2-space-2);">
                      ${r.preview}
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                      <span class="v2-mono v2-faint" style="font-size: var(--v2-text-2xs);">${truncate(r.recordId, 20)}</span>
                      <span class="v2-badge v2-badge--neutral" style="font-size: var(--v2-text-2xs);">${r.type}</span>
                    </div>
                  </div>
                `)}
              </div>
            `
    }
  `;
}

// ─── Main render ────────────────────────────────────────────────────

export function renderRecordsPage(props: RecordsPageProps) {
  return html`
    ${renderSubTabs(props.subTab, props.onSubTabChange)}
    <div style="padding: var(--v2-space-4) 0;">
      ${props.subTab === "browse" ? renderBrowseTab(props) : nothing}
      ${props.subTab === "channels" ? renderChannelsTab(props) : nothing}
      ${props.subTab === "search" ? renderSearchTab(props) : nothing}
    </div>
  `;
}
