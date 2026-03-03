import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SEED_PEER_MEDIANS } from "./seeds.js";
import { detectDropOffs } from "./dropoffs";
import { computeFunnelSnapshots } from "./funnel";
import { GLOWBOT_LEDGER_SCHEMA_SQL } from "./schema";
import { computeTrendDeltas } from "./trends";
import type { FunnelSnapshot, MetricDailyRow } from "./types";

type PipelineRunRow = {
  id: string;
  status: "running" | "completed" | "failed";
  phase1_started_at: number | null;
  phase1_completed_at: number | null;
  phase2_started_at: number | null;
  phase2_completed_at: number | null;
  metrics_computed: number | null;
  recommendations_generated: number | null;
  created_at: number;
};

type GlowbotPeriod = "7d" | "30d" | "90d";
type GlowbotModelingWindow = "3m" | "6m" | "12m";
type RecommendationCategory = "demand" | "conversion" | "local" | "benchmark" | "modeling";
type RecommendationConfidence = "HIGH" | "MEDIUM" | "LOW";

type GeneratedRecommendation = {
  id: string;
  rank: number;
  title: string;
  deltaValue: number;
  deltaUnit: string;
  description: string;
  confidence: RecommendationConfidence;
  category: RecommendationCategory;
  reasoning: string;
  actionData: Record<string, unknown>;
};

type ModelingSeriesPoint = {
  modelName: string;
  periodLabel: string;
  periodStart: string;
  yourValue: number;
  peerMedian: number | null;
  peerBandLow: number | null;
  peerBandHigh: number | null;
};

const DEFAULT_LEDGER_PATH = path.join(process.cwd(), ".nexus-data", "glowbot-ledger.sqlite");
const PIPELINE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const PIPELINE_SCHEDULER_ID = "default";
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

let dbCache: DatabaseSync | null = null;

function ledgerPath(): string {
  const configured = process.env.GLOWBOT_LEDGER_PATH;
  if (typeof configured === "string" && configured.trim()) {
    return configured.trim();
  }
  return DEFAULT_LEDGER_PATH;
}

function getDb(): DatabaseSync {
  if (dbCache) {
    return dbCache;
  }
  const filePath = ledgerPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new DatabaseSync(filePath);
  db.exec(GLOWBOT_LEDGER_SCHEMA_SQL);
  ensureSchedulerState(db);
  dbCache = db;
  return db;
}

function ensureSchedulerState(db: DatabaseSync): void {
  const existing = db
    .prepare(
      `
        SELECT next_run_at
        FROM pipeline_scheduler_state
        WHERE id = ?
      `,
    )
    .get(PIPELINE_SCHEDULER_ID) as { next_run_at: number } | undefined;
  if (existing && Number.isFinite(existing.next_run_at) && existing.next_run_at > 0) {
    return;
  }
  const now = Date.now();
  db.prepare(
    `
      INSERT OR REPLACE INTO pipeline_scheduler_state (id, next_run_at, updated_at)
      VALUES (?, ?, ?)
    `,
  ).run(PIPELINE_SCHEDULER_ID, now + PIPELINE_INTERVAL_MS, now);
}

function readNextScheduledRunMs(db: DatabaseSync): number {
  ensureSchedulerState(db);
  const row = db
    .prepare(
      `
        SELECT next_run_at
        FROM pipeline_scheduler_state
        WHERE id = ?
      `,
    )
    .get(PIPELINE_SCHEDULER_ID) as { next_run_at: number } | undefined;
  if (!row || !Number.isFinite(row.next_run_at) || row.next_run_at <= 0) {
    const fallback = Date.now() + PIPELINE_INTERVAL_MS;
    db.prepare(
      `
        INSERT OR REPLACE INTO pipeline_scheduler_state (id, next_run_at, updated_at)
        VALUES (?, ?, ?)
      `,
    ).run(PIPELINE_SCHEDULER_ID, fallback, Date.now());
    return fallback;
  }
  return row.next_run_at;
}

function writeNextScheduledRunMs(db: DatabaseSync, anchorMs: number): number {
  const nextRunAt = Math.max(anchorMs, Date.now()) + PIPELINE_INTERVAL_MS;
  db.prepare(
    `
      INSERT OR REPLACE INTO pipeline_scheduler_state (id, next_run_at, updated_at)
      VALUES (?, ?, ?)
    `,
  ).run(PIPELINE_SCHEDULER_ID, nextRunAt, Date.now());
  return nextRunAt;
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

function nowIso(value: number): string {
  return new Date(value).toISOString();
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
    .filter((date) => typeof date === "string" && date.trim());
  allDates.sort();
  const currentEnd =
    allDates[allDates.length - 1] ?? dateToIsoDay(new Date());
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

function parseJsonObject(value: string | null): Record<string, unknown> {
  if (!value || !value.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function metricRowId(row: MetricDailyRow): string {
  const metadataKey = row.metadataKey ?? "";
  return `${row.date}:${row.adapterId}:${row.metricName}:${metadataKey}`;
}

function isIsoDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value);
}

function normalizeMetricRow(row: MetricDailyRow): MetricDailyRow | null {
  const date = row.date.trim();
  const adapterId = row.adapterId.trim();
  const metricName = row.metricName.trim();
  if (!date || !adapterId || !metricName || !isIsoDay(date)) {
    return null;
  }
  if (!Number.isFinite(row.metricValue)) {
    return null;
  }
  return {
    date,
    adapterId,
    metricName,
    metricValue: Number(row.metricValue),
    metadataKey: (row.metadataKey ?? "").trim(),
  };
}

function upsertMetricsRows(db: DatabaseSync, rows: MetricDailyRow[]): number {
  const upsert = db.prepare(`
    INSERT INTO metrics_daily (
      id, date, adapter_id, metric_name, metric_value, metadata_key, metadata, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date, adapter_id, metric_name, metadata_key)
    DO UPDATE SET
      metric_value = excluded.metric_value,
      synced_at = excluded.synced_at
  `);

  const syncedAt = Date.now();
  let upserted = 0;
  for (const candidate of rows) {
    const row = normalizeMetricRow(candidate);
    if (!row) {
      continue;
    }
    upsert.run(
      metricRowId(row),
      row.date,
      row.adapterId,
      row.metricName,
      row.metricValue,
      row.metadataKey ?? "",
      null,
      syncedAt,
    );
    upserted += 1;
  }
  return upserted;
}

export function ingestMetricRows(rows: MetricDailyRow[]): { upserted: number; total: number } {
  const db = getDb();
  const upserted = upsertMetricsRows(db, rows);
  return {
    upserted,
    total: rows.length,
  };
}

function readMetrics(db: DatabaseSync): MetricDailyRow[] {
  const rows = db
    .prepare(
      `
        SELECT date, adapter_id, metric_name, metric_value, metadata_key
        FROM metrics_daily
      `,
    )
    .all() as Array<{
    date: string;
    adapter_id: string;
    metric_name: string;
    metric_value: number;
    metadata_key: string | null;
  }>;

  return rows.map((row) => ({
    date: row.date,
    adapterId: row.adapter_id,
    metricName: row.metric_name,
    metricValue: row.metric_value,
    metadataKey: row.metadata_key ?? "",
  }));
}

function determinePeriod(metrics: MetricDailyRow[]): { start: string; end: string } {
  const allDates = metrics.map((row) => row.date).filter((date) => typeof date === "string" && date.trim());
  if (allDates.length === 0) {
    const end = dateToIsoDay(new Date());
    return { start: minusDays(end, 29), end };
  }
  allDates.sort();
  const end = allDates[allDates.length - 1]!;
  return {
    start: minusDays(end, 29),
    end,
  };
}

function writeFunnelSnapshots(db: DatabaseSync, params: {
  runId: string;
  computedAt: number;
  metrics: MetricDailyRow[];
}): FunnelSnapshot[] {
  const period = determinePeriod(params.metrics);
  const snapshots = computeFunnelSnapshots({
    metrics: params.metrics,
    periodStart: period.start,
    periodEnd: period.end,
    peerMedians: SEED_PEER_MEDIANS,
    computedAt: params.computedAt,
  });

  const write = db.prepare(`
    INSERT OR REPLACE INTO funnel_snapshots (
      id, period_start, period_end, step_name, step_order, step_value, prev_step_value,
      conversion_rate, peer_median, delta_vs_peer, source_breakdown, computed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const snapshot of snapshots) {
    write.run(
      `${params.runId}:${snapshot.stepName}`,
      snapshot.periodStart,
      snapshot.periodEnd,
      snapshot.stepName,
      snapshot.stepOrder,
      snapshot.stepValue,
      snapshot.prevStepValue,
      snapshot.conversionRate,
      snapshot.peerMedian,
      snapshot.deltaVsPeer,
      JSON.stringify(snapshot.sourceBreakdown),
      snapshot.computedAt,
    );
  }
  return snapshots;
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

    const pushPoint = (modelName: string, yourValue: number) => {
      points.push({
        modelName,
        periodLabel: month.periodLabel,
        periodStart: month.periodStart,
        yourValue,
        peerMedian: null,
        peerBandLow: null,
        peerBandHigh: null,
      });
    };

    pushPoint("ad_spend_to_consults", adClicks > 0 ? consults / adClicks : 0);
    pushPoint("review_velocity", reviewsNew);
    pushPoint("noshow_rate", bookings > 0 ? noShows / bookings : 0);
    pushPoint("revenue_per_patient", consults > 0 ? revenue / consults : 0);
    pushPoint("cost_per_acquisition", consults > 0 ? adSpend / consults : 0);
  }

  return points;
}

function writeModelingSeries(db: DatabaseSync, params: {
  runId: string;
  computedAt: number;
  metrics: MetricDailyRow[];
}): number {
  const write = db.prepare(`
    INSERT OR REPLACE INTO modeling_series (
      id, model_name, period_label, period_start, your_value,
      peer_median, peer_band_low, peer_band_high, computed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const points = modelPointsFromMetrics(params.metrics);
  let count = 0;
  for (const point of points) {
    count += 1;
    write.run(
      `${params.runId}:${point.modelName}:${point.periodStart}`,
      point.modelName,
      point.periodLabel,
      point.periodStart,
      point.yourValue,
      point.peerMedian,
      point.peerBandLow,
      point.peerBandHigh,
      params.computedAt,
    );
  }
  return count;
}

function recommendationCategoryForStep(stepName: string): RecommendationCategory {
  if (stepName === "ad_spend" || stepName === "impressions" || stepName === "clicks") {
    return "demand";
  }
  if (stepName === "bookings" || stepName === "consults" || stepName === "purchases") {
    return "conversion";
  }
  if (stepName === "page_views" || stepName === "page_actions") {
    return "local";
  }
  return "benchmark";
}

function recommendationCategoryForMetric(metricName: string): RecommendationCategory {
  if (metricName.startsWith("ad_")) {
    return "demand";
  }
  if (metricName.startsWith("reviews_") || metricName.startsWith("listing_")) {
    return "local";
  }
  if (
    metricName.startsWith("appointments_") ||
    metricName === "patients_new" ||
    metricName === "patients_returning" ||
    metricName === "revenue"
  ) {
    return "conversion";
  }
  return "modeling";
}

function confidenceForMagnitude(magnitude: number): RecommendationConfidence {
  if (magnitude >= 12) {
    return "HIGH";
  }
  if (magnitude >= 6) {
    return "MEDIUM";
  }
  return "LOW";
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

type RecommendationCandidate = Omit<GeneratedRecommendation, "id" | "rank"> & {
  key: string;
  score: number;
};

function buildRecommendations(params: {
  snapshots: FunnelSnapshot[];
  trendDeltas: ReturnType<typeof computeTrendDeltas>;
  weakestStep: ReturnType<typeof detectDropOffs>["weakestStep"];
}): GeneratedRecommendation[] {
  const candidates: RecommendationCandidate[] = [];

  for (const step of params.snapshots) {
    if (
      typeof step.conversionRate !== "number" ||
      typeof step.peerMedian !== "number" ||
      typeof step.deltaVsPeer !== "number" ||
      step.deltaVsPeer >= 0
    ) {
      continue;
    }
    const gapPoints = Math.abs(step.deltaVsPeer * 100);
    const stepLabel = step.stepName.replaceAll("_", " ");
    candidates.push({
      key: `step:${step.stepName}`,
      title: `Improve ${stepLabel} Conversion`,
      deltaValue: Number(gapPoints.toFixed(1)),
      deltaUnit: "pp conversion",
      description: `${stepLabel} conversion is ${(step.conversionRate * 100).toFixed(1)}% vs peer ${(step.peerMedian * 100).toFixed(1)}%.`,
      confidence: confidenceForMagnitude(gapPoints),
      category: recommendationCategoryForStep(step.stepName),
      reasoning: "Persistent peer benchmark gap detected in the latest funnel window.",
      actionData: {
        step: step.stepName,
        conversionRate: step.conversionRate,
        peerMedian: step.peerMedian,
        deltaVsPeer: step.deltaVsPeer,
      },
      score: gapPoints,
    });
  }

  if (params.weakestStep) {
    const stepLabel = params.weakestStep.stepName.replaceAll("_", " ");
    const weaknessScore = Math.max(0, (1 - params.weakestStep.conversionRate) * 100);
    candidates.push({
      key: `dropoff:${params.weakestStep.stepName}`,
      title: `Stabilize ${stepLabel} Drop-off`,
      deltaValue: Number(weaknessScore.toFixed(1)),
      deltaUnit: "pp conversion",
      description: `${stepLabel} is currently the weakest step in the funnel and needs focused intervention.`,
      confidence: confidenceForMagnitude(weaknessScore),
      category: recommendationCategoryForStep(params.weakestStep.stepName),
      reasoning: "Weakest conversion step signal was flagged by deterministic drop-off analysis.",
      actionData: {
        step: params.weakestStep.stepName,
        conversionRate: params.weakestStep.conversionRate,
      },
      score: weaknessScore,
    });
  }

  for (const trend of params.trendDeltas) {
    if (trend.deltaPercent === null || trend.deltaPercent >= -0.05 || trend.previousTotal <= 0) {
      continue;
    }
    const declinePercent = Math.abs(trend.deltaPercent * 100);
    const metricLabel = trend.metricName.replaceAll("_", " ");
    candidates.push({
      key: `trend:${trend.metricName}:${trend.adapterId}`,
      title: `Recover ${metricLabel} Trend`,
      deltaValue: Number(declinePercent.toFixed(1)),
      deltaUnit: "% trend",
      description: `${metricLabel} declined ${declinePercent.toFixed(1)}% versus the previous period for ${trend.adapterId}.`,
      confidence: confidenceForMagnitude(declinePercent),
      category: recommendationCategoryForMetric(trend.metricName),
      reasoning: "Period-over-period decline exceeded the 5% guardrail.",
      actionData: {
        metric: trend.metricName,
        adapter: trend.adapterId,
        currentTotal: trend.currentTotal,
        previousTotal: trend.previousTotal,
        deltaPercent: trend.deltaPercent,
      },
      score: declinePercent,
    });
  }

  const deduped = new Map<string, RecommendationCandidate>();
  for (const candidate of candidates) {
    const existing = deduped.get(candidate.key);
    if (!existing || candidate.score > existing.score) {
      deduped.set(candidate.key, candidate);
    }
  }

  const ranked = [...deduped.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return ranked.map((candidate, index) => ({
    id: `rec-${index + 1}-${slugify(candidate.key)}`,
    rank: index + 1,
    title: candidate.title,
    deltaValue: candidate.deltaValue,
    deltaUnit: candidate.deltaUnit,
    description: candidate.description,
    confidence: candidate.confidence,
    category: candidate.category,
    reasoning: candidate.reasoning,
    actionData: candidate.actionData,
  }));
}

function writeRecommendations(db: DatabaseSync, params: {
  runId: string;
  createdAt: number;
  recommendations: GeneratedRecommendation[];
}): number {
  const write = db.prepare(`
    INSERT OR REPLACE INTO recommendations (
      id, run_id, rank, title, delta_value, delta_unit, description, confidence,
      category, reasoning, action_data, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const recommendation of params.recommendations) {
    write.run(
      `${params.runId}:${recommendation.id}`,
      params.runId,
      recommendation.rank,
      recommendation.title,
      recommendation.deltaValue,
      recommendation.deltaUnit,
      recommendation.description,
      recommendation.confidence,
      recommendation.category,
      recommendation.reasoning,
      JSON.stringify(recommendation.actionData),
      params.createdAt,
    );
  }
  return params.recommendations.length;
}

function executePipelineRun(db: DatabaseSync): { runId: string; completedAt: number } {
  const runId = `run-${randomUUID()}`;
  const startedAt = Date.now();

  db.prepare(
    `
      INSERT INTO pipeline_runs (
        id, status, phase1_started_at, created_at
      ) VALUES (?, ?, ?, ?)
    `,
  ).run(runId, "running", startedAt, startedAt);

  try {
    const metrics = readMetrics(db);
    const computedAt = Date.now();
    const snapshots = writeFunnelSnapshots(db, { runId, computedAt, metrics });
    const period = determinePeriod(metrics);
    const previousEnd = minusDays(period.start, 1);
    const previousStart = minusDays(previousEnd, 29);
    const trendDeltas = computeTrendDeltas({
      metrics,
      currentStart: period.start,
      currentEnd: period.end,
      previousStart,
      previousEnd,
    });
    const dropOff = detectDropOffs({ snapshots });
    const recommendations = buildRecommendations({
      snapshots,
      trendDeltas,
      weakestStep: dropOff.weakestStep,
    });
    const modelingWritten = writeModelingSeries(db, { runId, computedAt, metrics });
    const recommendationsWritten = writeRecommendations(db, {
      runId,
      createdAt: computedAt,
      recommendations,
    });

    const completedAt = Date.now();
    db.prepare(
      `
        UPDATE pipeline_runs
        SET status = ?,
            phase1_completed_at = ?,
            phase2_started_at = ?,
            phase2_completed_at = ?,
            metrics_computed = ?,
            recommendations_generated = ?
        WHERE id = ?
      `,
    ).run(
      "completed",
      completedAt,
      completedAt,
      completedAt,
      metrics.length + snapshots.length + modelingWritten,
      recommendationsWritten,
      runId,
    );
    writeNextScheduledRunMs(db, completedAt);
    return {
      runId,
      completedAt,
    };
  } catch (error) {
    db.prepare(
      `
        UPDATE pipeline_runs
        SET status = ?, error = ?, phase1_completed_at = ?
        WHERE id = ?
      `,
    ).run("failed", error instanceof Error ? error.message : String(error), Date.now(), runId);
    writeNextScheduledRunMs(db, Date.now());
    throw error;
  }
}

function readCurrentRun(db: DatabaseSync): PipelineRunRow | null {
  return (
    (db
      .prepare(
        `
          SELECT id, status, phase1_started_at, phase1_completed_at, phase2_started_at, phase2_completed_at,
                 metrics_computed, recommendations_generated, created_at
          FROM pipeline_runs
          WHERE status = 'running'
          ORDER BY created_at DESC
          LIMIT 1
        `,
      )
      .get() as PipelineRunRow | undefined) ?? null
  );
}

function readLastCompletedRun(db: DatabaseSync): PipelineRunRow | null {
  return (
    (db
      .prepare(
        `
          SELECT id, status, phase1_started_at, phase1_completed_at, phase2_started_at, phase2_completed_at,
                 metrics_computed, recommendations_generated, created_at
          FROM pipeline_runs
          WHERE status = 'completed'
          ORDER BY COALESCE(phase2_completed_at, phase1_completed_at, created_at) DESC
          LIMIT 1
        `,
      )
      .get() as PipelineRunRow | undefined) ?? null
  );
}

function ensureLatestCompletedRun(db: DatabaseSync): PipelineRunRow {
  let lastCompleted = readLastCompletedRun(db);
  if (!lastCompleted) {
    executePipelineRun(db);
    lastCompleted = readLastCompletedRun(db);
  }
  if (!lastCompleted) {
    throw new Error("pipeline status unavailable: no completed runs");
  }
  return lastCompleted;
}

function utcMonthBounds(referenceMs: number): { startMs: number; endMs: number } {
  const date = new Date(referenceMs);
  const startMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0);
  const endMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0);
  return {
    startMs,
    endMs,
  };
}

export function getPipelineRunsThisMonth(referenceMs = Date.now()): number {
  const db = getDb();
  const bounds = utcMonthBounds(referenceMs);
  const row = db
    .prepare(
      `
        SELECT count(*) AS count
        FROM pipeline_runs
        WHERE created_at >= ? AND created_at < ?
      `,
    )
    .get(bounds.startMs, bounds.endMs) as { count: number } | undefined;
  return row?.count ?? 0;
}

export function triggerPipelineRun(): { runId: string; status: "started" } {
  const db = getDb();
  const run = executePipelineRun(db);
  return {
    runId: run.runId,
    status: "started",
  };
}

export function getPipelineStatus(): {
  currentRun: {
    id: string;
    status: "running" | "completed" | "failed";
    phase: "phase1" | "phase2" | "idle";
    startedAt: string;
    metricsComputed: number;
  } | null;
  lastCompletedRun: {
    id: string;
    completedAt: string;
    metricsComputed: number;
    recommendationsGenerated: number;
    duration: number;
  };
  nextScheduledRun: string;
  schedule: string;
} {
  const db = getDb();
  const lastCompleted = ensureLatestCompletedRun(db);

  const current = readCurrentRun(db);
  const startedAt = current?.phase1_started_at ?? current?.created_at ?? null;
  const currentRun =
    current && startedAt
      ? {
          id: current.id,
          status: current.status,
          phase:
            current.phase2_started_at && !current.phase2_completed_at
              ? ("phase2" as const)
              : current.phase1_started_at && !current.phase1_completed_at
                ? ("phase1" as const)
                : ("idle" as const),
          startedAt: nowIso(startedAt),
          metricsComputed: Math.max(0, current.metrics_computed ?? 0),
        }
      : null;

  const completedAtMs =
    lastCompleted.phase2_completed_at ??
    lastCompleted.phase1_completed_at ??
    lastCompleted.created_at;
  const durationMs = Math.max(
    0,
    completedAtMs - (lastCompleted.phase1_started_at ?? lastCompleted.created_at),
  );
  const nextScheduledRunMs = readNextScheduledRunMs(db);

  return {
    currentRun,
    lastCompletedRun: {
      id: lastCompleted.id,
      completedAt: nowIso(completedAtMs),
      metricsComputed: Math.max(0, lastCompleted.metrics_computed ?? 0),
      recommendationsGenerated: Math.max(0, lastCompleted.recommendations_generated ?? 0),
      duration: Math.round(durationMs / 1000),
    },
    nextScheduledRun: nowIso(nextScheduledRunMs),
    schedule: "every 6 hours",
  };
}

function formatStepValue(stepName: string, stepValue: number): string {
  if (stepName === "ad_spend" || stepName === "purchases") {
    return `$${Math.round(stepValue).toLocaleString()}`;
  }
  return Math.round(stepValue).toLocaleString();
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
    if (!sourceAdapters.has(trend.adapterId)) {
      continue;
    }
    previous += trend.previousTotal;
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

export function getOverviewData(period: GlowbotPeriod): {
  heroStat: {
    label: string;
    value: number;
    delta: number;
    deltaPercent: number;
    deltaDirection: "up" | "down" | "flat";
    comparedTo: string;
  };
  topActions: Array<{
    rank: number;
    title: string;
    deltaValue: number;
    deltaUnit: string;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    category: string;
  }>;
  pipelineStatus: {
    lastRun: string;
    status: "completed" | "running" | "failed";
    nextRun: string;
  };
} {
  const db = getDb();
  const latestCompletedRun = ensureLatestCompletedRun(db);

  const metrics = readMetrics(db);
  const range = periodRange(metrics, period);
  const currentNewPatients = sumMetric({
    metrics,
    metricName: "appointments_completed",
    adapterIds: ["patient-now-emr", "zenoti-emr"],
    start: range.currentStart,
    end: range.currentEnd,
  });
  const previousNewPatients = sumMetric({
    metrics,
    metricName: "appointments_completed",
    adapterIds: ["patient-now-emr", "zenoti-emr"],
    start: range.previousStart,
    end: range.previousEnd,
  });
  const delta = currentNewPatients - previousNewPatients;
  const deltaPercent =
    previousNewPatients > 0 ? (delta / previousNewPatients) * 100 : currentNewPatients > 0 ? 100 : 0;

  const topActionRows = db
    .prepare(
      `
        SELECT rank, title, delta_value, delta_unit, confidence, category
        FROM recommendations
        WHERE run_id = ?
        ORDER BY rank ASC
        LIMIT 4
      `,
    )
    .all(latestCompletedRun.id) as Array<{
    rank: number;
    title: string;
    delta_value: number | null;
    delta_unit: string | null;
    confidence: string;
    category: string;
  }>;

  const status = getPipelineStatus();
  const pipelineStatusValue: "completed" | "running" | "failed" = status.currentRun
    ? "running"
    : "completed";

  return {
    heroStat: {
      label: "New Patients (Last 30 Days)",
      value: Math.round(currentNewPatients),
      delta: Math.round(delta),
      deltaPercent: Number(deltaPercent.toFixed(1)),
      deltaDirection: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
      comparedTo: `vs previous ${period}`,
    },
    topActions: topActionRows.map((item) => ({
      rank: item.rank,
      title: item.title,
      deltaValue: Number(item.delta_value ?? 0),
      deltaUnit: item.delta_unit ?? "",
      confidence:
        item.confidence === "HIGH" || item.confidence === "LOW" ? item.confidence : "MEDIUM",
      category: item.category,
    })),
    pipelineStatus: {
      lastRun: status.lastCompletedRun.completedAt,
      status: pipelineStatusValue,
      nextRun: status.nextScheduledRun,
    },
  };
}

export function getFunnelData(period: GlowbotPeriod): {
  periodStart: string;
  periodEnd: string;
  steps: Array<{
    name: string;
    order: number;
    value: number;
    formattedValue: string;
    conversionRate: number | null;
    peerMedian: number | null;
    deltaVsPeer: number | null;
    sourceBreakdown: Record<string, number>;
    trend: {
      current: number;
      previous: number;
      delta: number;
      deltaPercent: number;
    };
  }>;
  weakestStep: {
    name: string;
    conversionRate: number;
    peerMedian: number;
    gap: number;
    recommendation: string;
  } | null;
} {
  const db = getDb();
  ensureLatestCompletedRun(db);

  const metrics = readMetrics(db);
  const range = periodRange(metrics, period);
  const currentSnapshots = computeFunnelSnapshots({
    metrics,
    periodStart: range.currentStart,
    periodEnd: range.currentEnd,
    peerMedians: SEED_PEER_MEDIANS,
    computedAt: Date.now(),
  });
  const previousSnapshots = computeFunnelSnapshots({
    metrics,
    periodStart: range.previousStart,
    periodEnd: range.previousEnd,
    peerMedians: SEED_PEER_MEDIANS,
    computedAt: Date.now(),
  });
  const trendDeltas = computeTrendDeltas({
    metrics,
    currentStart: range.currentStart,
    currentEnd: range.currentEnd,
    previousStart: range.previousStart,
    previousEnd: range.previousEnd,
  });
  const dropOff = detectDropOffs({ snapshots: currentSnapshots });
  const weakestWithPeer = currentSnapshots.find(
    (step) =>
      dropOff.weakestStep?.stepName === step.stepName &&
      typeof step.conversionRate === "number" &&
      typeof step.peerMedian === "number" &&
      typeof step.deltaVsPeer === "number",
  );

  return {
    periodStart: range.currentStart,
    periodEnd: range.currentEnd,
    steps: currentSnapshots.map((step) => {
      const previous = previousSnapshots.find((item) => item.stepName === step.stepName);
      const trend = trendForStep({
        stepSourceBreakdown: step.sourceBreakdown,
        stepValue: step.stepValue,
        trendDeltas,
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

export function getModelingData(params: {
  model: string;
  window: GlowbotModelingWindow;
}): {
  modelName: string;
  series: Array<{
    periodLabel: string;
    periodStart: string;
    yourValue: number;
    peerMedian: number | null;
    peerBandLow: number | null;
    peerBandHigh: number | null;
  }>;
  summary: {
    trend: "improving" | "declining" | "stable";
    correlation: number;
    insight: string;
  };
} {
  const db = getDb();
  ensureLatestCompletedRun(db);

  const rows = db
    .prepare(
      `
        SELECT period_label, period_start, your_value, peer_median, peer_band_low, peer_band_high
        FROM modeling_series
        WHERE model_name = ?
        ORDER BY period_start ASC
      `,
    )
    .all(params.model) as Array<{
    period_label: string;
    period_start: string;
    your_value: number;
    peer_median: number | null;
    peer_band_low: number | null;
    peer_band_high: number | null;
  }>;

  const maxPoints = MODEL_WINDOW_COUNT[params.window];
  const series = rows.slice(Math.max(0, rows.length - maxPoints)).map((row) => ({
    periodLabel: row.period_label,
    periodStart: row.period_start,
    yourValue: Number(row.your_value),
    peerMedian: row.peer_median === null ? null : Number(row.peer_median),
    peerBandLow: row.peer_band_low === null ? null : Number(row.peer_band_low),
    peerBandHigh: row.peer_band_high === null ? null : Number(row.peer_band_high),
  }));

  const first = series[0]?.yourValue ?? 0;
  const last = series.at(-1)?.yourValue ?? 0;
  const trendDirection = last > first ? "improving" : last < first ? "declining" : "stable";
  const correlation =
    series.length > 1 && first !== 0 ? Number(Math.min(0.99, Math.max(0, last / first)).toFixed(2)) : 0;

  return {
    modelName: params.model,
    series,
    summary: {
      trend: trendDirection,
      correlation,
      insight:
        trendDirection === "improving"
          ? "Modeled outcome is improving month-over-month against peer bands."
          : trendDirection === "declining"
            ? "Modeled outcome is declining and should be reviewed for intervention."
            : "Modeled outcome is stable relative to peer performance.",
    },
  };
}

type RecommendationRow = {
  id: string;
  rank: number;
  title: string;
  delta_value: number | null;
  delta_unit: string | null;
  description: string;
  confidence: string;
  category: string;
  reasoning: string | null;
  action_data: string | null;
  created_at: number;
};

function readRecommendationsForRun(
  db: DatabaseSync,
  runId: string,
): RecommendationRow[] {
  return db
    .prepare(
      `
        SELECT id, rank, title, delta_value, delta_unit, description, confidence,
               category, reasoning, action_data, created_at
        FROM recommendations
        WHERE run_id = ?
        ORDER BY rank ASC
      `,
    )
    .all(runId) as RecommendationRow[];
}

export function getAgentsData(): {
  agents: Array<{
    category: "demand" | "conversion" | "local" | "benchmark" | "modeling";
    displayName: string;
    status: "active" | "idle" | "error";
    lastRun: string;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    topRecommendation: {
      title: string;
      deltaValue: number;
      deltaUnit: string;
    } | null;
    recommendationCount: number;
  }>;
  lastPipelineRun: {
    id: string;
    status: string;
    completedAt: string;
    recommendationsGenerated: number;
  };
} {
  const db = getDb();
  const latestCompletedRun = ensureLatestCompletedRun(db);
  const completedAtMs =
    latestCompletedRun.phase2_completed_at ??
    latestCompletedRun.phase1_completed_at ??
    latestCompletedRun.created_at;
  const recs = readRecommendationsForRun(db, latestCompletedRun.id);
  const categories = ["demand", "conversion", "local", "benchmark", "modeling"] as const;

  return {
    agents: categories.map((category) => {
      const matching = recs.filter((item) => item.category === category);
      const top = matching[0];
      return {
        category,
        displayName: `${category.charAt(0).toUpperCase()}${category.slice(1)} Agent`,
        status: matching.length > 0 ? ("active" as const) : ("idle" as const),
        lastRun: nowIso(completedAtMs),
        confidence:
          top?.confidence === "HIGH" || top?.confidence === "LOW"
            ? (top.confidence as "HIGH" | "LOW")
            : ("MEDIUM" as const),
        topRecommendation: top
          ? {
              title: top.title,
              deltaValue: Number(top.delta_value ?? 0),
              deltaUnit: top.delta_unit ?? "",
            }
          : null,
        recommendationCount: matching.length,
      };
    }),
    lastPipelineRun: {
      id: latestCompletedRun.id,
      status: "completed",
      completedAt: nowIso(completedAtMs),
      recommendationsGenerated: Math.max(0, latestCompletedRun.recommendations_generated ?? 0),
    },
  };
}

export function getAgentsRecommendations(params: {
  category?: "demand" | "conversion" | "local" | "benchmark" | "modeling";
  limit?: number;
}): {
  recommendations: Array<{
    id: string;
    rank: number;
    title: string;
    deltaValue: number;
    deltaUnit: string;
    description: string;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    category: string;
    reasoning: string;
    actionData: Record<string, unknown>;
    createdAt: string;
  }>;
} {
  const db = getDb();
  const latestCompletedRun = ensureLatestCompletedRun(db);
  const rows = readRecommendationsForRun(db, latestCompletedRun.id);
  const filtered = params.category ? rows.filter((row) => row.category === params.category) : rows;
  const limit = Math.max(1, Math.min(50, params.limit ?? filtered.length));

  return {
    recommendations: filtered.slice(0, limit).map((row) => ({
      id: row.id,
      rank: row.rank,
      title: row.title,
      deltaValue: Number(row.delta_value ?? 0),
      deltaUnit: row.delta_unit ?? "",
      description: row.description,
      confidence:
        row.confidence === "HIGH" || row.confidence === "LOW" ? row.confidence : "MEDIUM",
      category: row.category,
      reasoning: row.reasoning ?? "",
      actionData: parseJsonObject(row.action_data),
      createdAt: nowIso(row.created_at),
    })),
  };
}

export function __resetPipelineStoreForTests() {
  if (dbCache) {
    dbCache.close();
  }
  dbCache = null;
}
