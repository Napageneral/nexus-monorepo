import { describe, expect, test } from "vitest";
import { detectDropOffs } from "./dropoffs";

describe("detectDropOffs", () => {
  test("detects weakest step and peer-gap flags", () => {
    const analysis = detectDropOffs({
      snapshots: [
        {
          id: "x1",
          periodStart: "2026-02-01",
          periodEnd: "2026-02-28",
          stepName: "ad_spend",
          stepOrder: 1,
          stepValue: 1000,
          prevStepValue: null,
          conversionRate: null,
          peerMedian: null,
          deltaVsPeer: null,
          sourceBreakdown: {},
          computedAt: 1,
        },
        {
          id: "x2",
          periodStart: "2026-02-01",
          periodEnd: "2026-02-28",
          stepName: "impressions",
          stepOrder: 2,
          stepValue: 10000,
          prevStepValue: 1000,
          conversionRate: 10,
          peerMedian: 9.7,
          deltaVsPeer: 0.3,
          sourceBreakdown: {},
          computedAt: 1,
        },
        {
          id: "x3",
          periodStart: "2026-02-01",
          periodEnd: "2026-02-28",
          stepName: "clicks",
          stepOrder: 3,
          stepValue: 900,
          prevStepValue: 10000,
          conversionRate: 0.09,
          peerMedian: 0.2,
          deltaVsPeer: -0.11,
          sourceBreakdown: {},
          computedAt: 1,
        },
        {
          id: "x4",
          periodStart: "2026-02-01",
          periodEnd: "2026-02-28",
          stepName: "bookings",
          stepOrder: 6,
          stepValue: 95,
          prevStepValue: 900,
          conversionRate: 95 / 900,
          peerMedian: 0.12,
          deltaVsPeer: 95 / 900 - 0.12,
          sourceBreakdown: {},
          computedAt: 1,
        },
      ],
    });

    expect(analysis.weakestStep).toEqual({
      stepName: "clicks",
      conversionRate: 0.09,
    });
    expect(analysis.flaggedGaps).toEqual([
      {
        stepName: "clicks",
        conversionRate: 0.09,
        peerMedian: 0.2,
        gap: -0.11,
      },
    ]);
  });

  test("returns empty analysis when no conversion steps exist", () => {
    const analysis = detectDropOffs({
      snapshots: [
        {
          id: "x1",
          periodStart: "2026-02-01",
          periodEnd: "2026-02-28",
          stepName: "ad_spend",
          stepOrder: 1,
          stepValue: 1000,
          prevStepValue: null,
          conversionRate: null,
          peerMedian: null,
          deltaVsPeer: null,
          sourceBreakdown: {},
          computedAt: 1,
        },
      ],
    });

    expect(analysis).toEqual({
      weakestStep: null,
      flaggedGaps: [],
    });
  });
});
