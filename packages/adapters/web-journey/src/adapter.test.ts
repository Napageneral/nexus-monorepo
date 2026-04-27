import assert from "node:assert/strict";
import test from "node:test";
import { __test__ } from "./adapter.ts";

test("web-journey record envelopes claim the adapter connection id at the integrity boundary", () => {
  const now = Date.now();
  const row = __test__.normalizeWebEventInput(
    {
      web_installation_id: "install-123",
      event_id: "evt-1",
      captured_at: now,
      received_at: now,
      consent_state: "granted",
      event_name: "page_view",
      browser_id: "browser-1",
      session_id: "sess-1",
      page_url: "https://moon.test/",
      page_path: "/",
      host: "moon.test",
      bridgeSurface: "checkout",
      handoffId: "handoff-1",
      checkoutToken: "chk-1",
      cartToken: "cart-1",
      metadata: {},
    },
    "install-123",
  );

  const envelope = __test__.buildRecordIngestEnvelope(
    {
      runtime: {
        connection_id: "conn-123",
        config: {
          web_installation_id: "install-123",
          site_origin: "https://moon.test",
        },
      },
    },
    {
      web_installation_id: "install-123",
      site_origin: "https://moon.test",
    },
    row,
  );

  assert.equal(envelope.routing.connection_id, "conn-123");
  assert.equal(
    envelope.routing.receiver_id,
    "conn-123",
    "receiver_id must match the adapter connection id so serve-session integrity checks pass",
  );
  assert.equal(envelope.routing.metadata.web_installation_id, "install-123");
  assert.equal(envelope.payload.external_record_id, "install-123:evt-1");
  assert.equal(envelope.payload.metadata.row.bridge_surface, "checkout");
  assert.equal(envelope.payload.metadata.row.handoff_id, "handoff-1");
  assert.equal(envelope.payload.metadata.row.checkout_token, "chk-1");
  assert.equal(envelope.payload.metadata.row.cart_token, "cart-1");
});
