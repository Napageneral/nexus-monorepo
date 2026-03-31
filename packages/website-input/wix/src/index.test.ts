import { describe, expect, it, vi } from "vitest";
import {
  assessWixCompatibility,
  trackWixBookingComplete,
  trackWixFormSubmit,
} from "./index.js";

describe("website-input-wix", () => {
  it("distinguishes baseline-capable from bridge-capable installs", () => {
    expect(
      assessWixCompatibility({
        editorSurface: "studio",
        hasCustomCode: true,
        hasGtm: false,
        hasVelo: false,
        published: true,
        connectedDomain: true,
      }),
    ).toMatchObject({
      baselineSupported: true,
      bridgeSupported: true,
      recommendedLane: "custom-code-baseline",
    });

    expect(
      assessWixCompatibility({
        editorSurface: "studio",
        hasCustomCode: true,
        hasGtm: false,
        hasVelo: false,
        published: true,
        connectedDomain: true,
        usesBookings: true,
      }),
    ).toMatchObject({
      baselineSupported: true,
      bridgeSupported: false,
    });
  });

  it("maps Wix-specific form and booking helpers into canonical tracker calls", async () => {
    const tracker = {
      track: vi.fn(async () => undefined),
    };
    await trackWixFormSubmit(tracker as never, { form_id: "lead-form-1" });
    await trackWixBookingComplete(tracker as never, { booking_id: "booking-1" });

    expect(tracker.track).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ event_name: "form_submit", bridge_surface: "form" }),
    );
    expect(tracker.track).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ event_name: "booking_complete", bridge_surface: "booking" }),
    );
  });
});
