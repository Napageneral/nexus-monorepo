import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, afterEach, describe, expect, test } from "vitest";
import {
  __resetPipelineStoreForTests,
  getOverviewData,
  getPipelineStatus,
  ingestMetricRows,
  triggerPipelineRun,
} from "./store";

let tempDir = "";
let ledgerPath = "";

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "glowbot-pipeline-test-"));
  ledgerPath = path.join(tempDir, "ledger.sqlite");
  process.env.GLOWBOT_LEDGER_PATH = ledgerPath;
  __resetPipelineStoreForTests();
});

afterEach(() => {
  __resetPipelineStoreForTests();
  delete process.env.GLOWBOT_LEDGER_PATH;
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("pipeline runtime store", () => {
  test("triggerPipelineRun executes and returns a run id", () => {
    const trigger = triggerPipelineRun();
    expect(trigger.status).toBe("started");
    expect(trigger.runId).toContain("run-");

    const status = getPipelineStatus();
    expect(status.lastCompletedRun.id).toBe(trigger.runId);
    expect(status.lastCompletedRun.metricsComputed).toBeGreaterThan(0);
    expect(status.lastCompletedRun.recommendationsGenerated).toBeGreaterThanOrEqual(0);
    expect(status.schedule).toBe("every 6 hours");
  });

  test("getPipelineStatus auto-initializes when no run exists yet", () => {
    const status = getPipelineStatus();
    expect(status.currentRun).toBeNull();
    expect(status.lastCompletedRun.id).toContain("run-");
    expect(status.lastCompletedRun.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
    expect(status.nextScheduledRun).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
  });

  test("nextScheduledRun is durable between reads until the next run", () => {
    const first = getPipelineStatus();
    const second = getPipelineStatus();
    expect(second.nextScheduledRun).toBe(first.nextScheduledRun);
  });

  test("ingests uploaded metrics and uses them in overview output", () => {
    const ingest = ingestMetricRows([
      {
        date: "2026-02-10",
        adapterId: "patient-now-emr",
        metricName: "appointments_completed",
        metricValue: 18,
      },
      {
        date: "2026-01-10",
        adapterId: "patient-now-emr",
        metricName: "appointments_completed",
        metricValue: 12,
      },
    ]);
    expect(ingest.upserted).toBe(2);
    expect(ingest.total).toBe(2);

    triggerPipelineRun();
    const overview = getOverviewData("30d");
    expect(overview.heroStat.value).toBeGreaterThan(0);
    expect(overview.heroStat.delta).toBeGreaterThanOrEqual(0);
  });
});
