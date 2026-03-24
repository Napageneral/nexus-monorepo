import { html, nothing } from "lit";
import type { AutomationMeeseeksEntry } from "../controllers/schedules.ts";
import type { JobDefinition, ScheduleJob, ScheduleRunLogEntry, ScheduleStatus } from "../types.ts";
import type { ScheduleFormState } from "../ui-types.ts";
import { formatRelativeTimestamp, formatMs } from "../format.ts";
import { formatSchedulePayload, formatScheduleSpec, formatNextRun } from "../presenter.ts";

export type ScheduleProps = {
  loading: boolean;
  status: ScheduleStatus | null;
  jobDefinitions: JobDefinition[];
  jobs: ScheduleJob[];
  error: string | null;
  busy: boolean;
  form: ScheduleFormState;
  runsJobId: string | null;
  runs: ScheduleRunLogEntry[];
  meeseeksLoading?: boolean;
  meeseeksError?: string | null;
  meeseeks?: AutomationMeeseeksEntry[];
  onFormChange: (patch: Partial<ScheduleFormState>) => void;
  onRefresh: () => void;
  onAdd: () => void;
  onToggle: (job: ScheduleJob, enabled: boolean) => void;
  onRun: (job: ScheduleJob) => void;
  onRemove: (job: ScheduleJob) => void;
  onLoadRuns: (jobId: string) => void;
};

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function formatWindow(start: string | null, end: string | null): string {
  if (start && end) {
    return `${start} -> ${end}`;
  }
  if (start) {
    return `starts ${start}`;
  }
  if (end) {
    return `until ${end}`;
  }
  return "always active";
}

function selectedJobDefinition(props: ScheduleProps): JobDefinition | null {
  return props.jobDefinitions.find((job) => job.id === props.form.jobDefinitionId.trim()) ?? null;
}

function renderForm(props: ScheduleProps) {
  const selectedJob = selectedJobDefinition(props);
  return html`
    <section class="card">
      <div class="card-title">New Schedule</div>
      <div class="card-sub">Bind a job definition to a runtime-owned execution schedule.</div>
      <div class="form-grid" style="margin-top: 16px;">
        <label class="field">
          <span>Name</span>
          <input
            .value=${props.form.name}
            @input=${(e: Event) =>
              props.onFormChange({ name: (e.target as HTMLInputElement).value })}
            placeholder="Morning summary"
          />
        </label>
        <label class="field">
          <span>Job Definition</span>
          <select
            .value=${props.form.jobDefinitionId}
            @change=${(e: Event) =>
              props.onFormChange({ jobDefinitionId: (e.target as HTMLSelectElement).value })}
          >
            <option value="">Select job definition</option>
            ${props.jobDefinitions.map(
              (job) => html`<option value=${job.id}>${job.name || job.id} (${job.id})</option>`,
            )}
          </select>
        </label>
        <label class="field">
          <span>Cron Expression</span>
          <input
            .value=${props.form.expression}
            @input=${(e: Event) =>
              props.onFormChange({ expression: (e.target as HTMLInputElement).value })}
            placeholder="0 7 * * *"
          />
        </label>
        <label class="field">
          <span>Timezone</span>
          <input
            .value=${props.form.timezone}
            @input=${(e: Event) =>
              props.onFormChange({ timezone: (e.target as HTMLInputElement).value })}
            placeholder="America/Chicago"
          />
        </label>
        <label class="field">
          <span>Active From</span>
          <input
            .value=${props.form.activeFrom}
            @input=${(e: Event) =>
              props.onFormChange({ activeFrom: (e.target as HTMLInputElement).value })}
            placeholder="2026-03-10T08:00:00Z"
          />
        </label>
        <label class="field">
          <span>Active Until</span>
          <input
            .value=${props.form.activeUntil}
            @input=${(e: Event) =>
              props.onFormChange({ activeUntil: (e.target as HTMLInputElement).value })}
            placeholder="2026-12-31T23:59:59Z"
          />
        </label>
        <label class="field checkbox">
          <span>Enabled</span>
          <input
            type="checkbox"
            .checked=${props.form.enabled}
            @change=${(e: Event) =>
              props.onFormChange({ enabled: (e.target as HTMLInputElement).checked })}
          />
        </label>
      </div>
      ${
        selectedJob
          ? html`
              <div class="callout" style="margin-top: 12px;">
                <div><strong>${selectedJob.name || selectedJob.id}</strong></div>
                ${
                  selectedJob.description
                    ? html`<div class="muted" style="margin-top: 4px;">${selectedJob.description}</div>`
                    : nothing
                }
                <div class="muted" style="margin-top: 4px;">Workspace: ${selectedJob.workspace_id || "n/a"}</div>
              </div>
            `
          : nothing
      }
      <div class="row" style="margin-top: 14px;">
        <button class="btn primary" ?disabled=${props.busy} @click=${props.onAdd}>
          ${props.busy ? "Saving…" : "Create schedule"}
        </button>
      </div>
    </section>
  `;
}

function renderScheduleJob(job: ScheduleJob, props: ScheduleProps) {
  const nextRunAtMs = parseTimestamp(job.next_run_at);
  const lastRunAtMs = parseTimestamp(job.last_run_at);
  const title = job.name?.trim() || job.job_name?.trim() || job.job_definition_id;
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">${title}</div>
        <div class="list-sub">${formatSchedulePayload(job)}</div>
        <div class="chip-row" style="margin-top: 8px;">
          <span class="chip">${formatScheduleSpec(job)}</span>
          <span class="chip ${job.enabled ? "chip-ok" : "chip-warn"}">${job.enabled ? "enabled" : "disabled"}</span>
          <span class="chip">next: ${formatNextRun(nextRunAtMs)}</span>
          <span class="chip">last: ${formatNextRun(lastRunAtMs)}</span>
        </div>
        <div class="muted" style="margin-top: 8px;">
          Active window: ${formatWindow(job.active_from, job.active_until)}
        </div>
      </div>
      <div class="list-actions">
        <button class="btn btn--sm" ?disabled=${props.busy} @click=${() => props.onLoadRuns(job.id)}>
          Runs
        </button>
        <button class="btn btn--sm" ?disabled=${props.busy} @click=${() => props.onToggle(job, !job.enabled)}>
          ${job.enabled ? "Disable" : "Enable"}
        </button>
        <button class="btn btn--sm" ?disabled=${props.busy} @click=${() => props.onRun(job)}>
          Trigger
        </button>
        <button class="btn btn--sm danger" ?disabled=${props.busy} @click=${() => props.onRemove(job)}>
          Delete
        </button>
      </div>
    </div>
  `;
}

function renderRun(entry: ScheduleRunLogEntry) {
  const startedAtMs = parseTimestamp(entry.started_at);
  const completedAtMs = parseTimestamp(entry.completed_at);
  const createdAtMs = parseTimestamp(entry.created_at);
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">${entry.status}</div>
        <div class="list-sub">
          ${entry.trigger_source || "unknown trigger"} · created ${formatNextRun(createdAtMs)}
        </div>
        <div class="chip-row" style="margin-top: 8px;">
          <span class="chip">started: ${formatNextRun(startedAtMs)}</span>
          <span class="chip">completed: ${formatNextRun(completedAtMs)}</span>
          <span class="chip">duration: ${entry.duration_ms != null ? formatMs(entry.duration_ms) : "n/a"}</span>
        </div>
        ${
          entry.error
            ? html`<div class="callout danger" style="margin-top: 10px;">${entry.error}</div>`
            : nothing
        }
      </div>
      <div class="list-meta">
        <div class="mono">${entry.id}</div>
        <div class="muted">${entry.job_definition_id}</div>
      </div>
    </div>
  `;
}

function renderMeeseeks(props: ScheduleProps) {
  const meeseeks = props.meeseeks ?? [];
  return html`
    <section class="card" style="margin-top: 18px;">
      <div class="card-title">Meeseeks Runtime Agents</div>
      <div class="card-sub">Observed runtime activity, separate from durable schedules.</div>
      ${
        props.meeseeksError
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.meeseeksError}</div>`
          : nothing
      }
      ${
        props.meeseeksLoading
          ? html`
              <div class="muted" style="margin-top: 12px">Loading runtime activity…</div>
            `
          : meeseeks.length === 0
            ? html`
                <div class="muted" style="margin-top: 12px">No meeseeks runtime activity detected.</div>
              `
            : html`
                <div class="table" style="margin-top: 12px;">
                  <div class="table-head">
                    <div>Automation</div>
                    <div>Agent</div>
                    <div>Sessions</div>
                    <div>Platforms</div>
                    <div>Last Seen</div>
                  </div>
                  ${meeseeks.map(
                    (entry) => html`
                      <div class="table-row">
                        <div class="mono">${entry.automationId}</div>
                        <div class="mono">${entry.agentId}</div>
                        <div>${entry.sessionCount}</div>
                        <div>${entry.platforms.join(", ") || "n/a"}</div>
                        <div>
                          ${entry.lastSeenAt ? formatRelativeTimestamp(entry.lastSeenAt) : "n/a"}
                        </div>
                      </div>
                    `,
                  )}
                </div>
              `
      }
    </section>
  `;
}

export function renderSchedules(props: ScheduleProps) {
  const selectedJob =
    props.runsJobId == null ? undefined : props.jobs.find((job) => job.id === props.runsJobId);
  const selectedRunTitle =
    selectedJob?.name?.trim() ||
    selectedJob?.job_name?.trim() ||
    props.runsJobId ||
    "(select a schedule)";
  const orderedRuns = props.runs.toSorted(
    (a, b) => (parseTimestamp(b.created_at) ?? 0) - (parseTimestamp(a.created_at) ?? 0),
  );
  return html`
    <section class="grid grid-cols-2">
      <div class="card">
        <div class="card-title">Schedule Service</div>
        <div class="card-sub">Runtime-owned bindings from job definitions to execution windows.</div>
        <div class="stat-grid" style="margin-top: 16px;">
          <div class="stat">
            <div class="stat-label">Enabled</div>
            <div class="stat-value">${props.status ? (props.status.enabled ? "Yes" : "No") : "n/a"}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Schedules</div>
            <div class="stat-value">${props.status?.jobs ?? "n/a"}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Next run</div>
            <div class="stat-value">${formatNextRun(props.status?.nextWakeAtMs ?? null)}</div>
          </div>
        </div>
        <div class="row" style="margin-top: 12px;">
          <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
            ${props.loading ? "Refreshing…" : "Refresh"}
          </button>
          ${props.error ? html`<span class="muted">${props.error}</span>` : nothing}
        </div>
      </div>
      ${renderForm(props)}
    </section>

    <section class="card" style="margin-top: 18px;">
      <div class="card-title">Schedules</div>
      <div class="card-sub">All persisted runtime schedules.</div>
      ${
        props.jobs.length === 0
          ? html`
              <div class="muted" style="margin-top: 12px">No schedules configured.</div>
            `
          : html`<div class="list" style="margin-top: 12px;">${props.jobs.map((job) => renderScheduleJob(job, props))}</div>`
      }
    </section>

    <section class="card" style="margin-top: 18px;">
      <div class="card-title">Run History</div>
      <div class="card-sub">Recent job runs for ${selectedRunTitle}.</div>
      ${
        props.runsJobId == null
          ? html`
              <div class="muted" style="margin-top: 12px">Select a schedule to inspect run history.</div>
            `
          : orderedRuns.length === 0
            ? html`
                <div class="muted" style="margin-top: 12px">No runs yet.</div>
              `
            : html`<div class="list" style="margin-top: 12px;">${orderedRuns.map((entry) => renderRun(entry))}</div>`
      }
    </section>

    ${renderMeeseeks(props)}
  `;
}
