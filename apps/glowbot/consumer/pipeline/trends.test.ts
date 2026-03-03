import { describe, expect, test } from "vitest";
import { computeTrendDeltas } from "./trends";

describe("computeTrendDeltas", () => {
  test("computes current vs previous totals and percentage deltas", () => {
    const output = computeTrendDeltas({
      currentStart: "2026-02-01",
      currentEnd: "2026-02-28",
      previousStart: "2026-01-01",
      previousEnd: "2026-01-31",
      metrics: [
        {
          date: "2026-02-01",
          adapterId: "google-ads",
          metricName: "ad_spend",
          metricValue: 1200,
        },
        {
          date: "2026-02-10",
          adapterId: "google-ads",
          metricName: "ad_spend",
          metricValue: 800,
        },
        {
          date: "2026-01-03",
          adapterId: "google-ads",
          metricName: "ad_spend",
          metricValue: 1000,
        },
        {
          date: "2026-01-20",
          adapterId: "google-ads",
          metricName: "ad_spend",
          metricValue: 500,
        },
        {
          date: "2026-02-05",
          adapterId: "meta-ads",
          metricName: "ad_clicks",
          metricValue: 400,
        },
        {
          date: "2026-01-05",
          adapterId: "meta-ads",
          metricName: "ad_clicks",
          metricValue: 0,
        },
        {
          date: "2026-02-08",
          adapterId: "google-ads",
          metricName: "ad_spend",
          metricValue: 99,
          metadataKey: "campaign:ignored",
        },
      ],
    });

    expect(output).toEqual([
      {
        metricName: "ad_clicks",
        adapterId: "meta-ads",
        currentTotal: 400,
        previousTotal: 0,
        delta: 400,
        deltaPercent: null,
      },
      {
        metricName: "ad_spend",
        adapterId: "google-ads",
        currentTotal: 2000,
        previousTotal: 1500,
        delta: 500,
        deltaPercent: 500 / 1500,
      },
    ]);
  });
});
