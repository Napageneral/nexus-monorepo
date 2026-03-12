export interface MetricDailyRow {
  date: string;
  adapterId: string;
  metricName: string;
  metricValue: number;
  metadataKey?: string;
}

export interface MaterializedScope {
  scopeKey: string;
  clinicId: string | null;
  entityId: string | null;
  metrics: Array<{
    id: string;
    entityId: string | null;
    asOf: number | null;
    content: string;
    metadata: Record<string, unknown>;
    row: MetricDailyRow;
    clinicId: string | null;
  }>;
}

export interface WindowPeriodRange {
  window: "7d" | "30d" | "90d";
  periodStart: string;
  periodEnd: string;
  baselineStart: string;
  baselineEnd: string;
}

export interface FunnelMetricSource {
  adapterId: string;
  metricName: string;
}

export interface FunnelStepDefinition {
  name: string;
  order: number;
  metricSources: FunnelMetricSource[];
  aggregation: "sum" | "latest";
}

export interface FunnelSnapshot {
  id: string;
  periodStart: string;
  periodEnd: string;
  stepName: string;
  stepOrder: number;
  stepValue: number;
  prevStepValue: number | null;
  conversionRate: number | null;
  peerMedian: number | null;
  deltaVsPeer: number | null;
  sourceBreakdown: Record<string, number>;
  computedAt: number;
}

export interface PersistedFunnelSnapshot extends FunnelSnapshot {
  window: "7d" | "30d" | "90d";
  scopeKey: string;
  clinicId: string | null;
  elementId?: string;
}

export interface TrendDelta {
  metricName: string;
  adapterId: string;
  currentTotal: number;
  previousTotal: number;
  delta: number;
  deltaPercent: number | null;
}

export interface MaterializedTrendDelta extends TrendDelta {
  window: "7d" | "30d" | "90d";
  scopeKey: string;
  clinicId: string | null;
  periodStart: string;
  periodEnd: string;
  baselineStart: string;
  baselineEnd: string;
  computedAt: number;
  elementId?: string;
}

export interface DropOffGap {
  stepName: string;
  conversionRate: number;
  peerMedian: number;
  gap: number;
}

export interface DropOffWeakestStep {
  stepName: string;
  conversionRate: number;
}

export interface DropOffAnalysis {
  weakestStep: DropOffWeakestStep | null;
  flaggedGaps: DropOffGap[];
}

export interface PersistedDropOffAnalysis extends DropOffAnalysis {
  analysisKey: string;
  clinicId: string | null;
  scopeKey: string;
  window: "7d" | "30d" | "90d";
  periodStart: string;
  periodEnd: string;
  baselineStart: string;
  baselineEnd: string;
  computedAt: number;
  sourceFunnelSnapshotIds: string[];
  sourceTrendDeltaIds: string[];
  elementId?: string;
}

export interface PersistedRecommendation {
  id: string;
  recommendationKey: string;
  rank: number;
  title: string;
  deltaValue: number;
  deltaUnit: string;
  description: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  category: string;
  reasoning: string;
  actionData: Record<string, unknown>;
  createdAtMs: number;
  clinicId: string | null;
  scopeKey: string;
  window: "7d" | "30d" | "90d";
  periodStart: string;
  periodEnd: string;
  status: "active" | "superseded";
  sourceDropoffAnalysisIds: string[];
  sourceTrendDeltaIds: string[];
  sourceFunnelSnapshotIds: string[];
  elementId?: string;
}
