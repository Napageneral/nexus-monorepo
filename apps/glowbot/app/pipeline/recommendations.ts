import type { GlowbotAgentsRecommendationsResponse } from "../../shared/types.js";
import type { DropOffAnalysis, FunnelSnapshot, TrendDelta } from "./types.js";

export type RecommendationCategory = "demand" | "conversion" | "local" | "benchmark" | "modeling";
export type RecommendationConfidence = "HIGH" | "MEDIUM" | "LOW";

type RecommendationCandidate = {
  key: string;
  title: string;
  deltaValue: number;
  deltaUnit: string;
  description: string;
  confidence: RecommendationConfidence;
  category: RecommendationCategory;
  reasoning: string;
  actionData: Record<string, unknown>;
  score: number;
};

export type MaterializedRecommendation = Omit<
  GlowbotAgentsRecommendationsResponse["recommendations"][number],
  "createdAt"
> & {
  createdAtMs: number;
  recommendationKey: string;
};

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

export function buildRecommendations(params: {
  snapshots: FunnelSnapshot[];
  trendDeltas: TrendDelta[];
  weakestStep: DropOffAnalysis["weakestStep"];
  createdAtMs?: number;
}): MaterializedRecommendation[] {
  const createdAtMs = params.createdAtMs ?? Date.now();
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

  return [...deduped.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((candidate, index) => ({
      id: `rec-${index + 1}-${slugify(candidate.key)}`,
      recommendationKey: candidate.key,
      rank: index + 1,
      title: candidate.title,
      deltaValue: candidate.deltaValue,
      deltaUnit: candidate.deltaUnit,
      description: candidate.description,
      confidence: candidate.confidence,
      category: candidate.category,
      reasoning: candidate.reasoning,
      actionData: candidate.actionData,
      createdAtMs,
    }));
}
