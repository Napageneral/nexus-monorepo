import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { handle } from "./pipeline-trigger.js";
import { listPipelineRuns, startPipelineRun, withAttributionDb } from "../storage/store.js";

const { ensureAttributionManualReplayJob } = vi.hoisted(() => ({
  ensureAttributionManualReplayJob: vi.fn(),
}));

vi.mock("../hooks/runtime-work.js", () => ({
  ensureAttributionManualReplayJob,
}));

function createTempDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "attribution-pipeline-trigger-"));
}

function removeTempDataDir(dataDir: string): void {
  fs.rmSync(dataDir, { recursive: true, force: true });
}

describe("attribution.pipeline.trigger", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("queues a background replay job and marks the local pipeline run running", async () => {
    const dataDir = createTempDataDir();
    try {
      ensureAttributionManualReplayJob.mockResolvedValue({
        id: "job-replay-1",
        name: "attribution.pipeline_replay",
      });
      const invoke = vi.fn().mockResolvedValue({
        run: { id: "job-run-1", status: "queued" },
        queue_entry: { id: "queue-1", queue_status: "queued" },
      });

      const result = await handle({
        params: {
          scope_id: "scope-1",
          limit_per_platform: 250,
        },
        app: {
          id: "app-1",
          dataDir,
        },
        nex: {
          jobs: { invoke },
        },
      } as never);

      expect(ensureAttributionManualReplayJob).toHaveBeenCalledWith({
        runtime: expect.any(Object),
        appId: "app-1",
        dataDir,
      });
      expect(invoke).toHaveBeenCalledWith({
        job_id: "job-replay-1",
        trigger_source: "manual",
        input: {
          pipeline_run_id: result.run.runId,
          scope_id: "scope-1",
          limit_per_platform: 250,
        },
      });
      expect(result.status).toBe("started");
      expect(result.job_run).toMatchObject({ id: "job-run-1" });
      expect(result.queue_entry).toMatchObject({ id: "queue-1" });

      const latestRun = withAttributionDb(dataDir, (db) =>
        listPipelineRuns(db, { scopeId: "scope-1", limit: 1 })[0],
      );
      expect(latestRun).toMatchObject({
        runId: result.run.runId,
        scopeId: "scope-1",
        trigger: "manual",
        status: "running",
      });
    } finally {
      removeTempDataDir(dataDir);
    }
  });

  it("marks the local pipeline run failed when job enqueue fails", async () => {
    const dataDir = createTempDataDir();
    try {
      ensureAttributionManualReplayJob.mockResolvedValue({
        id: "job-replay-1",
        name: "attribution.pipeline_replay",
      });
      const invoke = vi.fn().mockRejectedValue(new Error("queue unavailable"));

      const result = await handle({
        params: {
          scope_id: "scope-2",
        },
        app: {
          id: "app-1",
          dataDir,
        },
        nex: {
          jobs: { invoke },
        },
      } as never);

      expect(result.error).toBe("queue unavailable");
      expect(result.run).toMatchObject({
        scopeId: "scope-2",
        status: "failed",
        errorMessage: "queue unavailable",
      });
    } finally {
      removeTempDataDir(dataDir);
    }
  });

  it("does not enqueue another replay while the latest run is still running", async () => {
    const dataDir = createTempDataDir();
    try {
      const activeRun = withAttributionDb(dataDir, (db) =>
        startPipelineRun(db, {
          scopeId: "scope-3",
          trigger: "manual",
        }),
      );
      const invoke = vi.fn();

      const result = await handle({
        params: {
          scope_id: "scope-3",
        },
        app: {
          id: "app-1",
          dataDir,
        },
        nex: {
          jobs: { invoke },
        },
      } as never);

      expect(ensureAttributionManualReplayJob).not.toHaveBeenCalled();
      expect(invoke).not.toHaveBeenCalled();
      expect(result).toEqual({
        status: "already_running",
        run: expect.objectContaining({
          runId: activeRun.runId,
          scopeId: "scope-3",
          status: "running",
        }),
      });
    } finally {
      removeTempDataDir(dataDir);
    }
  });
});
