import { describe, expect, it, vi } from "vitest";
import { loadScheduleJobs, type AutomationMeeseeksEntry, type JobQueueEntry } from "./schedules.ts";
import type { JobDefinition, ScheduleJob, ScheduleRunLogEntry, ScheduleStatus } from "../types.ts";
import type { ScheduleFormState } from "../ui-types.ts";

function createState(request: (method: string, params?: unknown) => Promise<unknown>) {
  return {
    client: {
      request: request as <T>(method: string, params?: unknown) => Promise<T>,
    },
    connected: true,
    scheduleLoading: false,
    scheduleJobDefinitions: [] as JobDefinition[],
    scheduleJobs: [] as ScheduleJob[],
    scheduleStatus: null as ScheduleStatus | null,
    scheduleError: null as string | null,
    scheduleForm: {} as ScheduleFormState,
    scheduleRunsJobId: null as string | null,
    scheduleRuns: [] as ScheduleRunLogEntry[],
    scheduleQueueEntries: [] as JobQueueEntry[],
    scheduleBusy: false,
    automationMeeseeksLoading: false,
    automationMeeseeksError: null as string | null,
    automationMeeseeks: [] as AutomationMeeseeksEntry[],
  };
}

describe("schedules controller", () => {
  it("loads jobs, schedules, runs, and queue together", async () => {
    const request = vi.fn(async (method: string) => {
      switch (method) {
        case "schedules.list":
          return {
            schedules: [
              {
                id: "sched-1",
                job_definition_id: "job-1",
                expression: "*/5 * * * *",
                timezone: null,
                active_from: null,
                active_until: null,
                enabled: 1,
                next_run_at: "2026-04-02T16:00:00.000Z",
                last_run_at: null,
                created_at: "2026-04-02T15:00:00.000Z",
                updated_at: "2026-04-02T15:00:00.000Z",
              },
            ],
          };
        case "jobs.list":
          return {
            jobs: [
              {
                id: "job-1",
                name: "Search projector",
                description: "Index records",
                script_path: "jobs/projector.ts",
                script_hash: null,
                config_json: null,
                status: "active",
                version: 1,
                previous_version_id: null,
                timeout_ms: null,
                workspace_id: null,
                hook_points: null,
                created_by: null,
                created_at: "2026-04-02T15:00:00.000Z",
                updated_at: "2026-04-02T15:00:00.000Z",
              },
            ],
          };
        case "jobs.runs.list":
          return {
            runs: [{ id: "run-1", job_definition_id: "job-1", status: "completed", created_at: "2026-04-02T15:05:00.000Z" }],
          };
        case "jobs.queue.list":
          return {
            queue_entries: [{ id: "queue-1", job_definition_id: "job-1", queue_status: "queued" }],
          };
        default:
          throw new Error(`unexpected method: ${method}`);
      }
    });

    const state = createState(request);
    await loadScheduleJobs(state);

    expect(request.mock.calls.map(([method]) => method).sort()).toEqual([
      "jobs.list",
      "jobs.queue.list",
      "jobs.runs.list",
      "schedules.list",
    ]);
    expect(state.scheduleJobDefinitions).toHaveLength(1);
    expect(state.scheduleJobs).toHaveLength(1);
    expect(state.scheduleRuns).toHaveLength(1);
    expect(state.scheduleQueueEntries).toHaveLength(1);
    expect(state.scheduleRunsJobId).toBeNull();
  });
});
