import { html, nothing } from "lit";
import { icons } from "../../ui/icons.ts";

// ─── Types ────────────────────────────────────────────────────────────

export type JobsSubTab = "overview" | "definitions" | "queue" | "runs" | "schedules";

export type JobsPageProps = {
  subTab: JobsSubTab;
  onSubTabChange: (tab: string) => void;
  // Job definitions
  definitions: Array<{ id: string; name: string; description: string; createdAt?: number }>;
  definitionsLoading: boolean;
  // Queue
  queueItems: Array<{
    id: string;
    jobId: string;
    state: string;
    priority: number;
    queuedAt: number;
    leasedUntil?: number;
    attempts: number;
  }>;
  queueLoading: boolean;
  queueFilter: string;
  onQueueFilterChange: (filter: string) => void;
  // Runs
  runs: Array<{
    id: string;
    jobId: string;
    trigger: string;
    status: string;
    startedAt: number;
    durationMs?: number;
    output?: string;
  }>;
  runsLoading: boolean;
  // Schedules
  schedules: Array<{
    id: string;
    name: string;
    jobId: string;
    cron: string;
    nextRunAt?: number;
    lastRunAt?: number;
    enabled: boolean;
  }>;
  schedulesLoading: boolean;
  onScheduleToggle: (id: string, enabled: boolean) => void;
  onScheduleRun: (id: string) => void;
  onScheduleRemove: (id: string) => void;
  onNewSchedule: () => void;
  // General
  onRefresh: () => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────

function fmtTimestamp(ms: number | undefined | null): string {
  if (ms == null) return "—";
  return new Date(ms).toLocaleString();
}

function fmtDuration(ms: number | undefined | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = s / 60;
  if (m < 60) return `${m.toFixed(1)}m`;
  const h = m / 60;
  return `${h.toFixed(1)}h`;
}

function shortId(id: string): string {
  return id.length > 12 ? id.slice(0, 12) + "…" : id;
}

// ─── Status badges ────────────────────────────────────────────────────

function renderQueueStateBadge(state: string) {
  const cls =
    state === "leased" ? "v2-badge--info"
    : state === "delayed" ? "v2-badge--warning"
    : state === "dead_lettered" ? "v2-badge--danger"
    : "v2-badge--neutral";
  return html`<span class="v2-badge ${cls}">${state.replace("_", " ")}</span>`;
}

function renderRunStatusBadge(status: string) {
  const cls =
    status === "success" ? "v2-badge--success"
    : status === "failed" ? "v2-badge--danger"
    : status === "cancelled" ? "v2-badge--neutral"
    : status === "running" ? "v2-badge--info"
    : "v2-badge--neutral";
  return html`<span class="v2-badge ${cls}">${status}</span>`;
}

function renderTriggerLabel(trigger: string) {
  return html`<span class="v2-badge v2-badge--neutral" style="font-size: var(--v2-text-2xs);">${trigger}</span>`;
}

// ─── Tab bar ──────────────────────────────────────────────────────────

function renderSubTabs(active: JobsSubTab, onChange: (tab: string) => void) {
  const tabs: { key: JobsSubTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "definitions", label: "Definitions" },
    { key: "queue", label: "Queue" },
    { key: "runs", label: "Runs" },
    { key: "schedules", label: "Schedules" },
  ];
  return html`
    <div class="v2-detail-tabs">
      ${tabs.map(
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

// ─── Overview sub-tab ─────────────────────────────────────────────────

function renderOverview(props: JobsPageProps) {
  const activeSchedules = props.schedules.filter((s) => s.enabled).length;
  const queueDepth = props.queueItems.length;
  const now = Date.now();
  const runs24h = props.runs.filter((r) => now - r.startedAt < 86_400_000).length;
  const recentRuns = props.runs
    .toSorted((a, b) => b.startedAt - a.startedAt)
    .slice(0, 10);
  const upcomingSchedules = props.schedules
    .filter((s) => s.enabled && s.nextRunAt != null)
    .toSorted((a, b) => (a.nextRunAt ?? 0) - (b.nextRunAt ?? 0))
    .slice(0, 5);

  return html`
    <!-- Stat cards -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--v2-space-4); margin-bottom: var(--v2-space-6);">
      <div class="v2-card" style="text-align: center; padding: var(--v2-space-5);">
        <div class="v2-muted" style="font-size: var(--v2-text-xs); margin-bottom: var(--v2-space-2);">Job Definitions</div>
        <div style="font-family: var(--v2-font-mono); font-size: var(--v2-text-2xl); font-weight: 600;">${props.definitions.length}</div>
      </div>
      <div class="v2-card" style="text-align: center; padding: var(--v2-space-5);">
        <div class="v2-muted" style="font-size: var(--v2-text-xs); margin-bottom: var(--v2-space-2);">Active Schedules</div>
        <div style="font-family: var(--v2-font-mono); font-size: var(--v2-text-2xl); font-weight: 600;">${activeSchedules}</div>
      </div>
      <div class="v2-card" style="text-align: center; padding: var(--v2-space-5);">
        <div class="v2-muted" style="font-size: var(--v2-text-xs); margin-bottom: var(--v2-space-2);">Queue Depth</div>
        <div style="font-family: var(--v2-font-mono); font-size: var(--v2-text-2xl); font-weight: 600;">${queueDepth}</div>
      </div>
      <div class="v2-card" style="text-align: center; padding: var(--v2-space-5);">
        <div class="v2-muted" style="font-size: var(--v2-text-xs); margin-bottom: var(--v2-space-2);">Runs (24h)</div>
        <div style="font-family: var(--v2-font-mono); font-size: var(--v2-text-2xl); font-weight: 600;">${runs24h}</div>
      </div>
    </div>

    <!-- Recent Runs -->
    <div class="v2-section-label" style="margin-bottom: var(--v2-space-3);">Recent Runs</div>
    <div class="v2-card" style="padding: 0; overflow: hidden; margin-bottom: var(--v2-space-6);">
      <table class="v2-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Job</th>
            <th>Status</th>
            <th>Trigger</th>
            <th>Started</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          ${recentRuns.length === 0
            ? html`
                <tr>
                  <td colspan="6" style="text-align: center; padding: var(--v2-space-6);">
                    <span class="v2-muted" style="font-size: var(--v2-text-xs);">No recent runs.</span>
                  </td>
                </tr>
              `
            : recentRuns.map(
                (r) => html`
                  <tr>
                    <td style="font-family: var(--v2-font-mono); font-size: var(--v2-text-xs);">${shortId(r.id)}</td>
                    <td>${r.jobId}</td>
                    <td>${renderRunStatusBadge(r.status)}</td>
                    <td>${renderTriggerLabel(r.trigger)}</td>
                    <td style="font-size: var(--v2-text-xs);">${fmtTimestamp(r.startedAt)}</td>
                    <td style="font-family: var(--v2-font-mono); font-size: var(--v2-text-xs);">${fmtDuration(r.durationMs)}</td>
                  </tr>
                `,
              )
          }
        </tbody>
      </table>
    </div>

    <!-- Active Schedules -->
    <div class="v2-section-label" style="margin-bottom: var(--v2-space-3);">Active Schedules</div>
    <div class="v2-card" style="padding: 0; overflow: hidden;">
      <table class="v2-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Job</th>
            <th>Cron</th>
            <th>Next Run</th>
          </tr>
        </thead>
        <tbody>
          ${upcomingSchedules.length === 0
            ? html`
                <tr>
                  <td colspan="4" style="text-align: center; padding: var(--v2-space-6);">
                    <span class="v2-muted" style="font-size: var(--v2-text-xs);">No active schedules.</span>
                  </td>
                </tr>
              `
            : upcomingSchedules.map(
                (s) => html`
                  <tr>
                    <td>${s.name}</td>
                    <td style="font-family: var(--v2-font-mono); font-size: var(--v2-text-xs);">${s.jobId}</td>
                    <td style="font-family: var(--v2-font-mono); font-size: var(--v2-text-xs);">${s.cron}</td>
                    <td style="font-size: var(--v2-text-xs);">${fmtTimestamp(s.nextRunAt)}</td>
                  </tr>
                `,
              )
          }
        </tbody>
      </table>
    </div>
  `;
}

// ─── Definitions sub-tab ──────────────────────────────────────────────

function renderDefinitions(props: JobsPageProps) {
  const searchIcon = html`<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`;

  return html`
    <div class="v2-filter-bar" style="margin-bottom: var(--v2-space-4);">
      <div class="v2-search-wrap">
        ${searchIcon}
        <input class="v2-search-input" type="text" placeholder="Search definitions..." />
      </div>
    </div>

    ${props.definitionsLoading
      ? html`<div class="v2-muted" style="padding: var(--v2-space-8); text-align: center;">Loading definitions...</div>`
      : props.definitions.length === 0
        ? html`
            <div class="v2-card">
              <div class="v2-empty">
                <div class="v2-empty-icon">${icons.fileText}</div>
                <div class="v2-empty-title">No job definitions yet</div>
                <div class="v2-empty-description">Job definitions describe reusable units of work.</div>
              </div>
            </div>
          `
        : html`
            <div class="v2-card" style="padding: 0; overflow: hidden;">
              <table class="v2-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${props.definitions.map(
                    (d) => html`
                      <tr>
                        <td>
                          <div class="v2-strong">${d.name}</div>
                          <div class="v2-muted" style="font-size: var(--v2-text-2xs); font-family: var(--v2-font-mono);">${shortId(d.id)}</div>
                        </td>
                        <td class="v2-muted" style="font-size: var(--v2-text-xs);">${d.description || "—"}</td>
                        <td style="font-size: var(--v2-text-xs);">${fmtTimestamp(d.createdAt)}</td>
                        <td>
                          <button class="v2-btn v2-btn--secondary v2-btn--sm">View</button>
                        </td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>
          `
    }
  `;
}

// ─── Queue sub-tab ────────────────────────────────────────────────────

function renderQueue(props: JobsPageProps) {
  const filters = ["all", "queued", "leased", "delayed", "dead_lettered"];
  const filtered =
    props.queueFilter === "all"
      ? props.queueItems
      : props.queueItems.filter((q) => q.state === props.queueFilter);

  return html`
    <div style="display: flex; gap: var(--v2-space-2); margin-bottom: var(--v2-space-4); flex-wrap: wrap;">
      ${filters.map(
        (f) => html`
          <button
            class="v2-btn v2-btn--sm ${props.queueFilter === f ? "v2-btn--primary" : "v2-btn--secondary"}"
            @click=${() => props.onQueueFilterChange(f)}
          >${f === "dead_lettered" ? "Dead-lettered" : f.charAt(0).toUpperCase() + f.slice(1)}</button>
        `,
      )}
    </div>

    ${props.queueLoading
      ? html`<div class="v2-muted" style="padding: var(--v2-space-8); text-align: center;">Loading queue...</div>`
      : filtered.length === 0
        ? html`
            <div class="v2-card">
              <div class="v2-empty">
                <div class="v2-empty-icon">${icons.zap}</div>
                <div class="v2-empty-title">Queue is empty</div>
                <div class="v2-empty-description">Jobs enter the queue when triggered by schedules, events, or manual invocation.</div>
              </div>
            </div>
          `
        : html`
            <div class="v2-card" style="padding: 0; overflow: hidden;">
              <table class="v2-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Job</th>
                    <th>State</th>
                    <th>Priority</th>
                    <th>Queued At</th>
                    <th>Leased Until</th>
                    <th>Attempts</th>
                  </tr>
                </thead>
                <tbody>
                  ${filtered.map(
                    (q) => html`
                      <tr>
                        <td style="font-family: var(--v2-font-mono); font-size: var(--v2-text-xs);">${shortId(q.id)}</td>
                        <td>${q.jobId}</td>
                        <td>${renderQueueStateBadge(q.state)}</td>
                        <td style="font-family: var(--v2-font-mono);">${q.priority}</td>
                        <td style="font-size: var(--v2-text-xs);">${fmtTimestamp(q.queuedAt)}</td>
                        <td style="font-size: var(--v2-text-xs);">${fmtTimestamp(q.leasedUntil)}</td>
                        <td style="font-family: var(--v2-font-mono);">${q.attempts}</td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>
          `
    }
  `;
}

// ─── Runs sub-tab ─────────────────────────────────────────────────────

function renderRuns(props: JobsPageProps) {
  const searchIcon = html`<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`;
  const sortedRuns = props.runs.toSorted((a, b) => b.startedAt - a.startedAt);

  return html`
    <div class="v2-filter-bar" style="margin-bottom: var(--v2-space-4);">
      <div class="v2-search-wrap">
        ${searchIcon}
        <input class="v2-search-input" type="text" placeholder="Search runs..." />
      </div>
    </div>

    ${props.runsLoading
      ? html`<div class="v2-muted" style="padding: var(--v2-space-8); text-align: center;">Loading runs...</div>`
      : sortedRuns.length === 0
        ? html`
            <div class="v2-card">
              <div class="v2-empty">
                <div class="v2-empty-icon">${icons.barChart}</div>
                <div class="v2-empty-title">No runs recorded yet</div>
                <div class="v2-empty-description">Run history will appear here as jobs execute.</div>
              </div>
            </div>
          `
        : html`
            <div class="v2-card" style="padding: 0; overflow: hidden;">
              <table class="v2-table">
                <thead>
                  <tr>
                    <th>Run ID</th>
                    <th>Job</th>
                    <th>Trigger</th>
                    <th>Status</th>
                    <th>Started</th>
                    <th>Duration</th>
                    <th>Output</th>
                  </tr>
                </thead>
                <tbody>
                  ${sortedRuns.map(
                    (r) => html`
                      <tr>
                        <td style="font-family: var(--v2-font-mono); font-size: var(--v2-text-xs);">${shortId(r.id)}</td>
                        <td>${r.jobId}</td>
                        <td>${renderTriggerLabel(r.trigger)}</td>
                        <td>${renderRunStatusBadge(r.status)}</td>
                        <td style="font-size: var(--v2-text-xs);">${fmtTimestamp(r.startedAt)}</td>
                        <td style="font-family: var(--v2-font-mono); font-size: var(--v2-text-xs);">${fmtDuration(r.durationMs)}</td>
                        <td class="v2-muted" style="font-size: var(--v2-text-2xs); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                          ${r.output || "—"}
                        </td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>
          `
    }
  `;
}

// ─── Schedules sub-tab ────────────────────────────────────────────────

function renderSchedules(props: JobsPageProps) {
  return html`
    <div class="v2-row-between" style="margin-bottom: var(--v2-space-4);">
      <div></div>
      <button class="v2-btn v2-btn--primary" @click=${props.onNewSchedule}>+ New Schedule</button>
    </div>

    ${props.schedulesLoading
      ? html`<div class="v2-muted" style="padding: var(--v2-space-8); text-align: center;">Loading schedules...</div>`
      : props.schedules.length === 0
        ? html`
            <div class="v2-card">
              <div class="v2-empty">
                <div class="v2-empty-icon">
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <div class="v2-empty-title">No schedules configured</div>
                <div class="v2-empty-description">Schedules bind job definitions to cron-based time triggers.</div>
              </div>
            </div>
          `
        : html`
            <div class="v2-card" style="padding: 0; overflow: hidden;">
              <table class="v2-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Job</th>
                    <th>Cron</th>
                    <th>Next Run</th>
                    <th>Last Run</th>
                    <th>Enabled</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${props.schedules.map(
                    (s) => html`
                      <tr>
                        <td class="v2-strong">${s.name}</td>
                        <td style="font-family: var(--v2-font-mono); font-size: var(--v2-text-xs);">${s.jobId}</td>
                        <td style="font-family: var(--v2-font-mono); font-size: var(--v2-text-xs);">${s.cron}</td>
                        <td style="font-size: var(--v2-text-xs);">${fmtTimestamp(s.nextRunAt)}</td>
                        <td style="font-size: var(--v2-text-xs);">${fmtTimestamp(s.lastRunAt)}</td>
                        <td>
                          <button
                            class="v2-btn v2-btn--sm ${s.enabled ? "v2-btn--primary" : "v2-btn--secondary"}"
                            @click=${() => props.onScheduleToggle(s.id, !s.enabled)}
                          >${s.enabled ? "On" : "Off"}</button>
                        </td>
                        <td>
                          <div class="v2-row" style="gap: var(--v2-space-1);">
                            <button class="v2-btn v2-btn--secondary v2-btn--sm" @click=${() => props.onScheduleRun(s.id)}>Run Now</button>
                            <button class="v2-btn v2-btn--secondary v2-btn--sm" @click=${() => props.onScheduleRemove(s.id)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>
          `
    }
  `;
}

// ─── Main render ──────────────────────────────────────────────────────

export function renderJobsPage(props: JobsPageProps) {
  return html`
    <div class="v2-page-header">
      <div class="v2-page-header-row">
        <div>
          <h1 class="v2-page-title">Jobs</h1>
          <p class="v2-page-subtitle">Unified durable work runtime — definitions, schedules, queue, and execution history.</p>
        </div>
        <div class="v2-row">
          <button class="v2-btn v2-btn--secondary" @click=${props.onRefresh}>Refresh</button>
        </div>
      </div>
    </div>

    ${renderSubTabs(props.subTab, props.onSubTabChange)}

    <div style="margin-top: var(--v2-space-5);">
      ${props.subTab === "overview" ? renderOverview(props)
        : props.subTab === "definitions" ? renderDefinitions(props)
        : props.subTab === "queue" ? renderQueue(props)
        : props.subTab === "runs" ? renderRuns(props)
        : props.subTab === "schedules" ? renderSchedules(props)
        : nothing
      }
    </div>
  `;
}
