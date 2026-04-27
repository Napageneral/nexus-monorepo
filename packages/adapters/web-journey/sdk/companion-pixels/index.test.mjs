import test from "node:test";
import assert from "node:assert/strict";

import { createCompanionPixels } from "./index.mjs";

test("companion pixels dispatch one owner-path event per vendor and dedupe by event id", () => {
  const windowRef = {};
  const companion = createCompanionPixels({
    window: windowRef,
    owner_path: "custom_code",
    meta: true,
    google: true,
    tiktok: true,
  });

  const first = companion.dispatch({
    event_id: "evt_1",
    event_name: "handoff_confirmed",
    page_url: "https://example.com/thanks",
    page_path: "/thanks",
    host: "example.com",
    handoff_id: "handoff_1",
    form_id: "lead_form",
    lead_external_id: "lead_1",
  });
  assert.equal(first.fired.length, 3);
  assert.deepEqual(
    first.fired.map((entry) => entry.vendor),
    ["meta", "google", "tiktok"],
  );

  const second = companion.dispatch({
    event_id: "evt_1",
    event_name: "handoff_confirmed",
    page_url: "https://example.com/thanks",
    page_path: "/thanks",
    host: "example.com",
  });
  assert.equal(second.fired.length, 0);
  assert.equal(companion.readLog().length, 3);
});

test("companion pixels can selectively disable vendors", () => {
  const windowRef = {};
  const companion = createCompanionPixels({
    window: windowRef,
    owner_path: "custom_code",
    meta: false,
    google: true,
    tiktok: false,
  });

  const result = companion.dispatch({
    event_id: "evt_2",
    event_name: "page_view",
    page_url: "https://example.com/",
    page_path: "/",
    host: "example.com",
  });

  assert.equal(result.fired.length, 1);
  assert.equal(result.fired[0].vendor, "google");
  assert.equal(companion.readLog().length, 1);
});
