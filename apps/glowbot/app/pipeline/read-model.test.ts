import { describe, expect, test, vi } from "vitest";
import {
  getAgentsData,
  getAgentsRecommendations,
  getFunnelData,
  getModelingData,
  getOverviewData,
  getPipelineStatus,
  triggerPipelineRun,
} from "./read-model.js";
import type { RuntimeMethodCaller } from "./registry.js";

type MetricFixture = {
  connectionId: string;
  adapterId: string;
  metricName: string;
  metricValue: number;
  date: string;
  metadataKey?: string;
};

function makeMetricElement(metric: MetricFixture) {
  return {
    id: `${metric.connectionId}:${metric.adapterId}:${metric.metricName}:${metric.date}:${metric.metadataKey ?? ""}`,
    type: "metric",
    metadata: JSON.stringify({
      connection_id: metric.connectionId,
      adapter_id: metric.adapterId,
      metric_name: metric.metricName,
      metric_value: metric.metricValue,
      date: metric.date,
      metadata_key: metric.metadataKey ?? "",
    }),
  };
}

function createRuntime(params?: {
  metrics?: MetricFixture[];
  runs?: Array<Record<string, unknown>>;
  nextRunAt?: string;
}) {
  const metrics = (params?.metrics ?? []).map(makeMetricElement);
  const jobsInvoke = vi.fn(async () => ({
    run: {
      id: "jobrun-manual-1",
      status: "pending",
    },
  }));

  const runtime: RuntimeMethodCaller = {
    callMethod: async (method, input) => {
      if (method === "memory.elements.list") {
        const record = (input ?? {}) as Record<string, unknown>;
        const offset = typeof record.offset === "number" ? record.offset : 0;
        const limit = typeof record.limit === "number" ? record.limit : 100;
        return {
          elements: metrics.slice(offset, offset + limit),
        };
      }
      if (method === "jobs.list") {
        return {
          jobs: [
            {
              id: "jobdef-metric-extract",
              name: "metric_extract",
            },
          ],
        };
      }
      if (method === "jobs.runs.list") {
        return {
          runs: params?.runs ?? [],
        };
      }
      if (method === "schedules.list") {
        return {
          schedules: [
            {
              id: "schedule-1",
              name: "glowbot.metric_extract",
              next_run_at: params?.nextRunAt ?? "2026-03-07T00:00:00.000Z",
            },
          ],
        };
      }
      if (method === "jobs.invoke") {
        return jobsInvoke(input);
      }
      throw new Error(`unexpected method ${method}`);
    },
  };

  return {
    runtime,
    jobsInvoke,
  };
}

function createBenchmarkContext() {
  const operations: Array<{ operation: string; payload: Record<string, unknown> }> = [];
  return {
    benchmarkContext: {
      clinicId: "clinic-123",
      clinicProfile: {
        clinicId: "clinic-123",
        specialty: "med-spa",
        monthlyAdSpendBand: "10k-25k",
        patientVolumeBand: "100-250",
        locationCountBand: "single",
        source: {
          updatedAtMs: 1700000000000,
          updatedBy: "clinic_app" as const,
          version: 1,
        },
      },
      callProductControlPlane: vi.fn(async (operation: string, payload: Record<string, unknown>) => {
        operations.push({ operation, payload });
        if (operation === "glowbotHub.clinicProfiles.resolve") {
          return {
            clinicProfile: payload.clinicProfile,
            profileKey: "med-spa|10k-25k|100-250|single",
          };
        }
        if (operation === "glowbotHub.benchmarks.publishSnapshot") {
          return {
            snapshotId: "snapshot-1",
            profileKey: "med-spa|10k-25k|100-250|single",
          };
        }
        if (operation === "glowbotHub.benchmarks.query") {
          return {
            records: [
              {
                metricName: "impressions_to_clicks",
                peerMedian: 0.08,
                peerP25: 0.07,
                peerP75: 0.09,
                sampleSize: 12,
                source: "industry_seed",
                freshnessMs: 1000,
              },
              {
                metricName: "bookings_to_consults",
                peerMedian: 0.7,
                peerP25: 0.62,
                peerP75: 0.76,
                sampleSize: 12,
                source: "industry_seed",
                freshnessMs: 1000,
              },
              {
                metricName: "review_velocity",
                peerMedian: 10,
                peerP25: 8,
                peerP75: 12,
                sampleSize: 12,
                source: "industry_seed",
                freshnessMs: 1000,
              },
              {
                metricName: "no_show_rate",
                peerMedian: 0.12,
                peerP25: 0.08,
                peerP75: 0.16,
                sampleSize: 12,
                source: "industry_seed",
                freshnessMs: 1000,
              },
            ],
          };
        }
        throw new Error(`unexpected product control plane operation ${operation}`);
      }),
    },
    operations,
  };
}

const METRICS: MetricFixture[] = [
  { connectionId: "conn-google-a", adapterId: "google-ads", metricName: "ad_spend", metricValue: 2500, date: "2026-01-05" },
  { connectionId: "conn-meta-a", adapterId: "meta-ads", metricName: "ad_spend", metricValue: 1200, date: "2026-01-06" },
  { connectionId: "conn-google-a", adapterId: "google-ads", metricName: "ad_impressions", metricValue: 50000, date: "2026-01-05" },
  { connectionId: "conn-meta-a", adapterId: "meta-ads", metricName: "ad_impressions", metricValue: 27000, date: "2026-01-06" },
  { connectionId: "conn-google-biz", adapterId: "google-business-profile", metricName: "listing_views_search", metricValue: 4800, date: "2026-01-10" },
  { connectionId: "conn-google-biz", adapterId: "google-business-profile", metricName: "listing_views_maps", metricValue: 2500, date: "2026-01-10" },
  { connectionId: "conn-google-a", adapterId: "google-ads", metricName: "ad_clicks", metricValue: 3600, date: "2026-01-05" },
  { connectionId: "conn-meta-a", adapterId: "meta-ads", metricName: "ad_clicks", metricValue: 1850, date: "2026-01-06" },
  { connectionId: "conn-google-biz", adapterId: "google-business-profile", metricName: "listing_clicks_website", metricValue: 420, date: "2026-01-10" },
  { connectionId: "conn-google-biz", adapterId: "google-business-profile", metricName: "listing_clicks_directions", metricValue: 290, date: "2026-01-10" },
  { connectionId: "conn-google-biz", adapterId: "google-business-profile", metricName: "listing_clicks_phone", metricValue: 260, date: "2026-01-10" },
  { connectionId: "conn-pn", adapterId: "patient-now-emr", metricName: "appointments_booked", metricValue: 140, date: "2026-01-12" },
  { connectionId: "conn-zenoti", adapterId: "zenoti-emr", metricName: "appointments_booked", metricValue: 30, date: "2026-01-13" },
  { connectionId: "conn-pn", adapterId: "patient-now-emr", metricName: "appointments_completed", metricValue: 110, date: "2026-01-12" },
  { connectionId: "conn-zenoti", adapterId: "zenoti-emr", metricName: "appointments_completed", metricValue: 20, date: "2026-01-13" },
  { connectionId: "conn-pn", adapterId: "patient-now-emr", metricName: "revenue", metricValue: 38000, date: "2026-01-15" },
  { connectionId: "conn-zenoti", adapterId: "zenoti-emr", metricName: "revenue", metricValue: 7000, date: "2026-01-15" },
  { connectionId: "conn-google-a", adapterId: "google-ads", metricName: "ad_spend", metricValue: 3200, date: "2026-02-05" },
  { connectionId: "conn-google-b", adapterId: "google-ads", metricName: "ad_spend", metricValue: 800, date: "2026-02-05", metadataKey: "secondary" },
  { connectionId: "conn-meta-a", adapterId: "meta-ads", metricName: "ad_spend", metricValue: 1500, date: "2026-02-06" },
  { connectionId: "conn-google-a", adapterId: "google-ads", metricName: "ad_impressions", metricValue: 61000, date: "2026-02-05" },
  { connectionId: "conn-meta-a", adapterId: "meta-ads", metricName: "ad_impressions", metricValue: 34000, date: "2026-02-06" },
  { connectionId: "conn-google-biz", adapterId: "google-business-profile", metricName: "listing_views_search", metricValue: 6200, date: "2026-02-10" },
  { connectionId: "conn-google-biz", adapterId: "google-business-profile", metricName: "listing_views_maps", metricValue: 3200, date: "2026-02-10" },
  { connectionId: "conn-google-a", adapterId: "google-ads", metricName: "ad_clicks", metricValue: 4700, date: "2026-02-05" },
  { connectionId: "conn-meta-a", adapterId: "meta-ads", metricName: "ad_clicks", metricValue: 2300, date: "2026-02-06" },
  { connectionId: "conn-google-biz", adapterId: "google-business-profile", metricName: "listing_clicks_website", metricValue: 560, date: "2026-02-10" },
  { connectionId: "conn-google-biz", adapterId: "google-business-profile", metricName: "listing_clicks_directions", metricValue: 360, date: "2026-02-10" },
  { connectionId: "conn-google-biz", adapterId: "google-business-profile", metricName: "listing_clicks_phone", metricValue: 310, date: "2026-02-10" },
  { connectionId: "conn-pn", adapterId: "patient-now-emr", metricName: "appointments_booked", metricValue: 180, date: "2026-02-12" },
  { connectionId: "conn-zenoti", adapterId: "zenoti-emr", metricName: "appointments_booked", metricValue: 40, date: "2026-02-13" },
  { connectionId: "conn-pn", adapterId: "patient-now-emr", metricName: "appointments_completed", metricValue: 150, date: "2026-02-12" },
  { connectionId: "conn-zenoti", adapterId: "zenoti-emr", metricName: "appointments_completed", metricValue: 25, date: "2026-02-13" },
  { connectionId: "conn-pn", adapterId: "patient-now-emr", metricName: "revenue", metricValue: 52000, date: "2026-02-15" },
  { connectionId: "conn-zenoti", adapterId: "zenoti-emr", metricName: "revenue", metricValue: 9000, date: "2026-02-15" },
];

describe("read model", () => {
  test("computes overview, funnel, modeling, and agent views from metric elements", async () => {
    const { runtime } = createRuntime({
      metrics: METRICS,
      runs: [
        {
          id: "jobrun-completed-1",
          status: "completed",
          created_at: "2026-03-06T00:00:00.000Z",
          started_at: "2026-03-06T00:00:00.000Z",
          completed_at: "2026-03-06T00:00:10.000Z",
          duration_ms: 10000,
          output_json: JSON.stringify({ created: 24, updated: 0, skipped: 8, processed: 32 }),
        },
      ],
    });
    const { benchmarkContext, operations } = createBenchmarkContext();

    const overview = await getOverviewData(runtime, "30d", benchmarkContext);
    expect(overview.heroStat.value).toBe(175);
    expect(overview.topActions.length).toBeGreaterThan(0);

    const funnel = await getFunnelData(runtime, "30d", benchmarkContext);
    expect(funnel.steps.length).toBeGreaterThan(0);
    expect(funnel.steps[0]?.name).toBe("ad_spend");
    expect(funnel.weakestStep).not.toBeNull();
    expect(funnel.steps.find((step) => step.name === "clicks")?.peerMedian).toBe(0.08);

    const modeling = await getModelingData(runtime, {
      model: "ad_spend_to_consults",
      window: "6m",
    }, benchmarkContext);
    expect(modeling.series.length).toBeGreaterThan(0);

    const recommendations = await getAgentsRecommendations(runtime, { limit: 4 }, benchmarkContext);
    expect(recommendations.recommendations.length).toBeGreaterThan(0);

    const agents = await getAgentsData(runtime, benchmarkContext);
    expect(agents.agents).toHaveLength(5);
    expect(agents.lastPipelineRun.id).toBe("jobrun-completed-1");
    expect(operations.some((entry) => entry.operation === "glowbotHub.benchmarks.publishSnapshot")).toBe(true);
    expect(operations.some((entry) => entry.operation === "glowbotHub.benchmarks.query")).toBe(true);
  });

  test("reads pipeline status from job runs and schedules and can trigger a manual run", async () => {
    const { runtime, jobsInvoke } = createRuntime({
      metrics: METRICS,
      runs: [
        {
          id: "jobrun-running-1",
          status: "running",
          created_at: "2026-03-06T01:00:00.000Z",
          started_at: "2026-03-06T01:00:01.000Z",
          output_json: JSON.stringify({ created: 4, updated: 1, skipped: 0, processed: 5 }),
        },
        {
          id: "jobrun-completed-1",
          status: "completed",
          created_at: "2026-03-06T00:00:00.000Z",
          started_at: "2026-03-06T00:00:00.000Z",
          completed_at: "2026-03-06T00:00:05.000Z",
          duration_ms: 5000,
          output_json: JSON.stringify({ created: 24, updated: 0, skipped: 8, processed: 32 }),
        },
      ],
      nextRunAt: "2026-03-06T06:00:00.000Z",
    });

    const status = await getPipelineStatus(runtime);
    expect(status.currentRun?.id).toBe("jobrun-running-1");
    expect(status.lastCompletedRun.id).toBe("jobrun-completed-1");
    expect(status.nextScheduledRun).toBe("2026-03-06T06:00:00.000Z");

    const trigger = await triggerPipelineRun(runtime);
    expect(trigger.status).toBe("started");
    expect(trigger.runId).toBe("jobrun-manual-1");
    expect(jobsInvoke).toHaveBeenCalledTimes(1);
  });
});
