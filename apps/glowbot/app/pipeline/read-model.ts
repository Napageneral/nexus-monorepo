import type {
  GlowbotAgentsResponse,
  GlowbotClinicProfile,
  GlowbotFunnelResponse,
  GlowbotModelingResponse,
  GlowbotModelingWindow,
  GlowbotOverviewResponse,
  GlowbotPeriod,
  GlowbotPipelineStatusResponse,
  GlowbotPipelineTriggerResponse,
} from "../../shared/types.js";
import { GLOWBOT_METRIC_EXTRACT_JOB_NAME, GLOWBOT_METRIC_EXTRACT_SCHEDULE_NAME } from "./constants.js";
import { detectDropOffs } from "./dropoffs.js";
import { computeFunnelSnapshots } from "./funnel.js";
import {
  buildRecommendations as buildDerivedRecommendations,
  type MaterializedRecommendation,
} from "./recommendations.js";
import { type RuntimeMethodCaller } from "./registry.js";
import { computeTrendDeltas } from "./trends.js";
import type { FunnelSnapshot, MetricDailyRow } from "./types.js";

type GlowbotModelingName =
  | "ad_spend_to_consults"
  | "review_velocity"
  | "noshow_rate"
  | "revenue_per_patient"
  | "cost_per_acquisition";

type RuntimeRow = Record<string, unknown>;

const METRIC_EXTRACT_JOB_NAME = GLOWBOT_METRIC_EXTRACT_JOB_NAME;
const METRIC_EXTRACT_SCHEDULE_NAME = GLOWBOT_METRIC_EXTRACT_SCHEDULE_NAME;

type ModelingSeriesPoint = GlowbotModelingResponse["series"][number];

type MetricExtractRunSummary = {
  currentRun: GlowbotPipelineStatusResponse["currentRun"];
  lastCompletedRun: GlowbotPipelineStatusResponse["lastCompletedRun"];
  nextScheduledRun: string;
  schedule: string;
};

type ProductControlPlaneCaller = <T>(
  operation: string,
  payload: Record<string, unknown>,
) => Promise<T>;

export type GlowbotBenchmarkContext = {
  clinicId: string;
  clinicProfile: GlowbotClinicProfile;
  callProductControlPlane: ProductControlPlaneCaller;
};

type GlowbotBenchmarkMetricName =
  | "impressions_to_clicks"
  | "clicks_to_leads"
  | "leads_to_bookings"
  | "bookings_to_consults"
  | "consults_to_treatments"
  | "no_show_rate"
  | "review_velocity"
  | "average_rating";

type GlowbotPeerBenchmarkRecord = {
  metricName: GlowbotBenchmarkMetricName;
  peerMedian: number | null;
  peerP25: number | null;
  peerP75: number | null;
  sampleSize: number;
  source: "peer_network" | "industry_seed";
  freshnessMs: number;
};

type GlowbotBenchmarkSnapshot = {
  clinicId: string;
  periodStart: string;
  periodEnd: string;
  clinicProfile: {
    specialty: string;
    monthlyAdSpendBand: string;
    patientVolumeBand: string;
    locationCountBand: string;
  };
  metrics: Record<GlowbotBenchmarkMetricName, number | null>;
  source: {
    appId: string;
    generatedAtMs: number;
    dataFreshnessMs: number;
  };
};

const PERIOD_DAY_COUNT: Record<GlowbotPeriod, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const MODEL_WINDOW_COUNT: Record<GlowbotModelingWindow, number> = {
  "3m": 3,
  "6m": 6,
  "12m": 12,
};

const DEFAULT_PIPELINE_STATUS: GlowbotPipelineStatusResponse["lastCompletedRun"] = {
  id: "",
  completedAt: "",
  metricsComputed: 0,
  recommendationsGenerated: 0,
  duration: 0,
};

function asRecord(value: unknown): RuntimeRow {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RuntimeRow)
    : {};
}

function asArray(value: unknown): RuntimeRow[] {
  return Array.isArray(value)
    ? value.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry)) as RuntimeRow[]
    : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseJsonRecord(value: unknown): RuntimeRow {
  if (typeof value === "string" && value.trim()) {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return asRecord(value);
}

function dateToIsoDay(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function minusDays(isoDay: string, days: number): string {
  const date = new Date(`${isoDay}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return dateToIsoDay(date);
}

function nowIso(value: number | string | null | undefined): string {
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  return "";
}

function isIsoDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value);
}

function normalizeMetricRow(metadata: RuntimeRow): MetricDailyRow | null {
  const date = asString(metadata.date);
  const adapterId = asString(metadata.adapter_id);
  const metricName = asString(metadata.metric_name);
  const metricValue = asNumber(metadata.metric_value);
  if (!date || !adapterId || !metricName || metricValue === null || !isIsoDay(date)) {
    return null;
  }
  return {
    date,
    adapterId,
    metricName,
    metricValue,
    metadataKey: asString(metadata.metadata_key),
  };
}

async function listAllMetricRows(runtime: RuntimeMethodCaller): Promise<MetricDailyRow[]> {
  const metrics: MetricDailyRow[] = [];
  let offset = 0;
  const limit = 500;

  for (;;) {
    const result = asRecord(
      await runtime.callMethod("memory.elements.list", {
        type: "metric",
        limit,
        offset,
      }),
    );
    const elements = asArray(result.elements);
    for (const element of elements) {
      const row = normalizeMetricRow(parseJsonRecord(element.metadata));
      if (row) {
        metrics.push(row);
      }
    }
    if (elements.length < limit) {
      break;
    }
    offset += limit;
  }

  metrics.sort((a, b) => a.date.localeCompare(b.date));
  return metrics;
}

function periodRange(metrics: MetricDailyRow[], period: GlowbotPeriod): {
  currentStart: string;
  currentEnd: string;
  previousStart: string;
  previousEnd: string;
} {
  const periodDays = PERIOD_DAY_COUNT[period];
  const allDates = metrics
    .map((row) => row.date)
    .filter((date) => typeof date === "string" && date.trim())
    .sort();
  const currentEnd = allDates[allDates.length - 1] ?? dateToIsoDay(new Date());
  const currentStart = minusDays(currentEnd, periodDays - 1);
  const previousEnd = minusDays(currentStart, 1);
  const previousStart = minusDays(previousEnd, periodDays - 1);
  return {
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
  };
}

function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

function safeDivide(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return numerator / denominator;
}

function sumMetric(params: {
  metrics: MetricDailyRow[];
  metricName: string;
  adapterIds: string[];
  start: string;
  end: string;
}): number {
  return params.metrics
    .filter(
      (row) =>
        (row.metadataKey ?? "") === "" &&
        row.metricName === params.metricName &&
        params.adapterIds.includes(row.adapterId) &&
        inRange(row.date, params.start, params.end),
    )
    .reduce((sum, row) => sum + row.metricValue, 0);
}

function latestMetricValue(params: {
  metrics: MetricDailyRow[];
  metricName: string;
  adapterIds: string[];
  start: string;
  end: string;
}): number | null {
  const candidates = params.metrics
    .filter(
      (row) =>
        (row.metadataKey ?? "") === "" &&
        row.metricName === params.metricName &&
        params.adapterIds.includes(row.adapterId) &&
        inRange(row.date, params.start, params.end),
    )
    .sort((left, right) => right.date.localeCompare(left.date));
  return candidates[0]?.metricValue ?? null;
}

function snapshotForStep(
  snapshots: FunnelSnapshot[],
  stepName: string,
): FunnelSnapshot | null {
  return snapshots.find((snapshot) => snapshot.stepName === stepName) ?? null;
}

function normalizeClinicProfile(
  clinicProfile: GlowbotClinicProfile,
): GlowbotBenchmarkSnapshot["clinicProfile"] {
  return {
    specialty: clinicProfile.specialty,
    monthlyAdSpendBand: clinicProfile.monthlyAdSpendBand || "unknown",
    patientVolumeBand: clinicProfile.patientVolumeBand || "unknown",
    locationCountBand: clinicProfile.locationCountBand || "unknown",
  };
}

function benchmarkMetricMap(
  records: GlowbotPeerBenchmarkRecord[],
): Partial<Record<GlowbotBenchmarkMetricName, GlowbotPeerBenchmarkRecord>> {
  return Object.fromEntries(records.map((record) => [record.metricName, record])) as Partial<
    Record<GlowbotBenchmarkMetricName, GlowbotPeerBenchmarkRecord>
  >;
}

function buildFunnelPeerMedians(
  records: GlowbotPeerBenchmarkRecord[],
): Record<string, number | null> {
  const byMetric = benchmarkMetricMap(records);
  return {
    clicks: byMetric.impressions_to_clicks?.peerMedian ?? null,
    consults: byMetric.bookings_to_consults?.peerMedian ?? null,
  };
}

function buildClinicBenchmarkSnapshot(params: {
  clinicId: string;
  clinicProfile: GlowbotClinicProfile;
  range: {
    currentStart: string;
    currentEnd: string;
  };
  currentSnapshots: FunnelSnapshot[];
  metrics: MetricDailyRow[];
  generatedAtMs: number;
}): GlowbotBenchmarkSnapshot {
  const impressions = snapshotForStep(params.currentSnapshots, "impressions")?.stepValue ?? 0;
  const clicks = snapshotForStep(params.currentSnapshots, "clicks")?.stepValue ?? 0;
  const bookings = snapshotForStep(params.currentSnapshots, "bookings")?.stepValue ?? 0;
  const consults = snapshotForStep(params.currentSnapshots, "consults")?.stepValue ?? 0;
  const reviewsNew = sumMetric({
    metrics: params.metrics,
    metricName: "reviews_new",
    adapterIds: ["google-business-profile", "apple-maps"],
    start: params.range.currentStart,
    end: params.range.currentEnd,
  });
  const averageRating = latestMetricValue({
    metrics: params.metrics,
    metricName: "reviews_rating_avg",
    adapterIds: ["google-business-profile", "apple-maps"],
    start: params.range.currentStart,
    end: params.range.currentEnd,
  });

  return {
    clinicId: params.clinicId,
    periodStart: params.range.currentStart,
    periodEnd: params.range.currentEnd,
    clinicProfile: normalizeClinicProfile(params.clinicProfile),
    metrics: {
      impressions_to_clicks: safeDivide(clicks, impressions),
      clicks_to_leads: null,
      leads_to_bookings: null,
      bookings_to_consults: safeDivide(consults, bookings),
      consults_to_treatments: null,
      no_show_rate: safeDivide(Math.max(0, bookings - consults), bookings),
      review_velocity: reviewsNew,
      average_rating: averageRating,
    },
    source: {
      appId: "glowbot",
      generatedAtMs: params.generatedAtMs,
      dataFreshnessMs: 0,
    },
  };
}

async function resolveBenchmarkRecords(params: {
  benchmarkContext: GlowbotBenchmarkContext;
  range: {
    currentStart: string;
    currentEnd: string;
  };
  currentSnapshots: FunnelSnapshot[];
  metrics: MetricDailyRow[];
  generatedAtMs: number;
}): Promise<GlowbotPeerBenchmarkRecord[]> {
  const resolved = await params.benchmarkContext.callProductControlPlane<{
    clinicProfile?: GlowbotBenchmarkSnapshot["clinicProfile"];
    profileKey?: string;
  }>("glowbotHub.clinicProfiles.resolve", {
    clinicProfile: params.benchmarkContext.clinicProfile,
  });

  const snapshot = buildClinicBenchmarkSnapshot({
    clinicId: params.benchmarkContext.clinicId,
    clinicProfile: {
      ...params.benchmarkContext.clinicProfile,
      ...normalizeClinicProfile({
        ...params.benchmarkContext.clinicProfile,
        specialty:
          typeof resolved.clinicProfile?.specialty === "string"
            ? resolved.clinicProfile.specialty
            : params.benchmarkContext.clinicProfile.specialty,
        monthlyAdSpendBand:
          typeof resolved.clinicProfile?.monthlyAdSpendBand === "string"
            ? resolved.clinicProfile.monthlyAdSpendBand
            : params.benchmarkContext.clinicProfile.monthlyAdSpendBand,
        patientVolumeBand:
          typeof resolved.clinicProfile?.patientVolumeBand === "string"
            ? resolved.clinicProfile.patientVolumeBand
            : params.benchmarkContext.clinicProfile.patientVolumeBand,
        locationCountBand:
          typeof resolved.clinicProfile?.locationCountBand === "string"
            ? resolved.clinicProfile.locationCountBand
            : params.benchmarkContext.clinicProfile.locationCountBand,
      }),
    },
    range: params.range,
    currentSnapshots: params.currentSnapshots,
    metrics: params.metrics,
    generatedAtMs: params.generatedAtMs,
  });

  await params.benchmarkContext.callProductControlPlane<{
    snapshotId: string;
    profileKey: string;
  }>("glowbotHub.benchmarks.publishSnapshot", snapshot);

  const query = await params.benchmarkContext.callProductControlPlane<{
    records?: GlowbotPeerBenchmarkRecord[];
  }>("glowbotHub.benchmarks.query", {
    clinicProfile: snapshot.clinicProfile,
    periodStart: snapshot.periodStart,
    periodEnd: snapshot.periodEnd,
    ...(typeof resolved.profileKey === "string" && resolved.profileKey
      ? { profileKey: resolved.profileKey }
      : {}),
  });

  return Array.isArray(query.records) ? query.records : [];
}

function formatStepValue(stepName: string, stepValue: number): string {
  if (stepName === "ad_spend" || stepName === "purchases") {
    return `$${Math.round(stepValue).toLocaleString()}`;
  }
  return Math.round(stepValue).toLocaleString();
}

function recommendationForWeakestStep(stepName: string): string {
  switch (stepName) {
    case "clicks":
      return "Focus on converting listing and ad clicks into consult intent.";
    case "bookings":
      return "Improve consult booking workflows and follow-up cadence.";
    case "consults":
      return "Tighten reminders and pre-visit engagement to improve consult completion.";
    case "purchases":
      return "Improve consult close rate and treatment package alignment.";
    default:
      return "Prioritize this funnel step in the next optimization cycle.";
  }
}

function trendForStep(params: {
  stepSourceBreakdown: Record<string, number>;
  stepValue: number;
  trendDeltas: Array<{
    adapterId: string;
    previousTotal: number;
  }>;
}): {
  current: number;
  previous: number;
  delta: number;
  deltaPercent: number;
} {
  const sourceAdapters = new Set(Object.keys(params.stepSourceBreakdown));
  let previous = 0;
  for (const trend of params.trendDeltas) {
    if (sourceAdapters.has(trend.adapterId)) {
      previous += trend.previousTotal;
    }
  }
  const current = params.stepValue;
  const delta = current - previous;
  const deltaPercent = previous > 0 ? delta / previous : 0;
  return {
    current,
    previous,
    delta,
    deltaPercent,
  };
}

function monthKeyFromIsoDay(isoDay: string): string {
  return isoDay.slice(0, 7);
}

function monthLabelFromKey(key: string): string {
  const date = new Date(`${key}-01T00:00:00.000Z`);
  return date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
}

type MonthlyMetricTotals = {
  key: string;
  periodStart: string;
  periodLabel: string;
  totals: Map<string, number>;
};

function monthlyMetricTotals(metrics: MetricDailyRow[]): MonthlyMetricTotals[] {
  const byMonth = new Map<string, MonthlyMetricTotals>();
  for (const row of metrics) {
    if ((row.metadataKey ?? "") !== "") {
      continue;
    }
    const monthKey = monthKeyFromIsoDay(row.date);
    if (!/^\d{4}-\d{2}$/u.test(monthKey)) {
      continue;
    }
    const month =
      byMonth.get(monthKey) ??
      {
        key: monthKey,
        periodStart: `${monthKey}-01`,
        periodLabel: monthLabelFromKey(monthKey),
        totals: new Map<string, number>(),
      };
    const metricKey = `${row.adapterId}::${row.metricName}`;
    month.totals.set(metricKey, (month.totals.get(metricKey) ?? 0) + row.metricValue);
    byMonth.set(monthKey, month);
  }
  return [...byMonth.values()].sort((a, b) => a.periodStart.localeCompare(b.periodStart));
}

function monthMetricTotal(
  month: MonthlyMetricTotals,
  params: { metricName: string; adapterIds: string[] },
): number {
  let total = 0;
  for (const adapterId of params.adapterIds) {
    total += month.totals.get(`${adapterId}::${params.metricName}`) ?? 0;
  }
  return total;
}

function modelPointsFromMetrics(metrics: MetricDailyRow[]): ModelingSeriesPoint[] {
  const months = monthlyMetricTotals(metrics);
  const points: ModelingSeriesPoint[] = [];

  for (const month of months) {
    const adSpend = monthMetricTotal(month, {
      metricName: "ad_spend",
      adapterIds: ["google-ads", "meta-ads"],
    });
    const adClicks = monthMetricTotal(month, {
      metricName: "ad_clicks",
      adapterIds: ["google-ads", "meta-ads"],
    });
    const consults = monthMetricTotal(month, {
      metricName: "appointments_completed",
      adapterIds: ["patient-now-emr", "zenoti-emr"],
    });
    const bookings = monthMetricTotal(month, {
      metricName: "appointments_booked",
      adapterIds: ["patient-now-emr", "zenoti-emr"],
    });
    const noShows = monthMetricTotal(month, {
      metricName: "appointments_noshow",
      adapterIds: ["patient-now-emr", "zenoti-emr"],
    });
    const revenue = monthMetricTotal(month, {
      metricName: "revenue",
      adapterIds: ["patient-now-emr", "zenoti-emr"],
    });
    const reviewsNew = monthMetricTotal(month, {
      metricName: "reviews_new",
      adapterIds: ["google-business-profile", "apple-maps"],
    });

    const pushPoint = (modelName: GlowbotModelingName, yourValue: number) => {
      points.push({
        periodLabel: month.periodLabel,
        periodStart: month.periodStart,
        yourValue,
        peerMedian: null,
        peerBandLow: null,
        peerBandHigh: null,
        modelName,
      } as ModelingSeriesPoint & { modelName: GlowbotModelingName });
    };

    pushPoint("ad_spend_to_consults", adClicks > 0 ? consults / adClicks : 0);
    pushPoint("review_velocity", reviewsNew);
    pushPoint("noshow_rate", bookings > 0 ? noShows / bookings : 0);
    pushPoint("revenue_per_patient", consults > 0 ? revenue / consults : 0);
    pushPoint("cost_per_acquisition", consults > 0 ? adSpend / consults : 0);
  }

  return points;
}

function buildRecommendations(params: {
  snapshots: FunnelSnapshot[];
  trendDeltas: ReturnType<typeof computeTrendDeltas>;
  weakestStep: ReturnType<typeof detectDropOffs>["weakestStep"];
  createdAtMs?: number;
}): MaterializedRecommendation[] {
  return buildDerivedRecommendations({
    snapshots: params.snapshots,
    trendDeltas: params.trendDeltas,
    weakestStep: params.weakestStep,
    createdAtMs: params.createdAtMs,
  });
}

async function getMetricExtractJob(runtime: RuntimeMethodCaller): Promise<RuntimeRow | null> {
  const result = asRecord(await runtime.callMethod("jobs.list", {}));
  const jobs = asArray(result.jobs);
  return jobs.find((job) => asString(job.name) === METRIC_EXTRACT_JOB_NAME) ?? null;
}

async function getMetricExtractRuns(
  runtime: RuntimeMethodCaller,
  jobDefinitionId: string,
): Promise<RuntimeRow[]> {
  const result = asRecord(
    await runtime.callMethod("jobs.runs.list", {
      job_definition_id: jobDefinitionId,
      limit: 50,
    }),
  );
  return asArray(result.runs);
}

function parseMetricsComputed(output: RuntimeRow): number {
  const processed = asNumber(output.processed);
  if (processed !== null) {
    return processed;
  }
  const created = asNumber(output.created) ?? 0;
  const updated = asNumber(output.updated) ?? 0;
  const skipped = asNumber(output.skipped) ?? 0;
  return created + updated + skipped;
}

async function getMetricExtractRunSummary(
  runtime: RuntimeMethodCaller,
): Promise<MetricExtractRunSummary> {
  const job = await getMetricExtractJob(runtime);
  const jobDefinitionId = asString(job?.id);
  const currentRunDefault = null;
  let nextScheduledRun = "";

  if (jobDefinitionId) {
    const scheduleResult = asRecord(
      await runtime.callMethod("schedules.list", {
        job_definition_id: jobDefinitionId,
        limit: 20,
      }),
    );
    const schedules = asArray(scheduleResult.schedules);
    const schedule =
      schedules.find((entry) => asString(entry.name) === METRIC_EXTRACT_SCHEDULE_NAME) ??
      schedules[0] ??
      null;
    nextScheduledRun = nowIso(schedule ? schedule.next_run_at : null);

    const runs = await getMetricExtractRuns(runtime, jobDefinitionId);
    const running =
      runs.find((run) => asString(run.status) === "running") ??
      runs.find((run) => asString(run.status) === "pending") ??
      null;
    const completed = runs.find((run) => asString(run.status) === "completed") ?? null;

    const currentRun =
      running && asString(running.id)
        ? {
            id: asString(running.id),
            status: "running" as const,
            phase: "phase1" as const,
            startedAt: nowIso(running.started_at ?? running.created_at),
            metricsComputed: parseMetricsComputed(parseJsonRecord(running.output_json)),
          }
        : currentRunDefault;

    const completedOutput = parseJsonRecord(completed?.output_json);
    const completedDuration =
      asNumber(completed?.duration_ms) ??
      (() => {
        const started = Date.parse(asString(completed?.started_at));
        const finished = Date.parse(asString(completed?.completed_at));
        if (Number.isFinite(started) && Number.isFinite(finished)) {
          return finished - started;
        }
        return 0;
      })();

    return {
      currentRun,
      lastCompletedRun: completed
        ? {
            id: asString(completed.id),
            completedAt: nowIso(completed.completed_at ?? completed.created_at),
            metricsComputed: parseMetricsComputed(completedOutput),
            recommendationsGenerated: 0,
            duration: Math.round(Math.max(0, completedDuration) / 1000),
          }
        : DEFAULT_PIPELINE_STATUS,
      nextScheduledRun,
      schedule: "every 6 hours",
    };
  }

  return {
    currentRun: currentRunDefault,
    lastCompletedRun: DEFAULT_PIPELINE_STATUS,
    nextScheduledRun,
    schedule: "every 6 hours",
  };
}

async function getAnalysisSnapshot(
  runtime: RuntimeMethodCaller,
  period: GlowbotPeriod,
  benchmarkContext?: GlowbotBenchmarkContext | null,
) {
  const metrics = await listAllMetricRows(runtime);
  const range = periodRange(metrics, period);
  const computedAt = Date.now();
  let benchmarkRecords: GlowbotPeerBenchmarkRecord[] = [];
  const currentSnapshots = computeFunnelSnapshots({
    metrics,
    periodStart: range.currentStart,
    periodEnd: range.currentEnd,
    computedAt,
  });
  if (benchmarkContext) {
    try {
      benchmarkRecords = await resolveBenchmarkRecords({
        benchmarkContext,
        range,
        currentSnapshots,
        metrics,
        generatedAtMs: computedAt,
      });
    } catch {
      benchmarkRecords = [];
    }
  }
  const funnelPeerMedians = buildFunnelPeerMedians(benchmarkRecords);
  const currentSnapshotsWithPeers = computeFunnelSnapshots({
    metrics,
    periodStart: range.currentStart,
    periodEnd: range.currentEnd,
    peerMedians: funnelPeerMedians,
    computedAt,
  });
  const previousSnapshots = computeFunnelSnapshots({
    metrics,
    periodStart: range.previousStart,
    periodEnd: range.previousEnd,
    peerMedians: funnelPeerMedians,
    computedAt,
  });
  const trendDeltas = computeTrendDeltas({
    metrics,
    currentStart: range.currentStart,
    currentEnd: range.currentEnd,
    previousStart: range.previousStart,
    previousEnd: range.previousEnd,
  });
  const dropOff = detectDropOffs({ snapshots: currentSnapshotsWithPeers });
  const recommendations = buildRecommendations({
    snapshots: currentSnapshotsWithPeers,
    trendDeltas,
    weakestStep: dropOff.weakestStep,
    createdAtMs: computedAt,
  });

  return {
    metrics,
    range,
    benchmarkRecords,
    currentSnapshots: currentSnapshotsWithPeers,
    previousSnapshots,
    trendDeltas,
    dropOff,
    recommendations,
  };
}

export async function getPipelineStatus(
  runtime: RuntimeMethodCaller,
): Promise<GlowbotPipelineStatusResponse> {
  return getMetricExtractRunSummary(runtime);
}

export async function triggerPipelineRun(
  runtime: RuntimeMethodCaller,
): Promise<GlowbotPipelineTriggerResponse> {
  const job = await getMetricExtractJob(runtime);
  const jobDefinitionId = asString(job?.id);
  if (!jobDefinitionId) {
    throw new Error("GlowBot metric_extract job is not registered");
  }
  const result = asRecord(
    await runtime.callMethod("jobs.invoke", {
      job_id: jobDefinitionId,
      trigger_source: "manual",
      input: {},
    }),
  );
  const run = asRecord(result.run);
  return {
    runId: asString(run.id),
    status: "started",
  };
}

export async function getOverviewData(
  runtime: RuntimeMethodCaller,
  period: GlowbotPeriod,
  benchmarkContext?: GlowbotBenchmarkContext | null,
): Promise<Omit<GlowbotOverviewResponse, "adapterStatus">> {
  const [analysis, pipelineStatus] = await Promise.all([
    getAnalysisSnapshot(runtime, period, benchmarkContext),
    getPipelineStatus(runtime),
  ]);

  const currentNewPatients = sumMetric({
    metrics: analysis.metrics,
    metricName: "appointments_completed",
    adapterIds: ["patient-now-emr", "zenoti-emr"],
    start: analysis.range.currentStart,
    end: analysis.range.currentEnd,
  });
  const previousNewPatients = sumMetric({
    metrics: analysis.metrics,
    metricName: "appointments_completed",
    adapterIds: ["patient-now-emr", "zenoti-emr"],
    start: analysis.range.previousStart,
    end: analysis.range.previousEnd,
  });
  const delta = currentNewPatients - previousNewPatients;
  const deltaPercent =
    previousNewPatients > 0 ? (delta / previousNewPatients) * 100 : currentNewPatients > 0 ? 100 : 0;

  return {
    heroStat: {
      label: "New Patients (Last 30 Days)",
      value: Math.round(currentNewPatients),
      delta: Math.round(delta),
      deltaPercent: Number(deltaPercent.toFixed(1)),
      deltaDirection: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
      comparedTo: `vs previous ${period}`,
    },
    topActions: analysis.recommendations.slice(0, 4).map((item) => ({
      rank: item.rank,
      title: item.title,
      deltaValue: item.deltaValue,
      deltaUnit: item.deltaUnit,
      confidence: item.confidence,
      category: item.category,
    })),
    pipelineStatus: {
      lastRun: pipelineStatus.lastCompletedRun.completedAt,
      status: pipelineStatus.currentRun ? "running" : "completed",
      nextRun: pipelineStatus.nextScheduledRun,
    },
  };
}

export async function getFunnelData(
  runtime: RuntimeMethodCaller,
  period: GlowbotPeriod,
  benchmarkContext?: GlowbotBenchmarkContext | null,
): Promise<GlowbotFunnelResponse> {
  const analysis = await getAnalysisSnapshot(runtime, period, benchmarkContext);
  const weakestWithPeer =
    analysis.currentSnapshots
      .filter(
        (step) =>
          typeof step.conversionRate === "number" &&
          typeof step.peerMedian === "number" &&
          typeof step.deltaVsPeer === "number",
      )
      .sort((left, right) => (left.conversionRate ?? 0) - (right.conversionRate ?? 0))[0] ??
    null;

  return {
    periodStart: analysis.range.currentStart,
    periodEnd: analysis.range.currentEnd,
    steps: analysis.currentSnapshots.map((step) => {
      const previous = analysis.previousSnapshots.find((item) => item.stepName === step.stepName);
      const trend = trendForStep({
        stepSourceBreakdown: step.sourceBreakdown,
        stepValue: step.stepValue,
        trendDeltas: analysis.trendDeltas,
      });
      if (previous) {
        trend.previous = previous.stepValue;
        trend.delta = step.stepValue - previous.stepValue;
        trend.deltaPercent =
          previous.stepValue > 0 ? trend.delta / previous.stepValue : trend.current > 0 ? 1 : 0;
      }

      return {
        name: step.stepName,
        order: step.stepOrder,
        value: step.stepValue,
        formattedValue: formatStepValue(step.stepName, step.stepValue),
        conversionRate: step.conversionRate,
        peerMedian: step.peerMedian,
        deltaVsPeer: step.deltaVsPeer,
        sourceBreakdown: step.sourceBreakdown,
        trend,
      };
    }),
    weakestStep: weakestWithPeer
      ? {
          name: weakestWithPeer.stepName,
          conversionRate: weakestWithPeer.conversionRate!,
          peerMedian: weakestWithPeer.peerMedian!,
          gap: weakestWithPeer.deltaVsPeer!,
          recommendation: recommendationForWeakestStep(weakestWithPeer.stepName),
        }
      : null,
  };
}

export async function getModelingData(
  runtime: RuntimeMethodCaller,
  params: { model: string; window: GlowbotModelingWindow },
  benchmarkContext?: GlowbotBenchmarkContext | null,
): Promise<GlowbotModelingResponse> {
  const metrics = await listAllMetricRows(runtime);
  const benchmarkRange = periodRange(metrics, "30d");
  const benchmarkSnapshots = computeFunnelSnapshots({
    metrics,
    periodStart: benchmarkRange.currentStart,
    periodEnd: benchmarkRange.currentEnd,
  });
  const peerBenchmarks =
    benchmarkContext && metrics.length > 0
      ? benchmarkMetricMap(
          await resolveBenchmarkRecords({
            benchmarkContext,
            range: benchmarkRange,
            currentSnapshots: benchmarkSnapshots,
            metrics,
            generatedAtMs: Date.now(),
          }),
        )
      : {};
  const points = modelPointsFromMetrics(metrics)
    .filter((point) => (point as ModelingSeriesPoint & { modelName?: string }).modelName === params.model)
    .map((point) => {
      const { modelName: _ignored, ...seriesPoint } = point as ModelingSeriesPoint & {
        modelName: string;
      };
      if (params.model === "review_velocity") {
        return {
          ...seriesPoint,
          peerMedian: peerBenchmarks.review_velocity?.peerMedian ?? null,
          peerBandLow: peerBenchmarks.review_velocity?.peerP25 ?? null,
          peerBandHigh: peerBenchmarks.review_velocity?.peerP75 ?? null,
        };
      }
      if (params.model === "noshow_rate") {
        return {
          ...seriesPoint,
          peerMedian: peerBenchmarks.no_show_rate?.peerMedian ?? null,
          peerBandLow: peerBenchmarks.no_show_rate?.peerP25 ?? null,
          peerBandHigh: peerBenchmarks.no_show_rate?.peerP75 ?? null,
        };
      }
      return seriesPoint;
    });

  const maxPoints = MODEL_WINDOW_COUNT[params.window];
  const series = points.slice(Math.max(0, points.length - maxPoints));
  const first = series[0]?.yourValue ?? 0;
  const last = series.at(-1)?.yourValue ?? 0;
  const trend = last > first ? "improving" : last < first ? "declining" : "stable";
  const correlation =
    series.length > 1 && first !== 0 ? Number(Math.min(0.99, Math.max(0, last / first)).toFixed(2)) : 0;

  return {
    modelName: params.model,
    series,
    summary: {
      trend,
      correlation,
      insight:
        trend === "improving"
          ? "Modeled outcome is improving month-over-month against peer bands."
          : trend === "declining"
            ? "Modeled outcome is declining and should be reviewed for intervention."
            : "Modeled outcome is stable relative to peer performance.",
    },
  };
}

export async function getAgentsData(
  runtime: RuntimeMethodCaller,
  benchmarkContext?: GlowbotBenchmarkContext | null,
): Promise<GlowbotAgentsResponse> {
  const [recommendations, pipelineStatus] = await Promise.all([
    getAgentsRecommendations(runtime, {}, benchmarkContext),
    getPipelineStatus(runtime),
  ]);
  const categories = ["demand", "conversion", "local", "benchmark", "modeling"] as const;

  return {
    agents: categories.map((category) => {
      const matching = recommendations.recommendations.filter((item) => item.category === category);
      const top = matching[0];
      return {
        category,
        displayName: `${category.charAt(0).toUpperCase()}${category.slice(1)} Agent`,
        status: matching.length > 0 ? ("active" as const) : ("idle" as const),
        lastRun: pipelineStatus.lastCompletedRun.completedAt,
        confidence: top?.confidence ?? "MEDIUM",
        topRecommendation: top
          ? {
              title: top.title,
              deltaValue: top.deltaValue,
              deltaUnit: top.deltaUnit,
            }
          : null,
        recommendationCount: matching.length,
      };
    }),
    lastPipelineRun: {
      id: pipelineStatus.lastCompletedRun.id,
      status: pipelineStatus.currentRun ? "running" : "completed",
      completedAt: pipelineStatus.lastCompletedRun.completedAt,
      recommendationsGenerated: pipelineStatus.lastCompletedRun.recommendationsGenerated,
    },
  };
}

export async function getAgentsRecommendations(
  runtime: RuntimeMethodCaller,
  params: {
    category?: "demand" | "conversion" | "local" | "benchmark" | "modeling";
    limit?: number;
  },
  benchmarkContext?: GlowbotBenchmarkContext | null,
): Promise<GlowbotAgentsRecommendationsResponse> {
  const analysis = await getAnalysisSnapshot(runtime, "30d", benchmarkContext);
  const filtered = params.category
    ? analysis.recommendations.filter((item) => item.category === params.category)
    : analysis.recommendations;
  const limit = Math.max(1, Math.min(50, params.limit ?? filtered.length));
  return {
    recommendations: filtered.slice(0, limit).map((row) => ({
      id: row.id,
      rank: row.rank,
      title: row.title,
      deltaValue: row.deltaValue,
      deltaUnit: row.deltaUnit,
      description: row.description,
      confidence: row.confidence,
      category: row.category,
      reasoning: row.reasoning,
      actionData: row.actionData,
      createdAt: nowIso(row.createdAtMs),
    })),
  };
}
