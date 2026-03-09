import { describe, expect, test } from "vitest";
import { computeFunnelSnapshots } from "./funnel";
import type { MetricDailyRow } from "./types";

describe("computeFunnelSnapshots", () => {
  test("stitches funnel steps from raw metrics with source breakdown and peer deltas", () => {
    const metrics: MetricDailyRow[] = [
      { date: "2026-02-01", adapterId: "google-ads", metricName: "ad_spend", metricValue: 1000 },
      { date: "2026-02-02", adapterId: "meta-ads", metricName: "ad_spend", metricValue: 500 },
      {
        date: "2026-02-01",
        adapterId: "google-ads",
        metricName: "ad_impressions",
        metricValue: 6000,
      },
      {
        date: "2026-02-01",
        adapterId: "meta-ads",
        metricName: "ad_impressions",
        metricValue: 3000,
      },
      {
        date: "2026-02-01",
        adapterId: "google-business-profile",
        metricName: "listing_views_search",
        metricValue: 700,
      },
      {
        date: "2026-02-01",
        adapterId: "google-business-profile",
        metricName: "listing_views_maps",
        metricValue: 300,
      },
      { date: "2026-02-01", adapterId: "google-ads", metricName: "ad_clicks", metricValue: 500 },
      { date: "2026-02-01", adapterId: "meta-ads", metricName: "ad_clicks", metricValue: 300 },
      {
        date: "2026-02-01",
        adapterId: "google-business-profile",
        metricName: "listing_clicks_website",
        metricValue: 40,
      },
      {
        date: "2026-02-01",
        adapterId: "google-business-profile",
        metricName: "listing_clicks_directions",
        metricValue: 30,
      },
      {
        date: "2026-02-01",
        adapterId: "google-business-profile",
        metricName: "listing_clicks_phone",
        metricValue: 20,
      },
      {
        date: "2026-02-02",
        adapterId: "patient-now-emr",
        metricName: "appointments_booked",
        metricValue: 80,
      },
      {
        date: "2026-02-03",
        adapterId: "zenoti-emr",
        metricName: "appointments_booked",
        metricValue: 20,
      },
      {
        date: "2026-02-02",
        adapterId: "patient-now-emr",
        metricName: "appointments_completed",
        metricValue: 60,
      },
      {
        date: "2026-02-03",
        adapterId: "zenoti-emr",
        metricName: "appointments_completed",
        metricValue: 10,
      },
      { date: "2026-02-02", adapterId: "patient-now-emr", metricName: "revenue", metricValue: 22000 },
      { date: "2026-02-03", adapterId: "zenoti-emr", metricName: "revenue", metricValue: 3000 },
      {
        date: "2026-02-02",
        adapterId: "google-ads",
        metricName: "ad_clicks",
        metricValue: 999,
        metadataKey: "campaign:alpha",
      },
    ];

    const snapshots = computeFunnelSnapshots({
      metrics,
      periodStart: "2026-02-01",
      periodEnd: "2026-02-28",
      computedAt: 1_700_000_000_000,
      peerMedians: {
        impressions: 6.5,
        clicks: 0.09,
        bookings: 0.08,
      },
    });

    expect(snapshots.map((item) => item.stepName)).toEqual([
      "ad_spend",
      "impressions",
      "clicks",
      "page_views",
      "page_actions",
      "bookings",
      "consults",
      "purchases",
    ]);

    const adSpend = snapshots[0]!;
    expect(adSpend).toMatchObject({
      stepValue: 1500,
      prevStepValue: null,
      conversionRate: null,
      sourceBreakdown: {
        "google-ads": 1000,
        "meta-ads": 500,
      },
      computedAt: 1_700_000_000_000,
    });

    const impressions = snapshots[1]!;
    expect(impressions).toMatchObject({
      stepValue: 10000,
      prevStepValue: 1500,
      conversionRate: 10000 / 1500,
      peerMedian: 6.5,
      deltaVsPeer: 10000 / 1500 - 6.5,
      sourceBreakdown: {
        "google-ads": 6000,
        "meta-ads": 3000,
        "google-business-profile": 1000,
      },
    });

    const clicks = snapshots[2]!;
    expect(clicks.stepValue).toBe(890);
    expect(clicks.sourceBreakdown).toEqual({
      "google-ads": 500,
      "meta-ads": 300,
      "google-business-profile": 90,
    });

    const bookings = snapshots[5]!;
    expect(bookings.stepValue).toBe(100);
    expect(bookings.conversionRate).toBeNull();
    expect(bookings.peerMedian).toBe(0.08);
    expect(bookings.deltaVsPeer).toBeNull();

    const consults = snapshots[6]!;
    expect(consults.stepValue).toBe(70);
    expect(consults.conversionRate).toBe(0.7);

    const purchases = snapshots[7]!;
    expect(purchases.stepValue).toBe(25000);
    expect(purchases.conversionRate).toBe(25000 / 70);
  });
});
