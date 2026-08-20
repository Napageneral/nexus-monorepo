import { describe, expect, it } from "vitest";
import { assertShopifyRecordFamily } from "./shopify-record-family.js";

function record(overrides: Record<string, unknown> = {}) {
  return {
    platform: "shopify",
    source_record_type: "shopify.customer",
    source_space_id: "moonsleepco.myshopify.com",
    provider_account_ref: "shopify-primary",
    provider_record_id: "shopify:shopify-primary:customer:123:revision",
    metadata: { family: "customer", connection_id: "shopify-primary" },
    ...overrides,
  };
}

describe("Shopify immutable Record family custody", () => {
  it("accepts the canonical family contract by default", () => {
    expect(assertShopifyRecordFamily(record(), "customer")).toBe("canonical");
  });

  it("accepts each exact historical text namespace only when explicitly enabled", () => {
    const current = record({ source_record_type: "text" });
    expect(() => assertShopifyRecordFamily(current, "customer")).toThrow(
      "expected shopify.customer Records",
    );
    expect(assertShopifyRecordFamily(current, "customer", { allowLegacyText: true })).toBe(
      "legacy_current_prefix",
    );

    const older = record({
      source_record_type: "text",
      provider_account_ref: "moonsleepco.myshopify.com",
      provider_record_id: "shopify:shopify:shopify-primary:customer:123:revision",
    });
    expect(assertShopifyRecordFamily(older, "customer", { allowLegacyText: true })).toBe(
      "legacy_double_prefix",
    );
  });

  it("rejects text rows whose account or literal family prefix drifts", () => {
    expect(() =>
      assertShopifyRecordFamily(
        record({
          source_record_type: "text",
          provider_record_id: "shopify:shopify-primary:order:123:revision",
        }),
        "customer",
        { allowLegacyText: true },
      ),
    ).toThrow("exact provider-family contract");
    expect(() =>
      assertShopifyRecordFamily(
        record({ source_record_type: "text", provider_account_ref: "another-account" }),
        "customer",
        { allowLegacyText: true },
      ),
    ).toThrow("exact provider-family contract");
  });
});
