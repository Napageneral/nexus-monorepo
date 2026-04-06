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

function formatTime(ts: number | null): string {
  if (ts == null) {
    return "--";
  }
  return new Date(ts).toLocaleTimeString();
}

function actionBadgeClass(action: string): string {
  switch (action?.toLowerCase()) {
    case "read": return "console-badge console-badge--neutral";
    case "write": return "console-badge console-badge--info";
    case "admin": return "console-badge console-badge--warning";
    default: return "console-badge console-badge--neutral";
  }
}

function statusBadge(phase: string) {
  if (phase === "completed") return html`<span class="console-badge console-badge--success">completed</span>`;
  if (phase === "failed") return html`<span class="console-badge console-badge--danger">failed</span>`;
  return html`<span class="console-badge console-badge--neutral">${phase}</span>`;
}

function latencyText(ms: number | null) {
  if (ms == null) return html`<span class="console-muted">—</span>`;
  let style = "";
  if (ms > 2000) style = "color: var(--console-danger);";
  else if (ms > 500) style = "color: var(--console-warning);";
  else if (ms < 100) style = "color: var(--console-success);";
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
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--console-space-3); margin-bottom: var(--console-space-4);">
      <div class="console-card" style="padding: var(--console-space-3);">
        <div class="console-muted" style="font-size: var(--console-text-xs); margin-bottom: 2px;">Ops/min</div>
        <div style="font-size: var(--console-text-xl); font-weight: 600;">${opsPerMin.toFixed(1)}</div>
      </div>
      <div class="console-card" style="padding: var(--console-space-3);">
        <div class="console-muted" style="font-size: var(--console-text-xs); margin-bottom: 2px;">Total</div>
        <div style="font-size: var(--console-text-xl); font-weight: 600;">${total}</div>
      </div>
      <div class="console-card" style="padding: var(--console-space-3);">
        <div class="console-muted" style="font-size: var(--console-text-xs); margin-bottom: 2px;">Failed</div>
        <div style="font-size: var(--console-text-xl); font-weight: 600; ${failed > 0 ? "color: var(--console-danger);" : ""}">${failed}</div>
      </div>
      <div class="console-card" style="padding: var(--console-space-3);">
        <div class="console-muted" style="font-size: var(--console-text-xs); margin-bottom: 2px;">Avg Latency</div>
        <div style="font-size: var(--console-text-xl); font-weight: 600;">${avgLatency}ms</div>
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
    <div class="console-filter-bar" style="margin-bottom: var(--console-space-3); flex-wrap: wrap; gap: var(--console-space-2);">
      <div class="console-search-wrap">
        ${searchIcon}
        <input
          class="console-search-input"
          type="text"
          placeholder="Filter by method..."
          .value=${props.methodFilter}
          @input=${(e: Event) => props.onMethodFilterChange((e.target as HTMLInputElement).value)}
        />
      </div>

      ${actionPills.map(p => html`
        <button
          class="console-filter-pill ${props.actionFilter === p.toLowerCase() || (p === "All" && (!props.actionFilter || props.actionFilter === "all")) ? "console-filter-pill--active" : ""}"
          @click=${() => props.onActionFilterChange(p.toLowerCase())}
        >${p}</button>
      `)}

      <span style="width: 1px; height: 20px; background: var(--console-border); margin: 0 var(--console-space-1);"></span>

      ${statusPills.map(p => html`
        <button
          class="console-filter-pill ${props.statusFilter === p.toLowerCase() || (p === "All" && (!props.statusFilter || props.statusFilter === "all")) ? "console-filter-pill--active" : ""}"
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
    <div class="console-card" style="padding: 0; overflow: hidden;">
      <table class="console-table">
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
            <tr style=${op.phase === "failed" ? "border-left: 3px solid var(--console-danger);" : ""}>
              <td>${formatTime(op.startedAt)}</td>
              <td><span class="console-mono">${op.method}</span></td>
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

    <div style="display: flex; gap: var(--console-space-2); margin-bottom: var(--console-space-3);">
      <button
        class="console-btn console-btn--secondary"
        style=${props.paused ? "border-color: var(--console-gold); color: var(--console-gold);" : ""}
        @click=${props.onTogglePause}
      >${props.paused ? "Resume" : "Pause"}</button>
      <button class="console-btn console-btn--secondary" @click=${props.onClear}>Clear</button>
    </div>

    ${filtered.length === 0 ? html`
      <div class="console-card" style="text-align: center; padding: var(--console-space-8);">
        ${icons.activity ?? nothing}
        <p class="console-muted" style="margin-top: var(--console-space-3); font-size: var(--console-text-sm);">
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

    <div style="display: flex; gap: var(--console-space-2); margin-bottom: var(--console-space-3);">
      <button class="console-btn console-btn--secondary" @click=${props.onHistoryRefresh}>Refresh</button>
    </div>

    ${props.historyLoading ? html`
      <div style="text-align: center; padding: var(--console-space-8);">
        <span class="console-muted">Loading...</span>
      </div>
    ` : props.historyError ? html`
      <div class="console-card" style="text-align: center; padding: var(--console-space-6);">
        <span class="console-muted" style="color: var(--console-danger);">${props.historyError}</span>
      </div>
    ` : filtered.length === 0 ? html`
      <div class="console-card" style="text-align: center; padding: var(--console-space-8);">
        <p class="console-muted" style="font-size: var(--console-text-sm);">
          No operations found matching your filters.
        </p>
      </div>
    ` : html`
      ${renderOpsTable(filtered)}

      <div style="display: flex; align-items: center; justify-content: space-between; margin-top: var(--console-space-3);">
        <span class="console-muted" style="font-size: var(--console-text-xs);">Showing ${start}-${end} of ${props.historyTotal}</span>
        <div style="display: flex; gap: var(--console-space-2);">
          <button
            class="console-btn console-btn--secondary"
            ?disabled=${props.historyOffset === 0}
            @click=${() => props.onHistoryPage(Math.max(0, props.historyOffset - limit))}
          >Prev</button>
          <button
            class="console-btn console-btn--secondary"
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
    <div class="console-page-header">
      <div class="console-page-header-row">
        <div>
          <h1 class="console-page-title">Monitor</h1>
          <p class="console-page-subtitle">Track and review operations across your runtime.</p>
        </div>
      </div>
    </div>

    <div class="console-detail-tabs" style="margin-bottom: var(--console-space-4);">
      <button
        class="console-detail-tab ${props.subTab === "live" ? "console-detail-tab--active" : ""}"
        @click=${() => props.onSubTabChange("live")}
      >Live</button>
      <button
        class="console-detail-tab ${props.subTab === "history" ? "console-detail-tab--active" : ""}"
        @click=${() => props.onSubTabChange("history")}
      >History</button>
    </div>

    ${props.subTab === "live" ? renderLiveTab(props) : renderHistoryTab(props)}
  `;
}
