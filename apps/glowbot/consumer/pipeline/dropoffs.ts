import type { DropOffAnalysis, FunnelSnapshot } from "./types";

export function detectDropOffs(params: { snapshots: FunnelSnapshot[] }): DropOffAnalysis {
  const ordered = [...params.snapshots].sort((a, b) => a.stepOrder - b.stepOrder);
  const withConversion = ordered.filter(
    (step) => typeof step.conversionRate === "number" && Number.isFinite(step.conversionRate),
  );

  let weakestStep: DropOffAnalysis["weakestStep"] = null;
  for (const step of withConversion) {
    if (!weakestStep || step.conversionRate! < weakestStep.conversionRate) {
      weakestStep = {
        stepName: step.stepName,
        conversionRate: step.conversionRate!,
      };
    }
  }

  const flaggedGaps = ordered
    .filter(
      (step) =>
        typeof step.conversionRate === "number" &&
        typeof step.peerMedian === "number" &&
        typeof step.deltaVsPeer === "number" &&
        step.deltaVsPeer < -0.1,
    )
    .map((step) => ({
      stepName: step.stepName,
      conversionRate: step.conversionRate!,
      peerMedian: step.peerMedian!,
      gap: step.deltaVsPeer!,
    }));

  return {
    weakestStep,
    flaggedGaps,
  };
}
