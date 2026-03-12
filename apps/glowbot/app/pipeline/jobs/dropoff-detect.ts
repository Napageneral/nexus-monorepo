import type { JobScriptContext } from "../../../../../nex/src/nex/control-plane/server-work.js";
import {
  computePersistedDropoffAnalysis,
  createLinks,
  deriveScopes,
  listExistingElements,
  listMetricElements,
  periodRangeForWindow,
  upsertVersionedElement,
  allDerivedWindows,
} from "../materialization.js";
import type { MaterializedTrendDelta, PersistedFunnelSnapshot } from "../types.js";

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

export default async function handler(ctx: JobScriptContext): Promise<Record<string, unknown>> {
  const metricElements = await listMetricElements(ctx.runtime);
  const scopes = deriveScopes(metricElements);
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const elementIds: string[] = [];

  for (const scope of scopes) {
    for (const window of allDerivedWindows()) {
      const range = periodRangeForWindow(scope.metrics, window);
      const [snapshotRows, trendRows] = await Promise.all([
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
      ]);

      const snapshots = snapshotRows.map(parsePersistedFunnelSnapshot).filter(Boolean) as PersistedFunnelSnapshot[];
      const trendDeltas = trendRows.map(parsePersistedTrendDelta).filter(Boolean) as MaterializedTrendDelta[];
      if (snapshots.length === 0) {
        continue;
      }

      const analysis = computePersistedDropoffAnalysis({
        snapshots,
        trendDeltas,
        clinicId: scope.clinicId,
        scopeKey: scope.scopeKey,
        range,
        computedAtMs: ctx.now.getTime(),
      });

      const metadata = {
        analysis_key: analysis.analysisKey,
        window: analysis.window,
        scope_key: analysis.scopeKey,
        clinic_id: analysis.clinicId ?? undefined,
        period_start: analysis.periodStart,
        period_end: analysis.periodEnd,
        baseline_start: analysis.baselineStart,
        baseline_end: analysis.baselineEnd,
        weakest_step: analysis.weakestStep ?? undefined,
        flagged_gaps: analysis.flaggedGaps,
        computed_at_ms: analysis.computedAt,
      };
      const result = await upsertVersionedElement({
        runtime: ctx.runtime,
        type: "dropoff_analysis",
        identityFilter: {
          analysis_key: analysis.analysisKey,
          window: analysis.window,
          scope_key: analysis.scopeKey,
          ...(analysis.clinicId ? { clinic_id: analysis.clinicId } : {}),
          period_start: analysis.periodStart,
          period_end: analysis.periodEnd,
        },
        entityId: scope.entityId,
        asOf: analysis.computedAt,
        content: `dropoff analysis for ${analysis.periodStart}..${analysis.periodEnd}`,
        metadata,
      });
      if (result.status === "created") created += 1;
      if (result.status === "updated") updated += 1;
      if (result.status === "skipped") skipped += 1;
      elementIds.push(result.id);
      analysis.elementId = result.id;
      if (result.status !== "skipped") {
        await createLinks({
          runtime: ctx.runtime,
          fromElementId: result.id,
          toElementIds: [...analysis.sourceFunnelSnapshotIds, ...analysis.sourceTrendDeltaIds],
          linkType: "derived_from",
        });
      }
    }
  }

  return {
    status: "ok",
    created,
    updated,
    skipped,
    dropoffAnalysisIds: elementIds,
  };
}
