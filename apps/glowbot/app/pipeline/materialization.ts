import type { GlowbotPeriod } from "../../shared/types.js";
import { computeFunnelSnapshots, FUNNEL_DEFINITION } from "./funnel.js";
import { detectDropOffs } from "./dropoffs.js";
import { buildRecommendations, type MaterializedRecommendation } from "./recommendations.js";
import { computeTrendDeltas } from "./trends.js";
import { GLOWBOT_DERIVED_WINDOWS } from "./constants.js";
import type {
  DropOffAnalysis,
  FunnelSnapshot,
  MaterializedScope,
  MaterializedTrendDelta,
  MetricDailyRow,
  PersistedDropOffAnalysis,
  PersistedFunnelSnapshot,
  PersistedRecommendation,
  WindowPeriodRange,
} from "./types.js";

type RuntimeMethodCaller = {
  callMethod: (method: string, params: unknown) => Promise<unknown>;
};

type RuntimeRow = Record<string, unknown>;

export type MetricElementRecord = {
  id: string;
  entityId: string | null;
  asOf: number | null;
  content: string;
  metadata: Record<string, unknown>;
  row: MetricDailyRow;
  clinicId: string | null;
};

export type ExistingElementRecord = {
  id: string;
  entityId: string | null;
  asOf: number | null;
  content: string;
  metadata: Record<string, unknown>;
};

export type UpsertResult = {
  id: string;
  status: "created" | "updated" | "skipped";
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

function jsonStable(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => jsonStable(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${jsonStable(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
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

function parseMetricRow(metadata: Record<string, unknown>): MetricDailyRow | null {
  const date = asString(metadata.date);
  const adapterId = asString(metadata.adapter_id);
  const metricName = asString(metadata.metric_name);
  const metricValue = asNumber(metadata.metric_value);
  if (!date || !adapterId || !metricName || metricValue === null) {
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

export async function listMetricElements(runtime: RuntimeMethodCaller): Promise<MetricElementRecord[]> {
  const metrics: MetricElementRecord[] = [];
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
      const metadata = parseJsonRecord(element.metadata);
      const row = parseMetricRow(metadata);
      if (!row) {
        continue;
      }
      metrics.push({
        id: asString(element.id),
        entityId: asString(element.entity_id) || null,
        asOf: asNumber(element.as_of),
        content: asString(element.content),
        metadata,
        row,
        clinicId: asString(metadata.clinic_id) || null,
      });
    }
    if (elements.length < limit) {
      break;
    }
    offset += limit;
  }

  metrics.sort((a, b) => a.row.date.localeCompare(b.row.date));
  return metrics;
}

export function periodRangeForWindow(metrics: MetricElementRecord[], window: GlowbotPeriod): WindowPeriodRange {
  const periodDays = window === "7d" ? 7 : window === "30d" ? 30 : 90;
  const allDates = metrics.map((entry) => entry.row.date).sort();
  const periodEnd = allDates[allDates.length - 1] ?? dateToIsoDay(new Date());
  const periodStart = minusDays(periodEnd, periodDays - 1);
  const baselineEnd = minusDays(periodStart, 1);
  const baselineStart = minusDays(baselineEnd, periodDays - 1);
  return {
    window,
    periodStart,
    periodEnd,
    baselineStart,
    baselineEnd,
  };
}

function resolveScopeEntityId(metrics: MetricElementRecord[]): string | null {
  const entityIds = [...new Set(metrics.map((entry) => entry.entityId).filter((entry): entry is string => Boolean(entry)))];
  return entityIds.length === 1 ? entityIds[0] : null;
}

export function deriveScopes(metrics: MetricElementRecord[]): MaterializedScope[] {
  const scopes: MaterializedScope[] = [
    {
      scopeKey: "all",
      clinicId: null,
      entityId: resolveScopeEntityId(metrics),
      metrics,
    },
  ];

  const byClinic = new Map<string, MetricElementRecord[]>();
  for (const metric of metrics) {
    if (!metric.clinicId) {
      continue;
    }
    const existing = byClinic.get(metric.clinicId) ?? [];
    existing.push(metric);
    byClinic.set(metric.clinicId, existing);
  }

  for (const [clinicId, scopedMetrics] of [...byClinic.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    scopes.push({
      scopeKey: `clinic:${clinicId}`,
      clinicId,
      entityId: resolveScopeEntityId(scopedMetrics),
      metrics: scopedMetrics,
    });
  }

  return scopes;
}

export function filterMetricsByRange(metrics: MetricElementRecord[], start: string, end: string): MetricElementRecord[] {
  return metrics.filter((metric) => metric.row.date >= start && metric.row.date <= end);
}

export async function listExistingElements(params: {
  runtime: RuntimeMethodCaller;
  type: string;
  metadataFilter: Record<string, unknown>;
}): Promise<ExistingElementRecord[]> {
  const result = asRecord(
    await params.runtime.callMethod("memory.elements.list", {
      type: params.type,
      metadataFilter: params.metadataFilter,
      limit: 50,
    }),
  );
  return asArray(result.elements).map((element) => ({
    id: asString(element.id),
    entityId: asString(element.entity_id) || null,
    asOf: asNumber(element.as_of),
    content: asString(element.content),
    metadata: parseJsonRecord(element.metadata),
  }));
}

export async function upsertVersionedElement(params: {
  runtime: RuntimeMethodCaller;
  type: string;
  identityFilter: Record<string, unknown>;
  content: string;
  metadata: Record<string, unknown>;
  asOf: number;
  entityId?: string | null;
  sourceJobId?: string | null;
}): Promise<UpsertResult> {
  const existing = (await listExistingElements({
    runtime: params.runtime,
    type: params.type,
    metadataFilter: params.identityFilter,
  }))[0] ?? null;

  if (!existing) {
    const created = asRecord(
      await params.runtime.callMethod("memory.elements.create", {
        type: params.type,
        content: params.content,
        entityId: params.entityId ?? null,
        asOf: params.asOf,
        sourceJobId: params.sourceJobId ?? null,
        metadata: params.metadata,
      }),
    );
    return {
      id: asString(asRecord(created.element).id),
      status: "created",
    };
  }

  const samePayload =
    existing.content === params.content &&
    existing.entityId === (params.entityId ?? null) &&
    existing.asOf === params.asOf &&
    jsonStable(existing.metadata) === jsonStable(params.metadata);

  if (samePayload) {
    return { id: existing.id, status: "skipped" };
  }

  const updated = asRecord(
    await params.runtime.callMethod("memory.elements.update", {
      id: existing.id,
      content: params.content,
      entityId: params.entityId ?? null,
      asOf: params.asOf,
      sourceJobId: params.sourceJobId ?? null,
      metadata: params.metadata,
    }),
  );
  return {
    id: asString(asRecord(updated.element).id),
    status: "updated",
  };
}

export async function createLinks(params: {
  runtime: RuntimeMethodCaller;
  fromElementId: string;
  toElementIds: string[];
  linkType: "derived_from" | "supports" | "supersedes";
}): Promise<void> {
  const unique = [...new Set(params.toElementIds.filter((entry) => entry && entry !== params.fromElementId))];
  for (const toElementId of unique) {
    await params.runtime.callMethod("memory.elements.links.create", {
      fromElementId: params.fromElementId,
      toElementId,
      linkType: params.linkType,
    });
  }
}

export function computePersistedFunnelSnapshots(params: {
  metrics: MetricElementRecord[];
  range: WindowPeriodRange;
  clinicId: string | null;
  scopeKey: string;
  computedAtMs?: number;
}): Array<PersistedFunnelSnapshot & { sourceMetricElementIds: string[] }> {
  const computedAtMs = params.computedAtMs ?? Date.now();
  const rows = params.metrics.map((entry) => entry.row);
  const snapshots = computeFunnelSnapshots({
    metrics: rows,
    periodStart: params.range.periodStart,
    periodEnd: params.range.periodEnd,
    computedAt: computedAtMs,
  });

  return snapshots.map((snapshot) => {
    const stepDefinition = FUNNEL_DEFINITION.find((step) => step.name === snapshot.stepName);
    const sourceMetricElementIds = params.metrics
      .filter((metric) => {
        if ((metric.row.metadataKey ?? "") !== "") {
          return false;
        }
        if (metric.row.date < params.range.periodStart || metric.row.date > params.range.periodEnd) {
          return false;
        }
        return (
          stepDefinition?.metricSources.some(
            (source) =>
              source.adapterId === metric.row.adapterId && source.metricName === metric.row.metricName,
          ) ?? false
        );
      })
      .map((metric) => metric.id);

    return {
      ...snapshot,
      window: params.range.window,
      scopeKey: params.scopeKey,
      clinicId: params.clinicId,
      sourceMetricElementIds,
    };
  });
}

export function computePersistedTrendDeltas(params: {
  metrics: MetricElementRecord[];
  range: WindowPeriodRange;
  clinicId: string | null;
  scopeKey: string;
  computedAtMs?: number;
}): Array<MaterializedTrendDelta & { sourceMetricElementIds: string[] }> {
  const computedAtMs = params.computedAtMs ?? Date.now();
  const rows = params.metrics.map((entry) => entry.row);
  const deltas = computeTrendDeltas({
    metrics: rows,
    currentStart: params.range.periodStart,
    currentEnd: params.range.periodEnd,
    previousStart: params.range.baselineStart,
    previousEnd: params.range.baselineEnd,
  });

  return deltas.map((delta) => ({
    ...delta,
    window: params.range.window,
    scopeKey: params.scopeKey,
    clinicId: params.clinicId,
    periodStart: params.range.periodStart,
    periodEnd: params.range.periodEnd,
    baselineStart: params.range.baselineStart,
    baselineEnd: params.range.baselineEnd,
    computedAt: computedAtMs,
    sourceMetricElementIds: params.metrics
      .filter((metric) => {
        if ((metric.row.metadataKey ?? "") !== "") {
          return false;
        }
        if (metric.row.metricName !== delta.metricName || metric.row.adapterId !== delta.adapterId) {
          return false;
        }
        return (
          (metric.row.date >= params.range.periodStart && metric.row.date <= params.range.periodEnd) ||
          (metric.row.date >= params.range.baselineStart && metric.row.date <= params.range.baselineEnd)
        );
      })
      .map((metric) => metric.id),
  }));
}

export function computePersistedDropoffAnalysis(params: {
  snapshots: PersistedFunnelSnapshot[];
  trendDeltas: MaterializedTrendDelta[];
  clinicId: string | null;
  scopeKey: string;
  range: WindowPeriodRange;
  computedAtMs?: number;
}): PersistedDropOffAnalysis {
  const computedAtMs = params.computedAtMs ?? Date.now();
  const analysis = detectDropOffs({ snapshots: params.snapshots });
  return {
    analysisKey: `${params.range.window}:${params.range.periodEnd}:${params.scopeKey}`,
    clinicId: params.clinicId,
    scopeKey: params.scopeKey,
    window: params.range.window,
    periodStart: params.range.periodStart,
    periodEnd: params.range.periodEnd,
    baselineStart: params.range.baselineStart,
    baselineEnd: params.range.baselineEnd,
    weakestStep: analysis.weakestStep,
    flaggedGaps: analysis.flaggedGaps,
    computedAt: computedAtMs,
    sourceFunnelSnapshotIds: params.snapshots.map((entry) => entry.elementId).filter(Boolean),
    sourceTrendDeltaIds: params.trendDeltas.map((entry) => entry.elementId).filter(Boolean),
  };
}

export function computePersistedRecommendations(params: {
  snapshots: PersistedFunnelSnapshot[];
  trendDeltas: MaterializedTrendDelta[];
  dropoffAnalysis: PersistedDropOffAnalysis;
  clinicId: string | null;
  scopeKey: string;
  range: WindowPeriodRange;
  createdAtMs?: number;
}): PersistedRecommendation[] {
  const createdAtMs = params.createdAtMs ?? Date.now();
  return buildRecommendations({
    snapshots: params.snapshots,
    trendDeltas: params.trendDeltas,
    weakestStep: params.dropoffAnalysis.weakestStep,
    createdAtMs,
  }).map((recommendation) => ({
    ...recommendation,
    clinicId: params.clinicId,
    scopeKey: params.scopeKey,
    window: params.range.window,
    periodStart: params.range.periodStart,
    periodEnd: params.range.periodEnd,
    status: "active",
    sourceDropoffAnalysisIds: params.dropoffAnalysis.elementId ? [params.dropoffAnalysis.elementId] : [],
    sourceTrendDeltaIds: params.trendDeltas.map((entry) => entry.elementId).filter(Boolean),
    sourceFunnelSnapshotIds: params.snapshots
      .filter((entry) => {
        if (recommendation.recommendationKey.startsWith("step:")) {
          return entry.stepName === recommendation.recommendationKey.slice("step:".length);
        }
        if (recommendation.recommendationKey.startsWith("dropoff:")) {
          return entry.stepName === recommendation.recommendationKey.slice("dropoff:".length);
        }
        return true;
      })
      .map((entry) => entry.elementId)
      .filter(Boolean),
  }));
}

export async function supersedeRecommendation(params: {
  runtime: RuntimeMethodCaller;
  existingId: string;
  existingContent: string;
  existingMetadata: Record<string, unknown>;
  asOf: number;
  entityId?: string | null;
}): Promise<string> {
  const updated = asRecord(
    await params.runtime.callMethod("memory.elements.update", {
      id: params.existingId,
      content: params.existingContent,
      entityId: params.entityId ?? null,
      asOf: params.asOf,
      metadata: {
        ...params.existingMetadata,
        status: "superseded",
        superseded_at_ms: params.asOf,
      },
    }),
  );
  return asString(asRecord(updated.element).id);
}

export function allDerivedWindows(): GlowbotPeriod[] {
  return [...GLOWBOT_DERIVED_WINDOWS];
}
