import { html, nothing } from "lit";
import { icons } from "../../ui/icons.ts";
import type { MonitorOperation, MonitorOperationsStatsResult } from "../../ui/types.ts";

export type MonitorPageProps = {
  subTab: "live" | "history";
  onSubTabChange: (tab: string) => void;
  // Live
  liveOps: MonitorOperation[];
  paused: boolean;
  onTogglePause: () => void;
  onClear: () => void;
  // History
  historyOps: MonitorOperation[];
  historyTotal: number;
  historyLoading: boolean;
  historyError: string | null;
  historyOffset: number;
  onHistoryPage: (offset: number) => void;
  onHistoryRefresh: () => void;
  // Filters (shared)
  methodFilter: string;
  actionFilter: string;
  statusFilter: string;
  onMethodFilterChange: (v: string) => void;
  onActionFilterChange: (v: string) => void;
  onStatusFilterChange: (v: string) => void;
  // Stats
  stats: MonitorOperationsStatsResult | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

function actionBadgeClass(action: string): string {
  switch (action?.toLowerCase()) {
    case "read": return "v2-badge v2-badge--neutral";
    case "write": return "v2-badge v2-badge--info";
    case "admin": return "v2-badge v2-badge--warning";
    default: return "v2-badge v2-badge--neutral";
  }
}

function statusBadge(phase: string) {
  if (phase === "completed") return html`<span class="v2-badge v2-badge--success">completed</span>`;
  if (phase === "failed") return html`<span class="v2-badge v2-badge--danger">failed</span>`;
  return html`<span class="v2-badge v2-badge--neutral">${phase}</span>`;
}

function latencyText(ms: number | null) {
  if (ms == null) return html`<span class="v2-muted">—</span>`;
  let style = "";
  if (ms > 2000) style = "color: var(--v2-danger);";
  else if (ms > 500) style = "color: var(--v2-warning);";
  else if (ms < 100) style = "color: var(--v2-success);";
  return html`<span style=${style}>${ms}ms</span>`;
}

function truncateCaller(id: string | null): string {
  if (!id) return "—";
  if (id.length <= 16) return id;
  return id.slice(0, 12) + "...";
}

function filterOps(ops: MonitorOperation[], methodFilter: string, actionFilter: string, statusFilter: string): MonitorOperation[] {
  let filtered = ops;
  if (methodFilter) {
    const q = methodFilter.toLowerCase();
    filtered = filtered.filter(op => op.method.toLowerCase().includes(q));
  }
  if (actionFilter && actionFilter !== "all") {
    filtered = filtered.filter(op => op.action?.toLowerCase() === actionFilter.toLowerCase());
  }
  if (statusFilter && statusFilter !== "all") {
    if (statusFilter === "completed") {
      filtered = filtered.filter(op => op.phase === "completed");
    } else if (statusFilter === "failed") {
      filtered = filtered.filter(op => op.phase === "failed");
    }
  }
  return filtered;
}

// ─── Stat Cards ───────────────────────────────────────────────────────

function renderStatCards(props: MonitorPageProps) {
  const ops = props.subTab === "live" ? props.liveOps : [];
  const stats = props.stats;

  const opsPerMin = stats?.operationsPerMinute ?? 0;
  const total = props.subTab === "live" ? ops.length : (stats?.totalOperations ?? 0);
  const failed = props.subTab === "live"
    ? ops.filter(o => o.phase === "failed").length
    : (stats?.failedCount ?? 0);
  const avgLatency = props.subTab === "live"
    ? (ops.length > 0 ? Math.round(ops.reduce((s, o) => s + (o.latencyMs ?? 0), 0) / ops.length) : 0)
    : (stats?.avgLatencyMs ?? 0);

  return html`
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--v2-space-3); margin-bottom: var(--v2-space-4);">
      <div class="v2-card" style="padding: var(--v2-space-3);">
        <div class="v2-muted" style="font-size: var(--v2-text-xs); margin-bottom: 2px;">Ops/min</div>
        <div style="font-size: var(--v2-text-xl); font-weight: 600;">${opsPerMin.toFixed(1)}</div>
      </div>
      <div class="v2-card" style="padding: var(--v2-space-3);">
        <div class="v2-muted" style="font-size: var(--v2-text-xs); margin-bottom: 2px;">Total</div>
        <div style="font-size: var(--v2-text-xl); font-weight: 600;">${total}</div>
      </div>
      <div class="v2-card" style="padding: var(--v2-space-3);">
        <div class="v2-muted" style="font-size: var(--v2-text-xs); margin-bottom: 2px;">Failed</div>
        <div style="font-size: var(--v2-text-xl); font-weight: 600; ${failed > 0 ? "color: var(--v2-danger);" : ""}">${failed}</div>
      </div>
      <div class="v2-card" style="padding: var(--v2-space-3);">
        <div class="v2-muted" style="font-size: var(--v2-text-xs); margin-bottom: 2px;">Avg Latency</div>
        <div style="font-size: var(--v2-text-xl); font-weight: 600;">${avgLatency}ms</div>
      </div>
    </div>
  `;
}

// ─── Filter Bar ───────────────────────────────────────────────────────

function renderFilterBar(props: MonitorPageProps) {
  const searchIcon = html`<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`;

  const actionPills = ["All", "Read", "Write", "Admin"];
  const statusPills = ["All", "Completed", "Failed"];

  return html`
    <div class="v2-filter-bar" style="margin-bottom: var(--v2-space-3); flex-wrap: wrap; gap: var(--v2-space-2);">
      <div class="v2-search-wrap">
        ${searchIcon}
        <input
          class="v2-search-input"
          type="text"
          placeholder="Filter by method..."
          .value=${props.methodFilter}
          @input=${(e: Event) => props.onMethodFilterChange((e.target as HTMLInputElement).value)}
        />
      </div>

      ${actionPills.map(p => html`
        <button
          class="v2-filter-pill ${props.actionFilter === p.toLowerCase() || (p === "All" && (!props.actionFilter || props.actionFilter === "all")) ? "v2-filter-pill--active" : ""}"
          @click=${() => props.onActionFilterChange(p.toLowerCase())}
        >${p}</button>
      `)}

      <span style="width: 1px; height: 20px; background: var(--v2-border); margin: 0 var(--v2-space-1);"></span>

      ${statusPills.map(p => html`
        <button
          class="v2-filter-pill ${props.statusFilter === p.toLowerCase() || (p === "All" && (!props.statusFilter || props.statusFilter === "all")) ? "v2-filter-pill--active" : ""}"
          @click=${() => props.onStatusFilterChange(p.toLowerCase())}
        >${p}</button>
      `)}
    </div>
  `;
}

// ─── Operations Table ─────────────────────────────────────────────────

function renderOpsTable(ops: MonitorOperation[]) {
  if (ops.length === 0) return nothing;
  return html`
    <div class="v2-card" style="padding: 0; overflow: hidden;">
      <table class="v2-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Method</th>
            <th>Action</th>
            <th>Resource</th>
            <th>Caller</th>
            <th>Status</th>
            <th>Latency</th>
          </tr>
        </thead>
        <tbody>
          ${ops.map(op => html`
            <tr style=${op.phase === "failed" ? "border-left: 3px solid var(--v2-danger);" : ""}>
              <td>${formatTime(op.startedAt)}</td>
              <td><span class="v2-mono">${op.method}</span></td>
              <td><span class=${actionBadgeClass(op.action)}>${op.action}</span></td>
              <td>${op.resource}</td>
              <td>${truncateCaller(op.callerEntityId)}</td>
              <td>${statusBadge(op.phase)}</td>
              <td>${latencyText(op.latencyMs)}</td>
            </tr>
          `)}
        </tbody>
      </table>
    </div>
  `;
}

// ─── Live Sub-Tab ─────────────────────────────────────────────────────

function renderLiveTab(props: MonitorPageProps) {
  const filtered = filterOps(props.liveOps, props.methodFilter, props.actionFilter, props.statusFilter);

  return html`
    ${renderStatCards(props)}
    ${renderFilterBar(props)}

    <div style="display: flex; gap: var(--v2-space-2); margin-bottom: var(--v2-space-3);">
      <button
        class="v2-btn v2-btn--secondary"
        style=${props.paused ? "border-color: var(--v2-gold); color: var(--v2-gold);" : ""}
        @click=${props.onTogglePause}
      >${props.paused ? "Resume" : "Pause"}</button>
      <button class="v2-btn v2-btn--secondary" @click=${props.onClear}>Clear</button>
    </div>

    ${filtered.length === 0 ? html`
      <div class="v2-card" style="text-align: center; padding: var(--v2-space-8);">
        ${icons.activity ?? nothing}
        <p class="v2-muted" style="margin-top: var(--v2-space-3); font-size: var(--v2-text-sm);">
          No operations yet. Operations will appear here as agents and clients interact with the runtime.
        </p>
      </div>
    ` : renderOpsTable(filtered)}
  `;
}

// ─── History Sub-Tab ──────────────────────────────────────────────────

function renderHistoryTab(props: MonitorPageProps) {
  const filtered = filterOps(props.historyOps, props.methodFilter, props.actionFilter, props.statusFilter);
  const limit = 50;
  const start = props.historyOffset + 1;
  const end = Math.min(props.historyOffset + limit, props.historyTotal);

  return html`
    ${renderFilterBar(props)}

    <div style="display: flex; gap: var(--v2-space-2); margin-bottom: var(--v2-space-3);">
      <button class="v2-btn v2-btn--secondary" @click=${props.onHistoryRefresh}>Refresh</button>
    </div>

    ${props.historyLoading ? html`
      <div style="text-align: center; padding: var(--v2-space-8);">
        <span class="v2-muted">Loading...</span>
      </div>
    ` : props.historyError ? html`
      <div class="v2-card" style="text-align: center; padding: var(--v2-space-6);">
        <span class="v2-muted" style="color: var(--v2-danger);">${props.historyError}</span>
      </div>
    ` : filtered.length === 0 ? html`
      <div class="v2-card" style="text-align: center; padding: var(--v2-space-8);">
        <p class="v2-muted" style="font-size: var(--v2-text-sm);">
          No operations found matching your filters.
        </p>
      </div>
    ` : html`
      ${renderOpsTable(filtered)}

      <div style="display: flex; align-items: center; justify-content: space-between; margin-top: var(--v2-space-3);">
        <span class="v2-muted" style="font-size: var(--v2-text-xs);">Showing ${start}-${end} of ${props.historyTotal}</span>
        <div style="display: flex; gap: var(--v2-space-2);">
          <button
            class="v2-btn v2-btn--secondary"
            ?disabled=${props.historyOffset === 0}
            @click=${() => props.onHistoryPage(Math.max(0, props.historyOffset - limit))}
          >Prev</button>
          <button
            class="v2-btn v2-btn--secondary"
            ?disabled=${end >= props.historyTotal}
            @click=${() => props.onHistoryPage(props.historyOffset + limit)}
          >Next</button>
        </div>
      </div>
    `}
  `;
}

// ─── Main Render ──────────────────────────────────────────────────────

export function renderMonitorPage(props: MonitorPageProps) {
  return html`
    <div class="v2-page-header">
      <div class="v2-page-header-row">
        <div>
          <h1 class="v2-page-title">Monitor</h1>
          <p class="v2-page-subtitle">Track and review operations across your runtime.</p>
        </div>
      </div>
    </div>

    <div class="v2-detail-tabs" style="margin-bottom: var(--v2-space-4);">
      <button
        class="v2-detail-tab ${props.subTab === "live" ? "v2-detail-tab--active" : ""}"
        @click=${() => props.onSubTabChange("live")}
      >Live</button>
      <button
        class="v2-detail-tab ${props.subTab === "history" ? "v2-detail-tab--active" : ""}"
        @click=${() => props.onSubTabChange("history")}
      >History</button>
    </div>

    ${props.subTab === "live" ? renderLiveTab(props) : renderHistoryTab(props)}
  `;
}
