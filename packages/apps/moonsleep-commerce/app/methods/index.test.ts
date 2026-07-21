import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  buildShopifySourceIdentityObservations,
  inspectShopifyCustomerBackfill,
  projectShopifyCustomerBackfill,
  projectShopifyCustomerCohort,
  projectCompleteShopifyCustomerBackfill,
  seedShopifySourceIdentities,
  shopifyCustomerRecordSetSha256,
} from "./index.js";

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

  it("inspects then projects the exact complete hash-bound set twice", async () => {
    const ctx = completeContext({
      "record-2": customerRecord("record-2", "gid://shopify/Customer/2"),
      "record-1": customerRecord("record-1", "gid://shopify/Customer/1"),
      "record-3": customerRecord("record-3", "gid://shopify/Customer/3"),
    });
    const inspected = await inspectShopifyCustomerBackfill(ctx as never);
    expect(inspected).toMatchObject({
      state: "ready",
      record_count: 3,
      record_set_sha256: shopifyCustomerRecordSetSha256([
        "record-1",
        "record-2",
        "record-3",
      ]),
      first_record_id: "record-1",
      last_record_id: "record-3",
      provider_write_authority: false,
    });

    const params = {
      ...ctx.params,
      expected_record_count: inspected.record_count,
      expected_record_set_sha256: inspected.record_set_sha256,
    };
    const first = await projectCompleteShopifyCustomerBackfill({ ...ctx, params } as never);
    const second = await projectCompleteShopifyCustomerBackfill({ ...ctx, params } as never);
    expect(first).toMatchObject({
      records_projected: 3,
      created_entities: 3,
      created_contacts: 3,
      replayed: 0,
    });
    expect(second).toMatchObject({
      records_projected: 3,
      created_entities: 0,
      created_contacts: 0,
      replayed: 3,
      record_set_sha256: inspected.record_set_sha256,
      projection_result_sha256: first.projection_result_sha256,
    });
    expect(ctx.list).toHaveBeenCalledWith({
      platform: "shopify",
      connection_id: "shopify-primary",
      limit: 1000,
      offset: 0,
    });
  });

  it("rejects snapshot drift before the first identity write", async () => {
    const ctx = completeContext({
      "record-1": customerRecord("record-1", "gid://shopify/Customer/1"),
      "record-2": customerRecord("record-2", "gid://shopify/Customer/2"),
    });
    await expect(
      projectCompleteShopifyCustomerBackfill({
        ...ctx,
        params: {
          ...ctx.params,
          expected_record_count: 2,
          expected_record_set_sha256: "0".repeat(64),
        },
      } as never),
    ).rejects.toThrow("no longer matches");
    expect(ctx.observe).not.toHaveBeenCalled();
    expect(ctx.recordsGet).not.toHaveBeenCalled();
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

  it("validates the complete record set before the first identity write", async () => {
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
