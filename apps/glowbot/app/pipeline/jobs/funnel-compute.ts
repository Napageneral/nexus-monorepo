import type { JobScriptContext } from "../../../../../nex/src/nex/control-plane/server-work.js";
import {
  computePersistedFunnelSnapshots,
  createLinks,
  deriveScopes,
  filterMetricsByRange,
  listMetricElements,
  periodRangeForWindow,
  upsertVersionedElement,
  allDerivedWindows,
} from "../materialization.js";

function asContent(stepName: string, stepValue: number, periodStart: string, periodEnd: string): string {
  return `${stepName}=${stepValue} for ${periodStart}..${periodEnd}`;
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
      const inWindow = filterMetricsByRange(scope.metrics, range.periodStart, range.periodEnd);
      if (inWindow.length === 0) {
        continue;
      }

      const snapshots = computePersistedFunnelSnapshots({
        metrics: inWindow,
        range,
        clinicId: scope.clinicId,
        scopeKey: scope.scopeKey,
        computedAtMs: ctx.now.getTime(),
      });

      for (const snapshot of snapshots) {
        const metadata = {
          window: snapshot.window,
          scope_key: snapshot.scopeKey,
          clinic_id: snapshot.clinicId ?? undefined,
          step_name: snapshot.stepName,
          step_order: snapshot.stepOrder,
          period_start: snapshot.periodStart,
          period_end: snapshot.periodEnd,
          step_value: snapshot.stepValue,
          prev_step_value: snapshot.prevStepValue ?? undefined,
          conversion_rate: snapshot.conversionRate ?? undefined,
          peer_median: snapshot.peerMedian ?? undefined,
          delta_vs_peer: snapshot.deltaVsPeer ?? undefined,
          source_breakdown: snapshot.sourceBreakdown,
          computed_at_ms: snapshot.computedAt,
        };
        const result = await upsertVersionedElement({
          runtime: ctx.runtime,
          type: "funnel_snapshot",
          identityFilter: {
            window: snapshot.window,
            scope_key: snapshot.scopeKey,
            ...(snapshot.clinicId ? { clinic_id: snapshot.clinicId } : {}),
            step_name: snapshot.stepName,
            period_start: snapshot.periodStart,
            period_end: snapshot.periodEnd,
          },
          entityId: scope.entityId,
          asOf: snapshot.computedAt,
          content: asContent(snapshot.stepName, snapshot.stepValue, snapshot.periodStart, snapshot.periodEnd),
          metadata,
        });
        if (result.status === "created") created += 1;
        if (result.status === "updated") updated += 1;
        if (result.status === "skipped") skipped += 1;
        elementIds.push(result.id);
        snapshot.elementId = result.id;
        if (result.status !== "skipped") {
          await createLinks({
            runtime: ctx.runtime,
            fromElementId: result.id,
            toElementIds: snapshot.sourceMetricElementIds,
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
    funnelSnapshotIds: elementIds,
  };
}
