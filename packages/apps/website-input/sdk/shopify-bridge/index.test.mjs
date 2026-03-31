import test from "node:test";
import assert from "node:assert/strict";
import { buildShopifyCheckoutAttributes, parseShopifyCheckoutAttributes } from "./index.mjs";

test("shopify bridge serializes explicit checkout and attribution fields", () => {
  const attributes = buildShopifyCheckoutAttributes({
    website_installation_id: "install_1",
    browser_id: "browser_1",
    session_id: "session_1",
    event_id: "evt_1",
    utm_source: "google",
    gclid: "gclid_1",
    bridge: {
      bridge_surface: "checkout",
      handoff_id: "handoff_1",
      checkout_id: "checkout_1",
      cart_token: "cart_1",
    },
  });

  assert.equal(attributes.wi_website_installation_id, "install_1");
  assert.equal(attributes.wi_checkout_id, "checkout_1");
  assert.equal(attributes.wi_cart_token, "cart_1");
  assert.equal(attributes.wi_gclid, "gclid_1");
});

test("shopify bridge parses prefixed checkout attributes back into canonical fields", () => {
  const parsed = parseShopifyCheckoutAttributes({
    wi_website_installation_id: "install_1",
    wi_session_id: "session_1",
    wi_event_id: "evt_1",
    wi_bridge_surface: "checkout",
    wi_handoff_id: "handoff_1",
    wi_checkout_token: "token_1",
  });

  assert.equal(parsed.website_installation_id, "install_1");
  assert.equal(parsed.bridge_surface, "checkout");
  assert.equal(parsed.bridge.checkout_token, "token_1");
});
