import type { JobScriptContext } from "../../../../../nex/src/nex/control-plane/server-work.js";
import {
  computePersistedRecommendations,
  createLinks,
  deriveScopes,
  listExistingElements,
  listMetricElements,
  periodRangeForWindow,
  supersedeRecommendation,
  allDerivedWindows,
} from "../materialization.js";
import type {
  MaterializedTrendDelta,
  PersistedDropOffAnalysis,
  PersistedFunnelSnapshot,
  PersistedRecommendation,
} from "../types.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

function parsePersistedFunnelSnapshot(row: {
  id: string;
  metadata: Record<string, unknown>;
}): PersistedFunnelSnapshot | null {
  const metadata = row.metadata;
  const stepName = asString(metadata.step_name);
  const periodStart = asString(metadata.period_start);
  const periodEnd = asString(metadata.period_end);
  const window = asString(metadata.window) as PersistedFunnelSnapshot["window"];
  const scopeKey = asString(metadata.scope_key);
  const stepOrder = asNumber(metadata.step_order);
  const stepValue = asNumber(metadata.step_value);
  if (!stepName || !periodStart || !periodEnd || !window || !scopeKey || stepOrder === null || stepValue === null) {
    return null;
  }
  return {
    id: `${periodStart}:${periodEnd}:${stepName}`,
    elementId: row.id,
    periodStart,
    periodEnd,
    window,
    scopeKey,
    clinicId: asString(metadata.clinic_id) || null,
    stepName,
    stepOrder,
    stepValue,
    prevStepValue: asNumber(metadata.prev_step_value),
    conversionRate: asNumber(metadata.conversion_rate),
    peerMedian: asNumber(metadata.peer_median),
    deltaVsPeer: asNumber(metadata.delta_vs_peer),
    sourceBreakdown: asRecord(metadata.source_breakdown) as Record<string, number>,
    computedAt: asNumber(metadata.computed_at_ms) ?? Date.now(),
  };
}

function parsePersistedTrendDelta(row: {
  id: string;
  metadata: Record<string, unknown>;
}): MaterializedTrendDelta | null {
  const metadata = row.metadata;
  const metricName = asString(metadata.metric_name);
  const adapterId = asString(metadata.adapter_id);
  const window = asString(metadata.window) as MaterializedTrendDelta["window"];
  const scopeKey = asString(metadata.scope_key);
  const periodStart = asString(metadata.period_start);
  const periodEnd = asString(metadata.period_end);
  const baselineStart = asString(metadata.baseline_start);
  const baselineEnd = asString(metadata.baseline_end);
  const currentTotal = asNumber(metadata.current_total);
  const previousTotal = asNumber(metadata.previous_total);
  const delta = asNumber(metadata.delta);
  if (
    !metricName ||
    !adapterId ||
    !window ||
    !scopeKey ||
    !periodStart ||
    !periodEnd ||
    !baselineStart ||
    !baselineEnd ||
    currentTotal === null ||
    previousTotal === null ||
    delta === null
  ) {
    return null;
  }
  return {
    elementId: row.id,
    metricName,
    adapterId,
    window,
    scopeKey,
    clinicId: asString(metadata.clinic_id) || null,
    periodStart,
    periodEnd,
    baselineStart,
    baselineEnd,
    currentTotal,
    previousTotal,
    delta,
    deltaPercent: asNumber(metadata.delta_percent),
    computedAt: asNumber(metadata.computed_at_ms) ?? Date.now(),
  };
}

function parsePersistedDropoff(row: {
  id: string;
  metadata: Record<string, unknown>;
}): PersistedDropOffAnalysis | null {
  const metadata = row.metadata;
  const analysisKey = asString(metadata.analysis_key);
  const window = asString(metadata.window) as PersistedDropOffAnalysis["window"];
  const scopeKey = asString(metadata.scope_key);
  const periodStart = asString(metadata.period_start);
  const periodEnd = asString(metadata.period_end);
  const baselineStart = asString(metadata.baseline_start);
  const baselineEnd = asString(metadata.baseline_end);
  if (!analysisKey || !window || !scopeKey || !periodStart || !periodEnd) {
    return null;
  }
  return {
    elementId: row.id,
    analysisKey,
    clinicId: asString(metadata.clinic_id) || null,
    scopeKey,
    window,
    periodStart,
    periodEnd,
    baselineStart,
    baselineEnd,
    weakestStep: (metadata.weakest_step as PersistedDropOffAnalysis["weakestStep"]) ?? null,
    flaggedGaps: Array.isArray(metadata.flagged_gaps)
      ? (metadata.flagged_gaps as PersistedDropOffAnalysis["flaggedGaps"])
      : [],
    computedAt: asNumber(metadata.computed_at_ms) ?? Date.now(),
    sourceFunnelSnapshotIds: [],
    sourceTrendDeltaIds: [],
  };
}

function recommendationMetadata(recommendation: PersistedRecommendation): Record<string, unknown> {
  return {
    recommendation_key: recommendation.recommendationKey,
    window: recommendation.window,
    scope_key: recommendation.scopeKey,
    clinic_id: recommendation.clinicId ?? undefined,
    period_start: recommendation.periodStart,
    period_end: recommendation.periodEnd,
    category: recommendation.category,
    status: recommendation.status,
    rank: recommendation.rank,
    delta_value: recommendation.deltaValue,
    delta_unit: recommendation.deltaUnit,
    confidence: recommendation.confidence,
    action_data: recommendation.actionData,
    reasoning: recommendation.reasoning,
    created_at_ms: recommendation.createdAtMs,
  };
}

export default async function handler(ctx: JobScriptContext): Promise<Record<string, unknown>> {
  const metricElements = await listMetricElements(ctx.runtime);
  const scopes = deriveScopes(metricElements);
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let superseded = 0;
  const activeRecommendationIds: string[] = [];
  const supersededRecommendationIds: string[] = [];

  for (const scope of scopes) {
    for (const window of allDerivedWindows()) {
      const range = periodRangeForWindow(scope.metrics, window);
      const [snapshotRows, trendRows, dropoffRows, activeRows] = await Promise.all([
        listExistingElements({
          runtime: ctx.runtime,
          type: "funnel_snapshot",
          metadataFilter: {
            window,
            scope_key: scope.scopeKey,
            ...(scope.clinicId ? { clinic_id: scope.clinicId } : {}),
            period_start: range.periodStart,
            period_end: range.periodEnd,
          },
        }),
        listExistingElements({
          runtime: ctx.runtime,
          type: "trend_delta",
          metadataFilter: {
            window,
            scope_key: scope.scopeKey,
            ...(scope.clinicId ? { clinic_id: scope.clinicId } : {}),
            period_start: range.periodStart,
            period_end: range.periodEnd,
            baseline_start: range.baselineStart,
            baseline_end: range.baselineEnd,
          },
        }),
        listExistingElements({
          runtime: ctx.runtime,
          type: "dropoff_analysis",
          metadataFilter: {
            window,
            scope_key: scope.scopeKey,
            ...(scope.clinicId ? { clinic_id: scope.clinicId } : {}),
            period_start: range.periodStart,
            period_end: range.periodEnd,
          },
        }),
        listExistingElements({
          runtime: ctx.runtime,
          type: "recommendation",
          metadataFilter: {
            window,
            scope_key: scope.scopeKey,
            ...(scope.clinicId ? { clinic_id: scope.clinicId } : {}),
            period_end: range.periodEnd,
            status: "active",
          },
        }),
      ]);

      const snapshots = snapshotRows.map(parsePersistedFunnelSnapshot).filter(Boolean) as PersistedFunnelSnapshot[];
      const trendDeltas = trendRows.map(parsePersistedTrendDelta).filter(Boolean) as MaterializedTrendDelta[];
      const dropoff = (dropoffRows.map(parsePersistedDropoff).filter(Boolean) as PersistedDropOffAnalysis[])[0] ?? null;
      if (!dropoff) {
        continue;
      }

      const generated = computePersistedRecommendations({
        snapshots,
        trendDeltas,
        dropoffAnalysis: dropoff,
        clinicId: scope.clinicId,
        scopeKey: scope.scopeKey,
        range,
        createdAtMs: ctx.now.getTime(),
      });

      const activeByKey = new Map(
        activeRows.map((row) => [asString(row.metadata.recommendation_key), row] as const),
      );
      const generatedKeys = new Set(generated.map((entry) => entry.recommendationKey));

      for (const recommendation of generated) {
        const metadata = recommendationMetadata(recommendation);
        const existing = activeByKey.get(recommendation.recommendationKey);
        if (!existing) {
          const createdResult = asRecord(
            await ctx.runtime.callMethod("memory.elements.create", {
              type: "recommendation",
              content: recommendation.title,
              entityId: scope.entityId,
              asOf: recommendation.createdAtMs,
              metadata,
            }),
          );
          const elementId = asString(asRecord(createdResult.element).id);
          activeRecommendationIds.push(elementId);
          created += 1;
          await createLinks({
            runtime: ctx.runtime,
            fromElementId: elementId,
            toElementIds: [
              ...recommendation.sourceDropoffAnalysisIds,
              ...recommendation.sourceTrendDeltaIds,
              ...recommendation.sourceFunnelSnapshotIds,
            ],
            linkType: "supports",
          });
          continue;
        }

        const existingMetadata = existing.metadata;
        const samePayload =
          asString(existing.content) === recommendation.title &&
          jsonStable(existingMetadata) === jsonStable(metadata);
        if (samePayload) {
          activeRecommendationIds.push(existing.id);
          skipped += 1;
          continue;
        }

        const supersededId = await supersedeRecommendation({
          runtime: ctx.runtime,
          existingId: existing.id,
          existingContent: existing.content,
          existingMetadata,
          entityId: scope.entityId,
          asOf: recommendation.createdAtMs,
        });
        supersededRecommendationIds.push(supersededId);
        superseded += 1;

        const createdResult = asRecord(
          await ctx.runtime.callMethod("memory.elements.create", {
            type: "recommendation",
            content: recommendation.title,
            entityId: scope.entityId,
            asOf: recommendation.createdAtMs,
            metadata,
          }),
        );
        const elementId = asString(asRecord(createdResult.element).id);
        activeRecommendationIds.push(elementId);
        updated += 1;
        await createLinks({
          runtime: ctx.runtime,
          fromElementId: elementId,
          toElementIds: [supersededId],
          linkType: "supersedes",
        });
        await createLinks({
          runtime: ctx.runtime,
          fromElementId: elementId,
          toElementIds: [
            ...recommendation.sourceDropoffAnalysisIds,
            ...recommendation.sourceTrendDeltaIds,
            ...recommendation.sourceFunnelSnapshotIds,
          ],
          linkType: "supports",
        });
      }

      for (const existing of activeRows) {
        const key = asString(existing.metadata.recommendation_key);
        if (generatedKeys.has(key)) {
          continue;
        }
        const supersededId = await supersedeRecommendation({
          runtime: ctx.runtime,
          existingId: existing.id,
          existingContent: existing.content,
          existingMetadata: existing.metadata,
          entityId: scope.entityId,
          asOf: ctx.now.getTime(),
        });
        supersededRecommendationIds.push(supersededId);
        superseded += 1;
      }
    }
  }

  return {
    status: "ok",
    created,
    updated,
    skipped,
    superseded,
    activeRecommendationIds,
    supersededRecommendationIds,
  };
}
