import type { JobScriptContext } from "../../../../../nex/src/nex/control-plane/server-work.js";
import {
  computePersistedTrendDeltas,
  createLinks,
  deriveScopes,
  listMetricElements,
  periodRangeForWindow,
  upsertVersionedElement,
  allDerivedWindows,
} from "../materialization.js";

function asContent(metricName: string, adapterId: string, delta: number, periodStart: string, periodEnd: string): string {
  return `${adapterId}:${metricName} delta=${delta} for ${periodStart}..${periodEnd}`;
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
      const deltas = computePersistedTrendDeltas({
        metrics: scope.metrics,
        range,
        clinicId: scope.clinicId,
        scopeKey: scope.scopeKey,
        computedAtMs: ctx.now.getTime(),
      });
      for (const delta of deltas) {
        const metadata = {
          window: delta.window,
          scope_key: delta.scopeKey,
          clinic_id: delta.clinicId ?? undefined,
          metric_name: delta.metricName,
          adapter_id: delta.adapterId,
          period_start: delta.periodStart,
          period_end: delta.periodEnd,
          baseline_start: delta.baselineStart,
          baseline_end: delta.baselineEnd,
          current_total: delta.currentTotal,
          previous_total: delta.previousTotal,
          delta: delta.delta,
          delta_percent: delta.deltaPercent ?? undefined,
          computed_at_ms: delta.computedAt,
        };
        const result = await upsertVersionedElement({
          runtime: ctx.runtime,
          type: "trend_delta",
          identityFilter: {
            window: delta.window,
            scope_key: delta.scopeKey,
            ...(delta.clinicId ? { clinic_id: delta.clinicId } : {}),
            metric_name: delta.metricName,
            adapter_id: delta.adapterId,
            period_start: delta.periodStart,
            period_end: delta.periodEnd,
            baseline_start: delta.baselineStart,
            baseline_end: delta.baselineEnd,
          },
          entityId: scope.entityId,
          asOf: delta.computedAt,
          content: asContent(delta.metricName, delta.adapterId, delta.delta, delta.periodStart, delta.periodEnd),
          metadata,
        });
        if (result.status === "created") created += 1;
        if (result.status === "updated") updated += 1;
        if (result.status === "skipped") skipped += 1;
        elementIds.push(result.id);
        delta.elementId = result.id;
        if (result.status !== "skipped") {
          await createLinks({
            runtime: ctx.runtime,
            fromElementId: result.id,
            toElementIds: delta.sourceMetricElementIds,
            linkType: "derived_from",
          });
        }
      }
    }
  }

  return {
    status: "ok",
    created,
    updated,
    skipped,
    trendDeltaIds: elementIds,
  };
}
