import { html, type TemplateResult } from "lit";
import type { AutomationsViewProps } from "./automations-view.ts";
import { renderAutomationsView } from "./automations-view.ts";

export type OperationsSubTab = "overview" | "schedules";

export type OperationsViewProps = {
  subTab: OperationsSubTab;
  onSubTabChange: (sub: OperationsSubTab) => void;
  automationsProps: AutomationsViewProps;
};

export function renderOperationsView(props: OperationsViewProps): TemplateResult {
  const scheduleStatus = props.automationsProps.scheduleProps.status;
  const scheduleRuns = props.automationsProps.scheduleProps.runs;
  const meeseeks = props.automationsProps.scheduleProps.meeseeks ?? [];
  const recentJobs = props.automationsProps.scheduleProps.jobs.slice(0, 5);

  return html`
    <div class="automations-view">
      <div class="sub-tabs">
        <button
          class="sub-tab ${props.subTab === "overview" ? "active" : ""}"
          @click=${() => props.onSubTabChange("overview")}
        >
          <span class="sub-tab__text">Overview</span>
          <span class="sub-tab__desc">Unified execution view across queue, jobs, schedules, and runtime triggers</span>
        </button>
        <button
          class="sub-tab ${props.subTab === "schedules" ? "active" : ""}"
          @click=${() => props.onSubTabChange("schedules")}
        >
          <span class="sub-tab__text">Jobs & Schedules</span>
          <span class="sub-tab__desc">Job definitions, schedules, triggers, and runtime run evidence</span>
        </button>
      </div>

      <div class="automations-view__content">
        ${
          props.subTab === "overview"
            ? html`
                <section class="grid grid-cols-3" style="gap: 12px;">
                  <div class="card">
                    <div class="card-title">Scheduled Jobs</div>
                    <div class="mono" style="font-size: 24px; margin-top: 6px;">
                      ${props.automationsProps.scheduleProps.jobs.length}
                    </div>
                    <div class="muted" style="margin-top: 8px;">
                      enabled ${props.automationsProps.scheduleProps.jobs.filter((job) => job.enabled).length}
                      · disabled ${props.automationsProps.scheduleProps.jobs.filter((job) => !job.enabled).length}
                    </div>
                  </div>
                  <div class="card">
                    <div class="card-title">Runtime Schedules</div>
                    <div class="mono" style="font-size: 24px; margin-top: 6px;">
                      ${scheduleStatus?.jobs ?? props.automationsProps.scheduleProps.jobs.length}
                    </div>
                    <div class="muted" style="margin-top: 8px;">
                      ${scheduleStatus?.enabled ? "scheduler enabled" : "scheduler disabled"} · next wake ${
                        scheduleStatus?.nextWakeAtMs
                          ? new Date(scheduleStatus.nextWakeAtMs).toLocaleString()
                          : "n/a"
                      }
                    </div>
                  </div>
                  <div class="card">
                    <div class="card-title">Runtime Agents</div>
                    <div class="mono" style="font-size: 24px; margin-top: 6px;">${meeseeks.length}</div>
                    <div class="muted" style="margin-top: 8px;">
                      meeseeks/session-backed runtime triggers currently observed
                    </div>
                  </div>
                </section>

                <section class="grid grid-cols-2" style="gap: 12px; margin-top: 12px;">
                  <section class="card">
                    <div class="card-title">Canonical Runtime Work</div>
                    <div class="card-sub">Operations are built on jobs, schedules, DAGs, event subscriptions, and agent configs.</div>
                    <div class="muted" style="margin-top: 12px;">
                      Legacy <code>work.tasks.*</code>, <code>work.items.*</code>, <code>work.workflows.*</code>, <code>work.sequences.*</code>,
                      <code>work.campaigns.*</code>, <code>work.dashboard.*</code>, and <code>work.entities.*</code> surfaces were hard-cut.
                    </div>
                    <div class="muted" style="margin-top: 12px;">
                      Use the Jobs & Schedules subtab for live runtime job bindings and runtime-agent triggers.
                    </div>
                  </section>
                  <section class="card">
                    <div class="card-title">Recent Job Bindings</div>
                    <div class="card-sub">Schedules, job definitions, and recent runtime run probes.</div>
                    ${
                      recentJobs.length === 0
                        ? html`
                            <div class="muted" style="margin-top: 12px">No schedules loaded.</div>
                          `
                        : html`
                            <div class="list" style="margin-top: 12px;">
                              ${recentJobs.map(
                                (job) => html`
                                  <div class="list-item">
                                    <div class="list-main">
                                      <div class="list-title">${job.name || job.job_name || job.job_definition_id}</div>
                                      <div class="list-sub">${job.job_definition_id}</div>
                                    </div>
                                    <div class="list-meta">
                                      <div>${job.enabled ? "enabled" : "disabled"}</div>
                                      <div class="muted">${job.next_run_at || "no next run"}</div>
                                    </div>
                                  </div>
                                `,
                              )}
                            </div>
                          `
                    }
                  </section>
                </section>
              `
            : renderAutomationsView(props.automationsProps)
        }
      </div>
    </div>
  `;
}
