import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import type { JobDefinition, ScheduleJob, ScheduleRunLogEntry } from "../types.ts";
import { DEFAULT_SCHEDULE_FORM } from "../app-defaults.ts";
import { renderSchedules, type ScheduleProps } from "./schedules.ts";

function createJobDefinition(id: string): JobDefinition {
  return {
    id,
    name: "Daily summary",
    description: "Generate the daily summary bundle.",
    script_path: "/jobs/daily-summary.ts",
    script_hash: null,
    config_json: null,
    status: "active",
    version: 1,
    previous_version_id: null,
    timeout_ms: null,
    workspace_id: "main",
    hook_points: null,
    created_by: null,
    created_at: "2026-03-10T00:00:00.000Z",
    updated_at: "2026-03-10T00:00:00.000Z",
  };
}

function createJob(id: string): ScheduleJob {
  return {
    id,
    name: "Morning summary",
    job_definition_id: "job-daily-summary",
    job_name: "Daily summary",
    job_description: "Generate the daily summary bundle.",
    expression: "0 9 * * *",
    timezone: "America/Chicago",
    active_from: null,
    active_until: null,
    enabled: true,
    next_run_at: "2026-03-11T14:00:00.000Z",
    last_run_at: "2026-03-10T14:00:00.000Z",
    created_at: "2026-03-10T00:00:00.000Z",
    updated_at: "2026-03-10T00:00:00.000Z",
  };
}

function createRun(
  id: string,
  createdAt: string,
  patch: Partial<ScheduleRunLogEntry> = {},
): ScheduleRunLogEntry {
  return {
    id,
    job_definition_id: "job-daily-summary",
    job_schedule_id: "sched-1",
    dag_run_id: null,
    dag_node_id: null,
    status: "succeeded",
    trigger_source: "schedule",
    execution_envelope_json: null,
    input_json: null,
    output_json: null,
    error: null,
    turn_ids: null,
    started_at: createdAt,
    completed_at: createdAt,
    duration_ms: 3200,
    metrics_json: null,
    created_at: createdAt,
    ...patch,
  };
}

function createProps(overrides: Partial<ScheduleProps> = {}): ScheduleProps {
  return {
    loading: false,
    status: null,
    jobDefinitions: [],
    jobs: [],
    error: null,
    busy: false,
    form: { ...DEFAULT_SCHEDULE_FORM },
    runsJobId: null,
    runs: [],
    meeseeksLoading: false,
    meeseeksError: null,
    meeseeks: [],
    onFormChange: () => undefined,
    onRefresh: () => undefined,
    onAdd: () => undefined,
    onToggle: () => undefined,
    onRun: () => undefined,
    onRemove: () => undefined,
    onLoadRuns: () => undefined,
    ...overrides,
  };
}

describe("schedules view", () => {
  it("prompts to select a schedule before showing run history", () => {
    const container = document.createElement("div");
    render(renderSchedules(createProps()), container);

    expect(container.textContent).toContain("Select a schedule to inspect run history.");
  });

  it("renders canonical schedule form fields", () => {
    const container = document.createElement("div");
    render(
      renderSchedules(
        createProps({
          jobDefinitions: [createJobDefinition("job-daily-summary")],
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("Job Definition");
    expect(container.textContent).toContain("Cron Expression");
    expect(container.textContent).not.toContain("Wake mode");
    expect(container.textContent).not.toContain("Payload");
  });

  it("loads run history when clicking the runs button", () => {
    const container = document.createElement("div");
    const onLoadRuns = vi.fn();
    const job = createJob("sched-1");
    render(
      renderSchedules(
        createProps({
          jobs: [job],
          onLoadRuns,
        }),
      ),
      container,
    );

    const button = Array.from(container.querySelectorAll("button")).find(
      (entry) => entry.textContent?.trim() === "Runs",
    );
    expect(button).not.toBeUndefined();
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onLoadRuns).toHaveBeenCalledWith("sched-1");
  });

  it("shows selected schedule title and sorts runs newest first", () => {
    const container = document.createElement("div");
    const job = createJob("sched-1");
    render(
      renderSchedules(
        createProps({
          jobs: [job],
          runsJobId: "sched-1",
          runs: [
            createRun("run-older", "2026-03-10T08:00:00.000Z"),
            createRun("run-newer", "2026-03-10T09:00:00.000Z"),
          ],
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("Recent job runs for Morning summary.");
    const monoIds = Array.from(container.querySelectorAll(".list-item .list-meta .mono")).map(
      (entry) => (entry.textContent ?? "").trim(),
    );
    expect(monoIds[0]).toBe("run-newer");
    expect(monoIds[1]).toBe("run-older");
    expect(container.textContent).toContain("run-newer");
    expect(container.textContent).toContain("run-older");
  });

  it("renders run errors without session deep links", () => {
    const container = document.createElement("div");
    render(
      renderSchedules(
        createProps({
          runsJobId: "sched-1",
          runs: [
            createRun("run-error", "2026-03-10T09:00:00.000Z", {
              status: "failed",
              error: "boom",
            }),
          ],
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("boom");
    expect(container.querySelector("a.session-link")).toBeNull();
  });
});
