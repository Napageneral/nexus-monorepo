export interface MetricDailyRow {
  date: string;
  adapterId: string;
  metricName: string;
  metricValue: number;
  metadataKey?: string;
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

export interface TrendDelta {
  metricName: string;
  adapterId: string;
  currentTotal: number;
  previousTotal: number;
  delta: number;
  deltaPercent: number | null;
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
