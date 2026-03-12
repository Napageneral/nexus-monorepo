import { describe, expect, test } from "vitest";
import { getAgentsRecommendations, getFunnelData } from "../read-model.js";
import funnelCompute from "./funnel-compute.js";
import trendCompute from "./trend-compute.js";
import dropoffDetect from "./dropoff-detect.js";
import recommend from "./recommend.js";
import type { JobScriptContext } from "../../../../../nex/src/nex/control-plane/server-work.js";
import type { RuntimeMethodCaller } from "../registry.js";

type MetricFixture = {
  connectionId: string;
  adapterId: string;
  metricName: string;
  metricValue: number;
  date: string;
  metadataKey?: string;
};

type ElementRow = {
  id: string;
  type: string;
  content: string;
  metadata: Record<string, unknown>;
  entity_id: string | null;
  as_of: number | null;
  parent_id: string | null;
};

function makeMetricElement(metric: MetricFixture): ElementRow {
  return {
    id: `${metric.connectionId}:${metric.adapterId}:${metric.metricName}:${metric.date}:${metric.metadataKey ?? ""}`,
    type: "metric",
    content: `${metric.metricName}=${metric.metricValue}`,
    entity_id: null,
    as_of: Date.parse(`${metric.date}T12:00:00.000Z`),
    parent_id: null,
    metadata: {
      connection_id: metric.connectionId,
      adapter_id: metric.adapterId,
      metric_name: metric.metricName,
      metric_value: metric.metricValue,
      date: metric.date,
      metadata_key: metric.metadataKey ?? "",
    },
  };
}

function primitiveEquals(left: unknown, right: unknown): boolean {
  return left === right;
}

function createRuntime(metrics: MetricFixture[]) {
  const elements = new Map<string, ElementRow>(metrics.map((metric) => {
    const element = makeMetricElement(metric);
    return [element.id, element];
  }));
  const links: Array<{ from: string; to: string; linkType: string }> = [];
  let nextId = 1;

  const runtime: RuntimeMethodCaller = {
    callMethod: async (method, input) => {
      const params = (input ?? {}) as Record<string, unknown>;
      if (method === "memory.elements.list") {
        const type = typeof params.type === "string" ? params.type : "";
        const offset = typeof params.offset === "number" ? params.offset : 0;
        const limit = typeof params.limit === "number" ? params.limit : 100;
        const metadataFilter =
          params.metadataFilter && typeof params.metadataFilter === "object"
            ? (params.metadataFilter as Record<string, unknown>)
            : null;
        const includeStale = params.includeStale === true;
        const staleIds = new Set(
          [...elements.values()].map((entry) => entry.parent_id).filter((entry): entry is string => Boolean(entry)),
        );
        const rows = [...elements.values()]
          .filter((entry) => !type || entry.type === type)
          .filter((entry) => includeStale || !staleIds.has(entry.id))
          .filter((entry) => {
            if (!metadataFilter) {
              return true;
            }
            return Object.entries(metadataFilter).every(([key, value]) =>
              primitiveEquals(entry.metadata[key], value),
            );
          })
          .slice(offset, offset + limit)
          .map((entry) => ({
            id: entry.id,
            type: entry.type,
            content: entry.content,
            metadata: JSON.stringify(entry.metadata),
            entity_id: entry.entity_id,
            as_of: entry.as_of,
            parent_id: entry.parent_id,
          }));
        return { elements: rows };
      }

      if (method === "memory.elements.create") {
        const id = `elem-${nextId++}`;
        const row: ElementRow = {
          id,
          type: String(params.type),
          content: String(params.content),
          metadata:
            params.metadata && typeof params.metadata === "object" && !Array.isArray(params.metadata)
              ? { ...(params.metadata as Record<string, unknown>) }
              : {},
          entity_id: typeof params.entityId === "string" ? params.entityId : null,
          as_of: typeof params.asOf === "number" ? params.asOf : null,
          parent_id: null,
        };
        elements.set(id, row);
        return { element: { id } };
      }

      if (method === "memory.elements.update") {
        const parentId = String(params.id);
        const existing = elements.get(parentId);
        if (!existing) {
          throw new Error(`missing element ${parentId}`);
        }
        const id = `elem-${nextId++}`;
        const row: ElementRow = {
          id,
          type: existing.type,
          content: String(params.content),
          metadata:
            params.metadata && typeof params.metadata === "object" && !Array.isArray(params.metadata)
              ? { ...(params.metadata as Record<string, unknown>) }
              : {},
          entity_id: typeof params.entityId === "string" ? params.entityId : existing.entity_id,
          as_of: typeof params.asOf === "number" ? params.asOf : existing.as_of,
          parent_id: parentId,
        };
        elements.set(id, row);
        return { element: { id } };
      }

      if (method === "memory.elements.links.create") {
        links.push({
          from: String(params.fromElementId),
          to: String(params.toElementId),
          linkType: String(params.linkType),
        });
        return { link: { id: `link-${links.length}` } };
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
        return { runs: [] };
      }

      if (method === "schedules.list") {
        return {
          schedules: [
            {
              id: "schedule-1",
              name: "glowbot.metric_extract",
              next_run_at: "2026-03-07T00:00:00.000Z",
            },
          ],
        };
      }

      if (method === "jobs.invoke") {
        return {
          run: {
            id: "jobrun-manual-1",
            status: "pending",
          },
        };
      }

      throw new Error(`unexpected runtime method ${method}`);
    },
  };

  return {
    runtime,
    elements,
    links,
    updateMetric(params: {
      connectionId: string;
      adapterId: string;
      metricName: string;
      date: string;
      metricValue: number;
      metadataKey?: string;
    }) {
      const id = `${params.connectionId}:${params.adapterId}:${params.metricName}:${params.date}:${params.metadataKey ?? ""}`;
      const existing = elements.get(id);
      if (!existing) {
        throw new Error(`missing metric element ${id}`);
      }
      existing.metadata.metric_value = params.metricValue;
      existing.content = `${params.metricName}=${params.metricValue}`;
      existing.as_of = Date.now();
      elements.set(id, existing);
    },
  };
}

function createJobContext(runtime: RuntimeMethodCaller, jobName: string): JobScriptContext {
  return {
    job: {
      id: `job-${jobName}`,
      name: jobName,
      description: null,
      config: {},
    },
    run: {
      id: `run-${jobName}`,
      trigger_source: "manual",
      created_at: new Date().toISOString(),
    },
    input: {},
    runtime,
    log: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
    now: new Date("2026-03-10T00:00:00.000Z"),
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

describe("derived output materialization", () => {
  test("materializes persisted outputs that match the current on-demand read model", async () => {
    const { runtime, elements, links } = createRuntime(METRICS);

    await funnelCompute(createJobContext(runtime, "funnel_compute"));
    await trendCompute(createJobContext(runtime, "trend_compute"));
    await dropoffDetect(createJobContext(runtime, "dropoff_detect"));
    await recommend(createJobContext(runtime, "recommend"));

    const funnel = await getFunnelData(runtime, "30d");
    const recommendations = await getAgentsRecommendations(runtime, { limit: 8 });

    const currentHeads = [...elements.values()].filter((entry) => {
      return ![...elements.values()].some((candidate) => candidate.parent_id === entry.id);
    });

    const persistedFunnel = currentHeads
      .filter((entry) => entry.type === "funnel_snapshot" && entry.metadata.window === "30d" && entry.metadata.scope_key === "all")
      .sort((left, right) => Number(left.metadata.step_order) - Number(right.metadata.step_order));
    expect(persistedFunnel).toHaveLength(funnel.steps.length);

    for (const step of funnel.steps) {
      const persisted = persistedFunnel.find((entry) => entry.metadata.step_name === step.name);
      expect(persisted).toBeTruthy();
      expect(persisted?.metadata.step_value).toBe(step.value);
      expect(persisted?.metadata.conversion_rate ?? null).toBe(step.conversionRate);
    }

    const persistedRecommendations = currentHeads
      .filter(
        (entry) =>
          entry.type === "recommendation" &&
          entry.metadata.window === "30d" &&
          entry.metadata.scope_key === "all" &&
          entry.metadata.status === "active",
      )
      .sort((left, right) => Number(left.metadata.rank) - Number(right.metadata.rank));

    expect(persistedRecommendations.length).toBeGreaterThan(0);
    expect(persistedRecommendations.map((entry) => entry.content)).toEqual(
      recommendations.recommendations.map((entry) => entry.title),
    );
    expect(links.some((entry) => entry.linkType === "derived_from")).toBe(true);
    expect(links.some((entry) => entry.linkType === "supports")).toBe(true);
  });

  test("supersedes recommendations when the same lineage key changes materially", async () => {
    const { runtime, elements, links, updateMetric } = createRuntime(METRICS);

    await funnelCompute(createJobContext(runtime, "funnel_compute"));
    await trendCompute(createJobContext(runtime, "trend_compute"));
    await dropoffDetect(createJobContext(runtime, "dropoff_detect"));
    await recommend(createJobContext(runtime, "recommend"));

    updateMetric({
      connectionId: "conn-google-a",
      adapterId: "google-ads",
      metricName: "ad_clicks",
      date: "2026-02-05",
      metricValue: 900,
    });

    await funnelCompute(createJobContext(runtime, "funnel_compute"));
    await trendCompute(createJobContext(runtime, "trend_compute"));
    await dropoffDetect(createJobContext(runtime, "dropoff_detect"));
    const recommendResult = await recommend(createJobContext(runtime, "recommend"));

    expect(recommendResult).toMatchObject({
      status: "ok",
    });

    const currentHeads = [...elements.values()].filter((entry) => {
      return ![...elements.values()].some((candidate) => candidate.parent_id === entry.id);
    });
    const activeRecommendations = currentHeads.filter(
      (entry) =>
        entry.type === "recommendation" &&
        entry.metadata.window === "30d" &&
        entry.metadata.scope_key === "all" &&
        entry.metadata.status === "active",
    );
    const supersededRecommendations = currentHeads.filter(
      (entry) =>
        entry.type === "recommendation" &&
        entry.metadata.window === "30d" &&
        entry.metadata.scope_key === "all" &&
        entry.metadata.status === "superseded",
    );

    expect(activeRecommendations.length).toBeGreaterThan(0);
    expect(supersededRecommendations.length).toBeGreaterThan(0);
    expect(links.some((entry) => entry.linkType === "supersedes")).toBe(true);
  });
});
