import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  parseShopifyLineItemRecord,
  parseShopifyOrderRecord,
  projectParsedShopifyLineItem,
  projectParsedShopifyOrder,
  type ShopifyCommerceClient,
} from "./shopify-order-commerce.js";
import shopifyOrderCommerceJob from "./shopify-order-commerce.js";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function orderRecord(overrides: Record<string, unknown> = {}) {
  const raw =
    '{"id":900719925474099312346,"name":"#SYNTH-1","customer":{"id":900719925474099312345},"total_price":"199.00"}';
  return {
    id: "record-order-revision-1",
    record_id: "shopify:shopify-primary:order:900719925474099312346:revision-1",
    timestamp: 1_784_640_001_000,
    platform: "shopify",
    space_id: "moonsleepco.myshopify.com",
    payload: { provider_object_json: raw, provider_object_sha256: sha256(raw) },
    metadata: {
      family: "order",
      revision_hash: "b".repeat(64),
      provider_ids: {
        order_id: "900719925474099312346",
        customer_id: "900719925474099312345",
      },
      row: {
        shop_domain: "moonsleepco.myshopify.com",
        order_id: "900719925474099312346",
        customer_id: "900719925474099312345",
        name: "#SYNTH-1",
        currency: "USD",
        subtotal_price: "199.00",
        total_price: "199.00",
        financial_status: "paid",
        fulfillment_status: "unfulfilled",
        billing_address: { zip: "78701", city: "Austin", address1: "1 Synthetic Way" },
        shipping_address: { address1: "2 Replay Road", city: "Austin", zip: "78702" },
      },
    },
    ...overrides,
  };
}

function lineItemRecord(overrides: Record<string, unknown> = {}) {
  const raw =
    '{"id":900719925474099312347,"product_id":900719925474099312348,"quantity":1,"price":"199.00"}';
  return {
    id: "record-line-revision-1",
    record_id:
      "shopify:shopify-primary:line_item:900719925474099312346:900719925474099312347:revision-1",
    timestamp: 1_784_640_002_000,
    platform: "shopify",
    space_id: "moonsleepco.myshopify.com",
    payload: { provider_object_json: raw, provider_object_sha256: sha256(raw) },
    metadata: {
      family: "line_item",
      revision_hash: "c".repeat(64),
      provider_ids: {
        order_id: "900719925474099312346",
        line_item_id: "900719925474099312347",
      },
      row: {
        shop_domain: "moonsleepco.myshopify.com",
        order_id: "900719925474099312346",
        line_item_id: "900719925474099312347",
        product_id: "900719925474099312348",
        variant_id: "900719925474099312349",
        sku: "SYNTHETIC-SKU",
        title: "Synthetic Product",
        quantity: 1,
        price: "199.00",
      },
    },
    ...overrides,
  };
}

function receipt(sourceRecordId: string) {
  return {
    created: true,
    replayed: false,
    became_current: true,
    row_id: "commerce-row",
    revision_id: "commerce-revision",
    source_record_id: sourceRecordId,
    source_revision_sha256: "d".repeat(64),
    projection_payload_sha256: "e".repeat(64),
  };
}

describe("Shopify order and line-item commerce projection", () => {
  it("binds legacy 16-hex adapter revision tokens to a domain-separated SHA-256", () => {
    const revisionToken = "d06a10a943d841b7";
    const order = orderRecord();
    (order.metadata as Record<string, unknown>).revision_hash = revisionToken;
    const parsedOrder = parseShopifyOrderRecord(order);
    expect(parsedOrder.input.source_revision_sha256).toBe(
      sha256(`nex-commerce-source-revision-token-v1\0${revisionToken}`),
    );

    const lineItem = lineItemRecord();
    (lineItem.metadata as Record<string, unknown>).revision_hash = revisionToken;
    const parsedLineItem = parseShopifyLineItemRecord(lineItem);
    if (parsedLineItem.family !== "line_item") throw new Error("expected line item");
    expect(parsedLineItem.inputWithoutCurrency.source_revision_sha256).toBe(
      sha256(`nex-commerce-source-revision-token-v1\0${revisionToken}`),
    );

    for (const malformed of ["d06a10a943d841b", "d06a10a943d841bg", "D06A10A943D841B7"]) {
      const bad = orderRecord();
      (bad.metadata as Record<string, unknown>).revision_hash = malformed;
      expect(() => parseShopifyOrderRecord(bad)).toThrow("revision_hash is malformed");
    }
  });

  it("preserves lossless source binding, customer anchor, and immutable address snapshots", () => {
    const parsed = parseShopifyOrderRecord(orderRecord());
    expect(parsed).toMatchObject({
      family: "order",
      sourceRecordId: "record-order-revision-1",
      input: {
        order_id: "gid://shopify/Order/900719925474099312346",
        customer_shopify_gid: "gid://shopify/Customer/900719925474099312345",
        source_payload_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        source_revision_sha256: "b".repeat(64),
        currency: "USD",
        total_price: "199.00",
      },
    });
    if (parsed.family !== "order") throw new Error("expected order");
    expect(parsed.input.billing_address_sha256).toBe(
      sha256('{"address1":"1 Synthetic Way","city":"Austin","zip":"78701"}'),
    );
    expect(parsed.input.shipping_address_sha256).toBe(
      sha256('{"address1":"2 Replay Road","city":"Austin","zip":"78702"}'),
    );
  });

  it("resolves the exact Shopify customer contact before observing the order", async () => {
    const parsed = parseShopifyOrderRecord(orderRecord());
    if (parsed.family !== "order") throw new Error("expected order");
    const observe = vi.fn(async (input: Record<string, unknown>) => {
      expect(input).toMatchObject({
        customer_contact_id: "contact-shopify-customer",
        customer_entity_id: "entity-canonical-customer",
      });
      expect(input).not.toHaveProperty("customer_shopify_gid");
      return receipt("record-order-revision-1");
    });
    const client = {
      contacts: {
        observe: vi.fn(),
        resolve: vi.fn(async () => ({
          found: true,
          contact: {
            id: "contact-shopify-customer",
            canonical_entity_id: "entity-canonical-customer",
          },
        })),
      },
      entities: { resolve: vi.fn(), tags: { list: vi.fn() } },
      commerce: {
        orders: { observe, get: vi.fn() },
        "line-items": { observe: vi.fn() },
      },
    } as unknown as ShopifyCommerceClient;
    const result = await projectParsedShopifyOrder(client, parsed);
    expect(result).toMatchObject({ created: true, source_record_id: "record-order-revision-1" });
    expect(client.contacts.resolve).toHaveBeenCalledWith({
      platform: "shopify",
      space_id: "moonsleepco.myshopify.com",
      contact_id: "gid://shopify/Customer/900719925474099312345",
    });
    expect(client.contacts.observe).not.toHaveBeenCalled();
  });

  it("replay-safely observes a missing customer from the exact order snapshot", async () => {
    const sourceJson =
      '{"id":900719925474099312346,"name":"#SYNTH-1","customer":{"id":900719925474099312345,"first_name":"Ada","last_name":"Lovelace"},"total_price":"199.00"}';
    const record = orderRecord({
      payload: {
        provider_object_json: sourceJson,
        provider_object_sha256: sha256(sourceJson),
      },
    });
    const parsed = parseShopifyOrderRecord(record);
    if (parsed.family !== "order") throw new Error("expected order");
    const orderObserve = vi
      .fn()
      .mockResolvedValueOnce(receipt("record-order-revision-1"))
      .mockResolvedValueOnce({
        ...receipt("record-order-revision-1"),
        created: false,
        replayed: true,
        became_current: false,
      });
    const contactResolve = vi
      .fn()
      .mockResolvedValueOnce({ found: false, contact: null })
      .mockResolvedValue({
        found: true,
        contact: {
          id: "contact-shopify-customer",
          canonical_entity_id: "entity-canonical-customer",
        },
      });
    const contactObserve = vi.fn(async (input: Record<string, unknown>) => {
      expect(input).toEqual({
        platform: "shopify",
        space_id: "moonsleepco.myshopify.com",
        contact_id: "gid://shopify/Customer/900719925474099312345",
        source_observation_id:
          "moonsleep-commerce:shopify-order-customer:v1:record-order-revision-1",
        observed_at: 1_784_640_001_000,
        contact_name: "Ada Lovelace",
        entity_name: "Ada Lovelace",
        tags: ["Customer", "Shopify"],
      });
      return {
        contact: {
          id: "contact-shopify-customer",
          platform: "shopify",
          space_id: "moonsleepco.myshopify.com",
          contact_id: "gid://shopify/Customer/900719925474099312345",
        },
        entity: { id: "entity-observed-customer" },
        canonical_entity_id: "entity-canonical-customer",
        observation: {
          source_observation_id:
            "moonsleep-commerce:shopify-order-customer:v1:record-order-revision-1",
        },
        created_contact: true,
        created_entity: true,
        replayed: false,
      };
    });
    const client = {
      contacts: { resolve: contactResolve, observe: contactObserve },
      entities: {
        resolve: vi.fn(async () => ({ canonical_id: "entity-canonical-customer" })),
        tags: { list: vi.fn(async () => ({ tags: ["Shopify", "Customer"] })) },
      },
      commerce: {
        orders: { observe: orderObserve, get: vi.fn() },
        "line-items": { observe: vi.fn() },
      },
    } as unknown as ShopifyCommerceClient;
    await expect(projectParsedShopifyOrder(client, parsed)).resolves.toMatchObject({
      created: true,
      source_record_id: "record-order-revision-1",
    });
    await expect(projectParsedShopifyOrder(client, parsed)).resolves.toMatchObject({
      created: false,
      replayed: true,
      source_record_id: "record-order-revision-1",
    });
    expect(contactObserve).toHaveBeenCalledOnce();
    expect(contactResolve).toHaveBeenCalledTimes(3);
    expect(orderObserve).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_contact_id: "contact-shopify-customer",
        customer_entity_id: "entity-canonical-customer",
      }),
    );
  });

  it("fails before commerce mutation when a customer anchor lacks embedded source evidence", () => {
    const sourceJson =
      '{"id":900719925474099312346,"name":"#SYNTH-1","customer":null,"total_price":"199.00"}';
    expect(() =>
      parseShopifyOrderRecord(
        orderRecord({
          payload: {
            provider_object_json: sourceJson,
            provider_object_sha256: sha256(sourceJson),
          },
        }),
      ),
    ).toThrow("requires an embedded customer object");
  });

  it("uses the committed parent order currency for line-item observation", async () => {
    const parsed = parseShopifyLineItemRecord(lineItemRecord());
    if (parsed.family !== "line_item") throw new Error("expected line item");
    const observe = vi.fn(async (input: Record<string, unknown>) => {
      expect(input).toMatchObject({
        order_id: "gid://shopify/Order/900719925474099312346",
        line_item_id: "gid://shopify/LineItem/900719925474099312347",
        product_id: "900719925474099312348",
        variant_id: "900719925474099312349",
        currency: "USD",
      });
      return receipt("record-line-revision-1");
    });
    const client = {
      contacts: { resolve: vi.fn(), observe: vi.fn() },
      entities: { resolve: vi.fn(), tags: { list: vi.fn() } },
      commerce: {
        orders: {
          observe: vi.fn(),
          get: vi.fn(async () => ({ found: true, revision: { currency: "USD" } })),
        },
        "line-items": { observe },
      },
    } as unknown as ShopifyCommerceClient;
    await expect(projectParsedShopifyLineItem(client, parsed)).resolves.toMatchObject({
      source_record_id: "record-line-revision-1",
    });
  });

  it("rejects hash drift, anchor drift, unsafe quantities, and missing parents", async () => {
    expect(() =>
      parseShopifyOrderRecord(
        orderRecord({ payload: { provider_object_json: "{}", provider_object_sha256: "0".repeat(64) } }),
      ),
    ).toThrow("hash does not match");
    const anchorDrift = orderRecord();
    (anchorDrift.metadata as Record<string, unknown>).provider_ids = {
      order_id: "123",
      customer_id: "900719925474099312345",
    };
    expect(() => parseShopifyOrderRecord(anchorDrift)).toThrow("order anchors disagree");
    const unsafe = lineItemRecord();
    ((unsafe.metadata as Record<string, unknown>).row as Record<string, unknown>).quantity =
      Number.MAX_SAFE_INTEGER + 1;
    expect(() => parseShopifyLineItemRecord(unsafe)).toThrow("safe integer");

    const parsed = parseShopifyLineItemRecord(lineItemRecord());
    if (parsed.family !== "line_item") throw new Error("expected line item");
    const lineObserve = vi.fn();
    const client = {
      contacts: { resolve: vi.fn(), observe: vi.fn() },
      entities: { resolve: vi.fn(), tags: { list: vi.fn() } },
      commerce: {
        orders: { observe: vi.fn(), get: vi.fn(async () => ({ found: false })) },
        "line-items": { observe: lineObserve },
      },
    } as unknown as ShopifyCommerceClient;
    await expect(projectParsedShopifyLineItem(client, parsed)).rejects.toThrow(
      "parent order is not projected",
    );
    expect(lineObserve).not.toHaveBeenCalled();
  });

  it("keeps unrelated durable events out of the dormant commerce job", async () => {
    const recordsGet = vi.fn();
    await expect(
      shopifyOrderCommerceJob({
        input: { event: { type: "other.event", properties: { platform: "shopify" } } },
        nex: { records: { get: recordsGet } } as never,
      }),
    ).resolves.toEqual({ projected: false, reason: "not_record_ingested" });
    expect(recordsGet).not.toHaveBeenCalled();
  });
});
