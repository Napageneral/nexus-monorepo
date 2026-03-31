import { describe, expect, it } from "vitest";
import {
  buildShopifyBridgeAttributes,
  buildShopifyCheckoutTrackInput,
  parseShopifyCheckoutIdentifiers,
} from "./index.js";

describe("website-input-bridge-shopify", () => {
  it("builds explicit Shopify bridge attributes from shared handoff context", () => {
    expect(
      buildShopifyBridgeAttributes({
        sessionId: "session-1",
        handoffId: "handoff-1",
        browserId: "browser-1",
        fbclid: "fb-1",
        gclid: "g-1",
      }),
    ).toEqual([
      { key: "ms_session_id", value: "session-1" },
      { key: "ms_handoff_id", value: "handoff-1" },
      { key: "ms_browser_id", value: "browser-1" },
      { key: "ms_fbclid", value: "fb-1" },
      { key: "ms_gclid", value: "g-1" },
    ]);
  });

  it("extracts checkout token and key from Shopify checkout urls", () => {
    expect(
      parseShopifyCheckoutIdentifiers("https://shop.example.com/cart/c/token-123?key=abc"),
    ).toEqual({
      checkout_token: "token-123",
      checkout_key: "abc",
    });
  });

  it("maps Shopify checkout creation into canonical track input", () => {
    expect(buildShopifyCheckoutTrackInput({ checkout_token: "token-123" })).toMatchObject({
      event_name: "checkout_created",
      bridge_surface: "checkout",
      checkout_token: "token-123",
    });
  });
});
