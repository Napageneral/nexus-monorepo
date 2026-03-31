import { describe, expect, it, vi } from "vitest";
import { consumeGtmEvent, mapGtmEvent } from "./index.js";

describe("website-input-gtm", () => {
  it("maps common GTM ecommerce and lead events into canonical website events", () => {
    expect(mapGtmEvent({ event: "view_item", item_id: "prod-1", item_name: "Body Pillow" })).toMatchObject({
      event_name: "product_view",
      product_id: "prod-1",
    });
    expect(mapGtmEvent({ event: "generate_lead", form_id: "lead-form" })).toMatchObject({
      event_name: "form_submit",
      bridge_surface: "lead",
      form_id: "lead-form",
    });
  });

  it("forwards mapped GTM events to the shared tracker", async () => {
    const tracker = {
      track: vi.fn(async () => undefined),
    };
    await consumeGtmEvent(tracker as never, {
      event: "cta_click",
      surface_id: "hero-primary",
      surface_label: "Book now",
    });
    expect(tracker.track).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: "cta_click",
        surface_id: "hero-primary",
      }),
    );
  });
});
