import type { FunnelSnapshot, FunnelStepDefinition, MetricDailyRow } from "./types";

function isMetricInRange(date: string, periodStart: string, periodEnd: string): boolean {
  return date >= periodStart && date <= periodEnd;
}

function isTotalMetric(row: MetricDailyRow): boolean {
  return (row.metadataKey ?? "") === "";
}

export const FUNNEL_DEFINITION: FunnelStepDefinition[] = [
  {
    name: "ad_spend",
    order: 1,
    metricSources: [
      { adapterId: "google-ads", metricName: "ad_spend" },
      { adapterId: "meta-ads", metricName: "ad_spend" },
    ],
    aggregation: "sum",
  },
  {
    name: "impressions",
    order: 2,
    metricSources: [
      { adapterId: "google-ads", metricName: "ad_impressions" },
      { adapterId: "meta-ads", metricName: "ad_impressions" },
      { adapterId: "google-business-profile", metricName: "listing_views_search" },
      { adapterId: "google-business-profile", metricName: "listing_views_maps" },
    ],
    aggregation: "sum",
  },
  {
    name: "clicks",
    order: 3,
    metricSources: [
      { adapterId: "google-ads", metricName: "ad_clicks" },
      { adapterId: "meta-ads", metricName: "ad_clicks" },
      { adapterId: "google-business-profile", metricName: "listing_clicks_website" },
      { adapterId: "google-business-profile", metricName: "listing_clicks_directions" },
      { adapterId: "google-business-profile", metricName: "listing_clicks_phone" },
    ],
    aggregation: "sum",
  },
  {
    name: "page_views",
    order: 4,
    metricSources: [],
    aggregation: "sum",
  },
  {
    name: "page_actions",
    order: 5,
    metricSources: [],
    aggregation: "sum",
  },
  {
    name: "bookings",
    order: 6,
    metricSources: [
      { adapterId: "patient-now-emr", metricName: "appointments_booked" },
      { adapterId: "zenoti-emr", metricName: "appointments_booked" },
    ],
    aggregation: "sum",
  },
  {
    name: "consults",
    order: 7,
    metricSources: [
      { adapterId: "patient-now-emr", metricName: "appointments_completed" },
      { adapterId: "zenoti-emr", metricName: "appointments_completed" },
    ],
    aggregation: "sum",
  },
  {
    name: "purchases",
    order: 8,
    metricSources: [
      { adapterId: "patient-now-emr", metricName: "revenue" },
      { adapterId: "zenoti-emr", metricName: "revenue" },
    ],
    aggregation: "sum",
  },
];

export function computeFunnelSnapshots(params: {
  metrics: MetricDailyRow[];
  periodStart: string;
  periodEnd: string;
  peerMedians?: Record<string, number | null | undefined>;
  computedAt?: number;
  funnelDefinition?: FunnelStepDefinition[];
}): FunnelSnapshot[] {
  const definition = params.funnelDefinition ?? FUNNEL_DEFINITION;
  const computedAt = params.computedAt ?? Date.now();
  const snapshots: FunnelSnapshot[] = [];
  let prevStepValue: number | null = null;

  for (const step of definition.toSorted((a, b) => a.order - b.order)) {
    const sourceBreakdown: Record<string, number> = {};
    let stepValue = 0;

    for (const source of step.metricSources) {
      for (const row of params.metrics) {
        if (!isTotalMetric(row)) {
          continue;
        }
        if (!isMetricInRange(row.date, params.periodStart, params.periodEnd)) {
          continue;
        }
        if (row.adapterId !== source.adapterId || row.metricName !== source.metricName) {
          continue;
        }
        if (!Number.isFinite(row.metricValue)) {
          continue;
        }
        stepValue += row.metricValue;
        sourceBreakdown[source.adapterId] = (sourceBreakdown[source.adapterId] ?? 0) + row.metricValue;
      }
    }

    const conversionRate =
      prevStepValue !== null && prevStepValue > 0 ? stepValue / prevStepValue : null;
    const peerMedian = params.peerMedians?.[step.name] ?? null;
    const deltaVsPeer =
      conversionRate !== null && peerMedian !== null ? conversionRate - peerMedian : null;

    snapshots.push({
      id: `${params.periodStart}:${params.periodEnd}:${step.name}`,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      stepName: step.name,
      stepOrder: step.order,
      stepValue,
      prevStepValue,
      conversionRate,
      peerMedian,
      deltaVsPeer,
      sourceBreakdown,
      computedAt,
    });

    prevStepValue = stepValue;
  }

  return snapshots;
}
