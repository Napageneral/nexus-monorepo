import test from "node:test";
import assert from "node:assert/strict";
import { createGtmWebJourneyMapper, mapGtmDataLayerEvent } from "./index.mjs";

test("gtm mapper normalizes common event names into canonical web journey events", () => {
  const mapped = mapGtmDataLayerEvent({
    event: "click",
    page_location: "https://example.com/home",
    page_path: "/home",
    host: "example.com",
    click_text: "Book now",
    element_id: "hero-cta",
    gclid: "gclid-1",
  });

  assert.equal(mapped.event_name, "cta_click");
  assert.equal(mapped.page_url, "https://example.com/home");
  assert.equal(mapped.surface_id, "hero-cta");
  assert.equal(mapped.surface_label, "Book now");
  assert.equal(mapped.gclid, "gclid-1");
});

test("gtm mapper respects explicit overrides and batch mapping", () => {
  const mapper = createGtmWebJourneyMapper({
    eventMap: {
      custom_lead_submit: "form_submit",
    },
  });

  const batch = mapper.mapBatch([
    {
      event: "custom_lead_submit",
      page_location: "https://example.com/contact",
      host: "example.com",
      form_id: "contact-form",
    },
    {
      event: "purchase",
      page_location: "https://example.com/thank-you",
      host: "example.com",
      checkout_id: "checkout-9",
    },
  ]);

  assert.equal(batch.length, 2);
  assert.equal(batch[0].event_name, "form_submit");
  assert.equal(batch[0].bridge.form_id, "contact-form");
  assert.equal(batch[0].form_id, "contact-form");
  assert.equal(batch[1].event_name, "checkout_complete");
  assert.equal(batch[1].bridge.checkout_id, "checkout-9");
  assert.equal(batch[1].checkout_id, "checkout-9");
});
