import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import attributionPipelineReplay from "./pipeline-replay.js";
import { listPipelineRuns, startPipelineRun, withAttributionDb } from "../storage/store.js";

const { replayBoundRecords } = vi.hoisted(() => ({
  replayBoundRecords: vi.fn(),
}));

vi.mock("../pipeline/processor.js", () => ({
  replayBoundRecords,
}));

function createTempDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "attribution-pipeline-replay-"));
}

function removeTempDataDir(dataDir: string): void {
  fs.rmSync(dataDir, { recursive: true, force: true });
}

describe("attribution pipeline replay job", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("finishes a queued pipeline run with replay stats", async () => {
    const dataDir = createTempDataDir();
    try {
      const run = withAttributionDb(dataDir, (db) =>
        startPipelineRun(db, {
          scopeId: "scope-1",
          trigger: "manual",
        }),
      );
      replayBoundRecords.mockResolvedValue({
        records_seen: 4,
        processed: 4,
        updated: 4,
      });

      const result = await attributionPipelineReplay({
        job: {
          id: "job-1",
          name: "attribution.pipeline_replay",
          description: null,
          config: { data_dir: dataDir },
        },
        run: {
          id: "job-run-1",
          trigger_source: "manual",
          created_at: new Date().toISOString(),
        },
        input: {
          pipeline_run_id: run.runId,
          scope_id: "scope-1",
          limit_per_platform: 123,
        },
        nex: { records: {} },
        invoke: vi.fn(),
        runtime: { callMethod: vi.fn() },
        log: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
        now: new Date(),
      } as never);

      expect(replayBoundRecords).toHaveBeenCalledWith({
        runtime: expect.any(Object),
        dataDir,
        scopeId: "scope-1",
        limitPerPlatform: 123,
      });
      expect(result.run).toMatchObject({
        runId: run.runId,
        status: "completed",
      });

      const latestRun = withAttributionDb(dataDir, (db) =>
        listPipelineRuns(db, { scopeId: "scope-1", limit: 1 })[0],
      );
      expect(latestRun).toMatchObject({
        runId: run.runId,
        status: "completed",
      });
      expect(latestRun.stats).toMatchObject({
        records_seen: 4,
        processed: 4,
        updated: 4,
      });
    } finally {
      removeTempDataDir(dataDir);
    }
  });
});
