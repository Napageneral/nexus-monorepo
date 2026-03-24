import { html, nothing, type TemplateResult } from "lit";
import type { ScheduleJob } from "../types.ts";
import type { ScheduleProps } from "./schedules.ts";
import { formatScheduleSpec, formatNextRun } from "../presenter.ts";

export type AutomationsSubTab = "schedule" | "automations";

export type AutomationsViewProps = {
  subTab: AutomationsSubTab;
  onSubTabChange: (sub: AutomationsSubTab) => void;
  scheduleProps: ScheduleProps;
};

type CalendarDay = {
  key: string;
  date: Date;
  jobs: ScheduleJob[];
  inRange: boolean;
};

export function renderAutomationsView(props: AutomationsViewProps): TemplateResult {
  return html`
    <div class="automations-view">
      <div class="sub-tabs">
        <button
          class="sub-tab ${props.subTab === "schedule" ? "active" : ""}"
          @click=${() => props.onSubTabChange("schedule")}
        >
          <span class="sub-tab__text">Schedules</span>
          <span class="sub-tab__desc">Calendar, job bindings, and upcoming scheduled executions</span>
        </button>
        <button
          class="sub-tab ${props.subTab === "automations" ? "active" : ""}"
          @click=${() => props.onSubTabChange("automations")}
        >
          <span class="sub-tab__text">Runtime Agents</span>
          <span class="sub-tab__desc">Session-backed runtime triggers and meeseeks activity</span>
        </button>
      </div>

      <div class="automations-view__content">
        ${props.subTab === "schedule" ? renderScheduleTab(props.scheduleProps) : nothing}
        ${props.subTab === "automations" ? renderAutomationsTab(props.scheduleProps) : nothing}
      </div>
    </div>
  `;
}

function renderScheduleTab(props: ScheduleProps): TemplateResult {
  const days = buildCalendarDays(props.jobs, 28);
  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const upcoming = props.jobs
    .filter((job) => typeof parseTimestamp(job.next_run_at) === "number")
    .toSorted(
      (a, b) => (parseTimestamp(a.next_run_at) ?? 0) - (parseTimestamp(b.next_run_at) ?? 0),
    );
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Schedule Calendar</div>
          <div class="card-sub">Next 4 weeks of scheduled work across all active jobs.</div>
        </div>
        <button class="btn btn--sm" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      ${props.error ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>` : nothing}
      <div class="automation-calendar" style="margin-top: 14px;">
        ${weekdayLabels.map((label) => html`<div class="automation-calendar__weekday">${label}</div>`)}
        ${days.map((day) => {
          const label = day.date.getDate();
          const isToday = isSameDay(day.date, new Date());
          return html`
            <div class="automation-calendar__day ${isToday ? "is-today" : ""}">
              <div class="automation-calendar__label">${label}</div>
              <div class="automation-calendar__count">${day.jobs.length > 0 ? `${day.jobs.length}` : ""}</div>
            </div>
          `;
        })}
      </div>
    </section>

    <section class="card" style="margin-top: 12px;">
      <div class="card-title">Upcoming Jobs</div>
      <div class="card-sub">Jobs are sorted by next planned execution time.</div>
      ${
        upcoming.length === 0
          ? html`
              <div class="muted" style="margin-top: 12px">No upcoming jobs found.</div>
            `
          : html`
              <div class="list" style="margin-top: 12px;">
                ${upcoming.map((job) => renderJobRow(job, props))}
              </div>
            `
      }
    </section>
  `;
}

function renderAutomationsTab(props: ScheduleProps): TemplateResult {
  const runtimeMeeseeks = props.meeseeks ?? [];
  const meeseeksJobs = props.jobs.filter((job) => {
    const name = (job.name ?? job.job_name ?? "").trim().toLowerCase();
    const desc = (job.job_description ?? "").trim().toLowerCase();
    return name.includes("meeseeks") || desc.includes("meeseeks");
  });
  const standardJobs = props.jobs.filter((job) => !meeseeksJobs.includes(job));
  const meeseeksTotal = Math.max(runtimeMeeseeks.length, meeseeksJobs.length);
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Trigger Catalog</div>
          <div class="card-sub">Runtime agents, scheduled jobs, and trigger-bound execution detail.</div>
        </div>
        <button class="btn btn--sm" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <div class="row" style="gap: 8px; margin-top: 12px; flex-wrap: wrap;">
        <span class="pill">Total: ${props.jobs.length}</span>
        <span class="pill ok">Enabled: ${props.jobs.filter((job) => job.enabled).length}</span>
        <span class="pill">Meeseeks: ${meeseeksTotal}</span>
      </div>
    </section>
    <section class="card" style="margin-top: 12px;">
      <div class="card-title">Meeseeks Runtime Agents</div>
      <div class="card-sub">Detected from meeseeks runtime sessions.</div>
      ${props.meeseeksError ? html`<div class="callout danger" style="margin-top: 10px;">${props.meeseeksError}</div>` : nothing}
      ${
        props.meeseeksLoading
          ? html`
              <div class="muted" style="margin-top: 12px">Loading meeseeks runtime activity...</div>
            `
          : runtimeMeeseeks.length === 0
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
                  ${runtimeMeeseeks.map(
                    (entry) => html`
                      <div class="table-row">
                        <div class="mono">${entry.automationId}</div>
                        <div class="mono">${entry.agentId}</div>
                        <div>${entry.sessionCount}</div>
                        <div>${entry.platforms.join(", ") || "n/a"}</div>
                        <div>${formatNextRun(entry.lastSeenAt)}</div>
                      </div>
                    `,
                  )}
                </div>
              `
      }
    </section>
    <section class="card" style="margin-top: 12px;">
      <div class="card-title">Scheduled Jobs</div>
      <div class="card-sub">Every configured schedule and durable trigger target.</div>
      ${
        props.jobs.length === 0
          ? html`
              <div class="muted" style="margin-top: 12px">No scheduled jobs configured.</div>
            `
          : standardJobs.length === 0
            ? html`
                <div class="muted" style="margin-top: 12px">
                  All configured jobs are runtime-agent-backed triggers.
                </div>
              `
            : html`<div class="list" style="margin-top: 12px;">${standardJobs.map((job) => renderJobRow(job, props))}</div>`
      }
    </section>
  `;
}

function renderJobRow(job: ScheduleJob, props: ScheduleProps): TemplateResult {
  const busy = props.busy;
  const title = job.name ?? job.job_name ?? job.job_definition_id;
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">${title}</div>
        ${job.job_description ? html`<div class="list-sub">${job.job_description}</div>` : nothing}
        <div class="chip-row" style="margin-top: 8px;">
          <span class="chip">${formatScheduleSpec(job)}</span>
          <span class="chip ${job.enabled ? "chip-ok" : "chip-warn"}">${job.enabled ? "enabled" : "disabled"}</span>
          <span class="chip">next: ${formatNextRun(parseTimestamp(job.next_run_at))}</span>
        </div>
      </div>
      <div class="list-actions">
        <button class="btn btn--sm" ?disabled=${busy} @click=${() => props.onToggle(job, !job.enabled)}>
          ${job.enabled ? "Disable" : "Enable"}
        </button>
        <button class="btn btn--sm" ?disabled=${busy} @click=${() => props.onRun(job)}>Run</button>
      </div>
    </div>
  `;
}

function buildCalendarDays(jobs: ScheduleJob[], horizonDays: number): CalendarDay[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const map = new Map<string, ScheduleJob[]>();

  for (const job of jobs) {
    const nextRun = parseTimestamp(job.next_run_at);
    if (!nextRun || !Number.isFinite(nextRun)) {
      continue;
    }
    const date = new Date(nextRun);
    date.setHours(0, 0, 0, 0);
    const key = date.toISOString().slice(0, 10);
    const list = map.get(key) ?? [];
    list.push(job);
    map.set(key, list);
  }

  const out: CalendarDay[] = [];
  for (let i = 0; i < horizonDays; i += 1) {
    const date = new Date(now.getTime());
    date.setDate(now.getDate() + i);
    const key = date.toISOString().slice(0, 10);
    out.push({
      key,
      date,
      jobs: map.get(key) ?? [],
      inRange: true,
    });
  }
  return out;
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
