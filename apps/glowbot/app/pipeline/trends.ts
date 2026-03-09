import type { MetricDailyRow, TrendDelta } from "./types";

type MetricTotals = {
  current: number;
  previous: number;
};

function isTotalMetric(row: MetricDailyRow): boolean {
  return (row.metadataKey ?? "") === "";
}

function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

export function computeTrendDeltas(params: {
  metrics: MetricDailyRow[];
  currentStart: string;
  currentEnd: string;
  previousStart: string;
  previousEnd: string;
}): TrendDelta[] {
  const totals = new Map<string, MetricTotals>();

  for (const row of params.metrics) {
    if (!isTotalMetric(row) || !Number.isFinite(row.metricValue)) {
      continue;
    }
    const key = `${row.metricName}::${row.adapterId}`;
    const existing = totals.get(key) ?? { current: 0, previous: 0 };

    if (inRange(row.date, params.currentStart, params.currentEnd)) {
      existing.current += row.metricValue;
    } else if (inRange(row.date, params.previousStart, params.previousEnd)) {
      existing.previous += row.metricValue;
    }

    totals.set(key, existing);
  }

  const output: TrendDelta[] = [];
  for (const [key, value] of totals.entries()) {
    const [metricName, adapterId] = key.split("::");
    const delta = value.current - value.previous;
    const deltaPercent = value.previous > 0 ? delta / value.previous : null;
    output.push({
      metricName,
      adapterId,
      currentTotal: value.current,
      previousTotal: value.previous,
      delta,
      deltaPercent,
    });
  }

  output.sort((a, b) => {
    if (a.metricName !== b.metricName) {
      return a.metricName.localeCompare(b.metricName);
    }
    return a.adapterId.localeCompare(b.adapterId);
  });
  return output;
}
