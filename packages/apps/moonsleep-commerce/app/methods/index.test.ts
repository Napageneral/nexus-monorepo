import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  buildShopifySourceIdentityObservations,
  inspectShopifyCustomerBackfill,
  inspectShopifyCommerceBackfill,
  projectShopifyCommerceBackfill,
  projectShopifyCustomerBackfill,
  projectShopifyCustomerCohort,
  seedShopifySourceIdentities,
  shopifyCustomerRecordSetSha256,
  shopifyCommerceRecordSetSha256,
  triggerShopifySource,
} from "./index.js";

describe("Shopify source manual trigger", () => {
  it("queues only the exact installed active family job with a caller-bound idempotency key", async () => {
    const invoke = vi.fn(async () => ({ payload: { run: { id: "run-1" } } }));
    const ctx = {
      params: {
        family: "orders.delta",
        connection_id: "shopify-primary",
        request_id: "operator:orders:20260722T120000Z",
      },
      nex: {
        jobs: {
          list: vi.fn(async () => ({
            payload: {
              jobs: [
                {
                  id: "job-orders",
                  name: "moonsleep-commerce.shopify-source.orders-delta",
                  status: "active",
                },
              ],
            },
          })),
          invoke,
        },
      },
    };
    await expect(triggerShopifySource(ctx as never)).resolves.toMatchObject({
      queued: true,
      family: "orders.delta",
      run_id: "run-1",
      provider_write_authority: false,
    });
    expect(invoke).toHaveBeenCalledWith({
      job_id: "job-orders",
      input: { family: "orders.delta", connection_id: "shopify-primary" },
      trigger_source: "moonsleep-commerce-manual",
      max_attempts: 3,
      idempotency_key: "shopify-source:orders.delta:operator:orders:20260722T120000Z",
    });
  });

  it("rejects malformed requests and inactive jobs before queue mutation", async () => {
    const invoke = vi.fn();
    const base = {
      params: {
        family: "customers.delta",
        connection_id: "shopify-primary",
        request_id: "manual-1",
      },
      nex: {
        jobs: {
          list: vi.fn(async () => ({
            payload: {
              jobs: [
                {
                  id: "job-customers",
                  name: "moonsleep-commerce.shopify-source.customers-delta",
                  status: "inactive",
                },
              ],
            },
          })),
          invoke,
        },
      },
    };
    await expect(triggerShopifySource(base as never)).rejects.toThrow("not active");
    await expect(
      triggerShopifySource({ ...base, params: { ...base.params, family: "themes.delta" } } as never),
    ).rejects.toThrow("not an installed");
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("Shopify source identity seed", () => {
  function sourceIdentityContext() {
    const seen = new Set<string>();
    const observe = vi.fn(async (input: Record<string, unknown>) => {
      const observationId = String(input.source_observation_id);
      const role = String(input.entity_type);
      const replayed = seen.has(observationId);
      seen.add(observationId);
      return {
        contact: {
          platform: input.platform,
          space_id: input.space_id,
          contact_id: input.contact_id,
        },
        entity: { id: `entity-${role}` },
        canonical_entity_id: `entity-${role}`,
        created_entity: !replayed,
        created_contact: !replayed,
        replayed,
      };
    });
    const resolve = vi.fn(async ({ entity_id }: { entity_id: string }) => ({
      canonical_id: entity_id,
    }));
    const list = vi.fn(async ({ entity_id }: { entity_id: string }) => ({
      tags:
        entity_id === "entity-store"
          ? ["Store", "Shopify", "MoonSleep", "Reviewed"]
          : ["Shopify", "Integration", "MoonSleep"],
    }));
    return {
      params: {
        shop_domain: "moonsleepco.myshopify.com",
        connection_id: "shopify-primary",
      },
      nex: { contacts: { observe }, entities: { resolve, tags: { list } } },
      observe,
    };
  }

  it("creates exact store and integration anchors and replays without duplicate identities", async () => {
    const ctx = sourceIdentityContext();
    const first = await seedShopifySourceIdentities(ctx as never);
    expect(first).toMatchObject({
      state: "succeeded",
      identities_observed: 2,
      created_entities: 2,
      created_contacts: 2,
      replayed: 0,
      provider_write_authority: false,
    });
    const second = await seedShopifySourceIdentities(ctx as never);
    expect(second).toMatchObject({
      state: "succeeded",
      source_identity_contract_sha256: first.source_identity_contract_sha256,
      identities_observed: 2,
      created_entities: 0,
      created_contacts: 0,
      replayed: 2,
      provider_write_authority: false,
    });
    expect(ctx.observe).toHaveBeenCalledTimes(4);
    expect(ctx.observe.mock.calls[0]?.[0]).toMatchObject({
      platform: "shopify",
      space_id: "moonsleepco.myshopify.com",
      contact_id: "moonsleepco.myshopify.com",
      entity_type: "store",
    });
    expect(ctx.observe.mock.calls[1]?.[0]).toMatchObject({
      platform: "shopify",
      space_id: "",
      contact_id: "shopify-primary",
      entity_type: "integration",
    });
  });

  it("rejects malformed anchors before the first identity observation", async () => {
    const ctx = sourceIdentityContext();
    for (const params of [
      { shop_domain: "MoonSleepCo.myshopify.com", connection_id: "shopify-primary" },
      { shop_domain: "moonsleep.co", connection_id: "shopify-primary" },
      { shop_domain: "moonsleepco.myshopify.com", connection_id: " shopify-primary" },
      { shop_domain: "moonsleepco.myshopify.com", connection_id: "shopify/primary" },
    ]) {
      await expect(seedShopifySourceIdentities({ ...ctx, params } as never)).rejects.toThrow();
    }
    expect(ctx.observe).not.toHaveBeenCalled();
  });

  it("keeps the source identity observation contract deterministic", () => {
    expect(
      buildShopifySourceIdentityObservations({
        shop_domain: "moonsleepco.myshopify.com",
        connection_id: "shopify-primary",
      }),
    ).toEqual([
      expect.objectContaining({
        role: "store",
        source_observation_id:
          "moonsleep-commerce:shopify-source:store:v1:moonsleepco.myshopify.com",
        observed_at: Date.UTC(2026, 6, 20),
        tags: ["MoonSleep", "Shopify", "Store"],
      }),
      expect.objectContaining({
        role: "integration",
        source_observation_id:
          "moonsleep-commerce:shopify-source:integration:v1:shopify-primary",
        observed_at: Date.UTC(2026, 6, 20),
        tags: ["Integration", "MoonSleep", "Shopify"],
      }),
    ]);
  });
});

function customerRecord(recordId: string, customerId: string) {
  const providerObjectJson = JSON.stringify({ id: customerId, displayName: `Customer ${customerId}` });
  return {
    id: recordId,
    record_id: recordId,
    platform: "shopify",
    space_id: "moonsleepco.myshopify.com",
    timestamp: 1_784_564_000_000,
    payload: {
      provider_object_json: providerObjectJson,
      provider_object_sha256: createHash("sha256").update(providerObjectJson).digest("hex"),
    },
    metadata: {
      family: "customer",
      row: {
        shop_domain: "moonsleepco.myshopify.com",
        customer_gid: customerId,
      },
      provider_ids: { customer_gid: customerId },
    },
  };
}

function context(recordById: Record<string, ReturnType<typeof customerRecord>>) {
  const seenObservations = new Set<string>();
  const recordsGet = vi.fn(async ({ id }: { id: string }) => ({ record: recordById[id] }));
  const observe = vi.fn(async (input: Record<string, unknown>) => {
    const contactId = String(input.contact_id);
    const suffix = contactId.split("/").at(-1);
    const observationId = String(input.source_observation_id);
    const wasSeen = seenObservations.has(observationId);
    seenObservations.add(observationId);
    return {
      entity: { id: `entity-${suffix}` },
      contact: {
        id: `contact-${suffix}`,
        platform: "shopify",
        space_id: input.space_id,
        contact_id: contactId,
      },
      observation: { source_observation_id: observationId },
      canonical_entity_id: `entity-${suffix}`,
      created_entity: !wasSeen,
      created_contact: !wasSeen,
      replayed: wasSeen,
    };
  });
  const resolve = vi.fn(async ({ entity_id }: { entity_id: string }) => ({
    canonical_id: entity_id,
  }));
  const tagsList = vi.fn(async () => ({ tags: ["Customer", "Shopify"] }));
  return {
    params: { record_ids: Object.keys(recordById) },
    nex: {
      records: { get: recordsGet },
      contacts: { observe },
      entities: { resolve, tags: { list: tagsList } },
    },
    recordsGet,
    observe,
  };
}

describe("Shopify customer cohort projector", () => {
  it("validates every record before creating identity observations", async () => {
    const first = customerRecord("record-1", "gid://shopify/Customer/1");
    const invalid = { ...customerRecord("record-2", "gid://shopify/Customer/2"), platform: "other" };
    const ctx = context({ "record-1": first, "record-2": invalid });

    await expect(projectShopifyCustomerCohort(ctx as never)).rejects.toThrow(
      "only accepts Shopify records",
    );
    expect(ctx.recordsGet).toHaveBeenCalledTimes(2);
    expect(ctx.observe).not.toHaveBeenCalled();
  });

  it("projects an explicit cohort through replay-safe public identity operations", async () => {
    const ctx = context({
      "record-1": customerRecord("record-1", "gid://shopify/Customer/1"),
      "record-2": customerRecord("record-2", "gid://shopify/Customer/2"),
    });

    await expect(projectShopifyCustomerCohort(ctx as never)).resolves.toMatchObject({
      state: "succeeded",
      records_requested: 2,
      records_projected: 2,
      created_entities: 2,
      created_contacts: 2,
      replayed: 0,
      provider_write_authority: false,
    });
    expect(ctx.observe).toHaveBeenCalledTimes(2);
  });

  it("rejects duplicate, untrimmed, empty, and oversized cohorts", async () => {
    const ctx = context({ "record-1": customerRecord("record-1", "gid://shopify/Customer/1") });
    for (const recordIds of [
      [],
      ["record-1", "record-1"],
      [" record-1"],
      ["x".repeat(513)],
      ["é".repeat(257)],
      Array.from({ length: 51 }, (_, index) => `record-${index}`),
    ]) {
      await expect(
        projectShopifyCustomerCohort({ ...ctx, params: { record_ids: recordIds } } as never),
      ).rejects.toThrow();
    }
    expect(ctx.observe).not.toHaveBeenCalled();
  });
});

describe("Complete Shopify customer record-set discovery", () => {
  function completeContext(
    recordById: Record<string, ReturnType<typeof customerRecord>>,
  ) {
    const ctx = context(recordById);
    const ordered = Object.values(recordById);
    const list = vi.fn(
      async ({ limit, offset }: { limit: number; offset: number }) => ({
        records: ordered.slice(offset, offset + limit),
        limit,
        offset,
      }),
    );
    return {
      ...ctx,
      params: {
        shop_domain: "moonsleepco.myshopify.com",
        connection_id: "shopify-primary",
      },
      nex: { ...ctx.nex, records: { ...ctx.nex.records, list } },
      list,
    };
  }

  it("inspects the exact complete hash-bound set without projecting it", async () => {
    const ctx = completeContext({
      "record-2": customerRecord("record-2", "gid://shopify/Customer/2"),
      "record-1": customerRecord("record-1", "gid://shopify/Customer/1"),
      "record-3": customerRecord("record-3", "gid://shopify/Customer/3"),
    });
    const inspected = await inspectShopifyCustomerBackfill(ctx as never);
    expect(inspected).toMatchObject({
      state: "ready",
      record_count: 3,
      record_ids: ["record-1", "record-2", "record-3"],
      record_set_sha256: shopifyCustomerRecordSetSha256([
        "record-1",
        "record-2",
        "record-3",
      ]),
      first_record_id: "record-1",
      last_record_id: "record-3",
      provider_write_authority: false,
    });

    expect(ctx.observe).not.toHaveBeenCalled();
    expect(ctx.recordsGet).not.toHaveBeenCalled();
    expect(ctx.list).toHaveBeenCalledWith({
      platform: "shopify",
      connection_id: "shopify-primary",
      limit: 1000,
      offset: 0,
    });
  });

  it("paginates the public record surface and rejects duplicate IDs", async () => {
    const records = Object.fromEntries(
      Array.from({ length: 1001 }, (_, index) => {
        const id = `record-${String(index).padStart(4, "0")}`;
        return [id, customerRecord(id, `gid://shopify/Customer/${index + 1}`)];
      }),
    );
    const ctx = completeContext(records);
    await expect(inspectShopifyCustomerBackfill(ctx as never)).resolves.toMatchObject({
      record_count: 1001,
    });
    expect(ctx.list).toHaveBeenCalledTimes(2);

    const duplicateCtx = completeContext({
      first: customerRecord("same-id", "gid://shopify/Customer/1"),
      second: customerRecord("same-id", "gid://shopify/Customer/2"),
    });
    await expect(inspectShopifyCustomerBackfill(duplicateCtx as never)).rejects.toThrow(
      "duplicate record ids",
    );
    expect(duplicateCtx.observe).not.toHaveBeenCalled();
  });
});

describe("Shopify customer full backfill projector", () => {
  function backfillContext(
    recordById: Record<string, ReturnType<typeof customerRecord>>,
    recordIds = Object.keys(recordById).sort(),
  ) {
    const ctx = context(recordById);
    return {
      ...ctx,
      params: {
        record_ids: recordIds,
        record_set_sha256: shopifyCustomerRecordSetSha256(recordIds),
      },
    };
  }

  it("returns stable hashes and zero new identities on the exact second run", async () => {
    const ctx = backfillContext({
      "record-1": customerRecord("record-1", "gid://shopify/Customer/1"),
      "record-2": customerRecord("record-2", "gid://shopify/Customer/2"),
      "record-3": customerRecord("record-3", "gid://shopify/Customer/3"),
    });

    const first = await projectShopifyCustomerBackfill(ctx as never);
    expect(first).toMatchObject({
      state: "succeeded",
      records_requested: 3,
      records_projected: 3,
      created_entities: 3,
      created_contacts: 3,
      replayed: 0,
      first_record_id: "record-1",
      last_record_id: "record-3",
      provider_write_authority: false,
    });

    const second = await projectShopifyCustomerBackfill(ctx as never);
    expect(second).toMatchObject({
      state: "succeeded",
      records_requested: 3,
      records_projected: 3,
      created_entities: 0,
      created_contacts: 0,
      replayed: 3,
      record_set_sha256: first.record_set_sha256,
      projection_result_sha256: first.projection_result_sha256,
      provider_write_authority: false,
    });
    expect(ctx.observe).toHaveBeenCalledTimes(6);
  });

  it("validates the complete batch before the first identity write", async () => {
    const invalid = {
      ...customerRecord("record-3", "gid://shopify/Customer/3"),
      space_id: "wrong.myshopify.com",
    };
    const ctx = backfillContext({
      "record-1": customerRecord("record-1", "gid://shopify/Customer/1"),
      "record-2": customerRecord("record-2", "gid://shopify/Customer/2"),
      "record-3": invalid,
    });

    await expect(projectShopifyCustomerBackfill(ctx as never)).rejects.toThrow(
      "space does not match",
    );
    expect(ctx.recordsGet).toHaveBeenCalledTimes(3);
    expect(ctx.observe).not.toHaveBeenCalled();
  });

  it("rejects an altered set identity, unsorted IDs, and malformed digests before reads", async () => {
    const ctx = backfillContext({
      "record-1": customerRecord("record-1", "gid://shopify/Customer/1"),
      "record-2": customerRecord("record-2", "gid://shopify/Customer/2"),
    });
    const cases = [
      { record_ids: ["record-1", "record-2"], record_set_sha256: "0".repeat(64) },
      {
        record_ids: ["record-2", "record-1"],
        record_set_sha256: shopifyCustomerRecordSetSha256(["record-2", "record-1"]),
      },
      { record_ids: ["record-1", "record-2"], record_set_sha256: "INVALID" },
      {
        record_ids: Array.from({ length: 251 }, (_, index) =>
          `record-${String(index).padStart(4, "0")}`,
        ),
        record_set_sha256: "0".repeat(64),
      },
    ];

    for (const params of cases) {
      await expect(
        projectShopifyCustomerBackfill({ ...ctx, params } as never),
      ).rejects.toThrow();
    }
    expect(ctx.recordsGet).not.toHaveBeenCalled();
    expect(ctx.observe).not.toHaveBeenCalled();
  });
});

function commerceRecord(
  id: string,
  family: "order" | "line_item",
  options: { invalidHash?: boolean } = {},
) {
  const orderId = "900719925474099312346";
  const lineItemId = "900719925474099312347";
  const raw =
    family === "order"
      ? `{"id":${orderId},"customer":{"id":900719925474099312345},"total_price":"199.00"}`
      : `{"id":${lineItemId},"quantity":1,"price":"199.00"}`;
  return {
    id,
    record_id: `shopify:shopify-primary:${family}:${id}:revision-1`,
    platform: "shopify",
    space_id: "moonsleepco.myshopify.com",
    timestamp: 1_784_640_000_000 + (family === "order" ? 1 : 2),
    payload: {
      provider_object_json: raw,
      provider_object_sha256: options.invalidHash ? "0".repeat(64) : createHash("sha256").update(raw).digest("hex"),
    },
    metadata: {
      family,
      revision_hash: (family === "order" ? "b" : "c").repeat(64),
      provider_ids:
        family === "order"
          ? { order_id: orderId, customer_id: "900719925474099312345" }
          : { order_id: orderId, line_item_id: lineItemId },
      row:
        family === "order"
          ? {
              shop_domain: "moonsleepco.myshopify.com",
              order_id: orderId,
              customer_id: "900719925474099312345",
              name: "#SYNTH-1",
              currency: "USD",
              subtotal_price: "199.00",
              total_price: "199.00",
              billing_address: { address1: "1 Synthetic Way", city: "Austin", zip: "78701" },
              shipping_address: { address1: "2 Replay Road", city: "Austin", zip: "78702" },
            }
          : {
              shop_domain: "moonsleepco.myshopify.com",
              order_id: orderId,
              line_item_id: lineItemId,
              product_id: "900719925474099312348",
              variant_id: "900719925474099312349",
              sku: "SYNTHETIC-SKU",
              title: "Synthetic Product",
              quantity: 1,
              price: "199.00",
            },
    },
  };
}

describe("Shopify order and line-item bounded backfill", () => {
  function commerceContext(records: Record<string, ReturnType<typeof commerceRecord>>) {
    const ids = Object.keys(records).sort();
    const committed = new Set<string>();
    const recordsGet = vi.fn(async ({ id }: { id: string }) => ({ record: records[id] }));
    const orderObserve = vi.fn(async (input: Record<string, unknown>) => {
      const sourceRecordId = String(input.source_record_id);
      const replayed = committed.has(sourceRecordId);
      committed.add(sourceRecordId);
      return {
        created: !replayed,
        replayed,
        became_current: true,
        row_id: "order-row",
        revision_id: `revision-${sourceRecordId}`,
        source_record_id: sourceRecordId,
        source_revision_sha256: input.source_revision_sha256,
        projection_payload_sha256: "d".repeat(64),
      };
    });
    const lineObserve = vi.fn(async (input: Record<string, unknown>) => {
      expect(orderObserve).toHaveBeenCalled();
      const sourceRecordId = String(input.source_record_id);
      const replayed = committed.has(sourceRecordId);
      committed.add(sourceRecordId);
      return {
        created: !replayed,
        replayed,
        became_current: true,
        row_id: "line-row",
        revision_id: `revision-${sourceRecordId}`,
        source_record_id: sourceRecordId,
        source_revision_sha256: input.source_revision_sha256,
        projection_payload_sha256: "e".repeat(64),
      };
    });
    return {
      params: { record_ids: ids, record_set_sha256: shopifyCommerceRecordSetSha256(ids) },
      nex: {
        records: { get: recordsGet },
        contacts: {
          resolve: vi.fn(async () => ({
            found: true,
            contact: { id: "customer-contact", canonical_entity_id: "customer-entity" },
          })),
        },
        commerce: {
          orders: {
            observe: orderObserve,
            get: vi.fn(async () => ({ found: true, revision: { currency: "USD" } })),
          },
          "line-items": { observe: lineObserve },
        },
      },
      recordsGet,
      orderObserve,
      lineObserve,
    };
  }

  it("projects orders before line items and replays the same exact set without duplicates", async () => {
    const ctx = commerceContext({
      "record-z-order": commerceRecord("record-z-order", "order"),
      "record-a-line": commerceRecord("record-a-line", "line_item"),
    });
    const first = await projectShopifyCommerceBackfill(ctx as never);
    expect(first).toMatchObject({
      state: "succeeded",
      records_requested: 2,
      records_projected: 2,
      orders_projected: 1,
      line_items_projected: 1,
      created: 2,
      replayed: 0,
      provider_read_authority: false,
      provider_write_authority: false,
    });
    const second = await projectShopifyCommerceBackfill(ctx as never);
    expect(second).toMatchObject({
      record_set_sha256: first.record_set_sha256,
      projection_result_sha256: first.projection_result_sha256,
      created: 0,
      replayed: 2,
    });
  });

  it("validates every source record before the first commerce write", async () => {
    const ctx = commerceContext({
      "record-a-order": commerceRecord("record-a-order", "order"),
      "record-b-line": commerceRecord("record-b-line", "line_item", { invalidHash: true }),
    });
    await expect(projectShopifyCommerceBackfill(ctx as never)).rejects.toThrow(
      "hash does not match",
    );
    expect(ctx.recordsGet).toHaveBeenCalledTimes(2);
    expect(ctx.orderObserve).not.toHaveBeenCalled();
    expect(ctx.lineObserve).not.toHaveBeenCalled();
  });

  it("discovers only committed order and line-item records with no provider call", async () => {
    const order = commerceRecord("record-z-order", "order");
    const line = commerceRecord("record-a-line", "line_item");
    const customer = customerRecord("record-customer", "gid://shopify/Customer/1");
    const list = vi.fn(async () => ({ records: [order, customer, line] }));
    const inspected = await inspectShopifyCommerceBackfill({
      params: {
        shop_domain: "moonsleepco.myshopify.com",
        connection_id: "shopify-primary",
      },
      nex: { records: { list } },
    } as never);
    expect(inspected).toMatchObject({
      state: "ready",
      record_count: 2,
      record_ids: ["record-z-order", "record-a-line"],
      provider_read_authority: false,
      provider_write_authority: false,
    });
  });

  it("orders the full inspection manifest by dependency before batch slicing", async () => {
    const records = [
      commerceRecord("record-a-line", "line_item"),
      commerceRecord("record-z-order", "order"),
      commerceRecord("record-b-line", "line_item"),
      commerceRecord("record-y-order", "order"),
    ];
    const inspected = await inspectShopifyCommerceBackfill({
      params: {
        shop_domain: "moonsleepco.myshopify.com",
        connection_id: "shopify-primary",
      },
      nex: { records: { list: vi.fn(async () => ({ records })) } },
    } as never);
    expect(inspected.record_ids).toEqual([
      "record-y-order",
      "record-z-order",
      "record-a-line",
      "record-b-line",
    ]);
  });

  it("rejects oversized batches and altered set hashes before reads", async () => {
    const ctx = commerceContext({ "record-order": commerceRecord("record-order", "order") });
    await expect(
      projectShopifyCommerceBackfill({
        ...ctx,
        params: { ...ctx.params, record_set_sha256: "0".repeat(64) },
      } as never),
    ).rejects.toThrow("does not match");
    const tooMany = Array.from({ length: 51 }, (_, index) => `record-${index}`);
    await expect(
      projectShopifyCommerceBackfill({
        ...ctx,
        params: { record_ids: tooMany, record_set_sha256: shopifyCommerceRecordSetSha256(tooMany) },
      } as never),
    ).rejects.toThrow("between 1 and 50");
    expect(ctx.recordsGet).not.toHaveBeenCalled();
  });
});
