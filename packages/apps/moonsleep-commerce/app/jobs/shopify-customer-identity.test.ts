import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import shopifyCustomerIdentityJob, {
  buildShopifyCustomerObservation,
  projectShopifyCustomerIdentity,
} from "./shopify-customer-identity.js";

function sourceEnvelope(source: Record<string, unknown>) {
  const providerObjectJson = JSON.stringify(source);
  return {
    provider_object: source,
    provider_object_json: providerObjectJson,
    provider_object_sha256: createHash("sha256").update(providerObjectJson).digest("hex"),
  };
}

function customerRecord(overrides: Record<string, unknown> = {}) {
  const gid = "gid://shopify/Customer/7123456789";
  return {
    id: "record-row-1",
    record_id: "shopify:primary:customer:7123456789:revision-1",
    platform: "shopify",
    space_id: "moonsleepco.myshopify.com",
    timestamp: 1_721_234_567_890,
    payload: sourceEnvelope({
      id: gid,
      displayName: "Rina Alvarez",
      email: "rina@example.com",
      addresses: [],
    }),
    metadata: {
      family: "customer",
      revision_hash: "a".repeat(64),
      provider_ids: { customer_gid: gid, customer_id: "7123456789" },
      row: {
        shop_domain: "moonsleepco.myshopify.com",
        customer_gid: gid,
        customer_id: "7123456789",
        display_name: "Rina Alvarez",
        first_name: "Rina",
        last_name: "Alvarez",
        email: "rina@example.com",
        phone: "+15125550123",
        addresses: [],
        addresses_complete: true,
      },
    },
    ...overrides,
  };
}

function nexFixture(options: { replayed?: boolean; tags?: string[]; canonicalId?: string } = {}) {
  const canonicalId = options.canonicalId ?? "entity-shopify-customer-1";
  const record = customerRecord();
  const observe = vi.fn(async (params: Record<string, unknown>) => ({
    ok: true,
    payload: {
      created_entity: !options.replayed,
      created_contact: !options.replayed,
      replayed: options.replayed === true,
      entity: { id: "entity-shopify-customer-1" },
      contact: {
        id: "contact-shopify-customer-1",
        platform: "shopify",
        space_id: "moonsleepco.myshopify.com",
        contact_id: "gid://shopify/Customer/7123456789",
      },
      observation: { source_observation_id: params.source_observation_id },
      canonical_entity_id: canonicalId,
      tags: ["Customer", "Shopify"],
      merge_candidate: null,
    },
  }));
  const resolve = vi.fn(async () => ({ ok: true, payload: { canonical_id: canonicalId, hops: 0 } }));
  const list = vi.fn(async () => ({
    ok: true,
    payload: { tags: options.tags ?? ["Customer", "Shopify"] },
  }));
  const get = vi.fn(async () => ({ ok: true, payload: { record } }));
  return {
    record,
    nex: {
      records: { get },
      contacts: { observe },
      entities: { resolve, tags: { list } },
    },
    calls: { get, observe, resolve, list },
  };
}

describe("Shopify customer identity projection", () => {
  it("builds the stable shop-domain plus customer-GID contact anchor", () => {
    expect(buildShopifyCustomerObservation(customerRecord())).toEqual({
      platform: "shopify",
      space_id: "moonsleepco.myshopify.com",
      contact_id: "gid://shopify/Customer/7123456789",
      source_observation_id: "shopify:primary:customer:7123456789:revision-1",
      observed_at: 1_721_234_567_890,
      contact_name: "Rina Alvarez",
      entity_name: "Rina Alvarez",
      tags: ["Customer", "Shopify"],
    });
  });

  it("observes, resolves and verifies the canonical customer entity through public Nex operations", async () => {
    const fixture = nexFixture();
    await expect(projectShopifyCustomerIdentity(fixture.nex, fixture.record)).resolves.toMatchObject({
      projected: true,
      created_entity: true,
      created_contact: true,
      replayed: false,
      canonical_entity_id: "entity-shopify-customer-1",
      shopify_customer_gid: "gid://shopify/Customer/7123456789",
      tags: ["Customer", "Shopify"],
    });
    expect(fixture.calls.observe).toHaveBeenCalledOnce();
    expect(fixture.calls.resolve).toHaveBeenCalledWith({ entity_id: "entity-shopify-customer-1" });
    expect(fixture.calls.list).toHaveBeenCalledWith({ entity_id: "entity-shopify-customer-1" });
  });

  it("replays the same immutable observation without changing entity binding", async () => {
    const fixture = nexFixture({ replayed: true });
    await expect(projectShopifyCustomerIdentity(fixture.nex, fixture.record)).resolves.toMatchObject({
      projected: true,
      replayed: true,
      created_entity: false,
      created_contact: false,
      canonical_entity_id: "entity-shopify-customer-1",
    });
  });

  it("loads the committed record from a record.ingested event before projection", async () => {
    const fixture = nexFixture();
    await expect(
      shopifyCustomerIdentityJob({
        input: {
          event: {
            type: "record.ingested",
            properties: { platform: "shopify", record_id: fixture.record.id },
          },
        },
        nex: fixture.nex,
      }),
    ).resolves.toMatchObject({ projected: true, record_id: "record-row-1" });
    expect(fixture.calls.get).toHaveBeenCalledWith({ id: "record-row-1" });
  });

  it("skips non-customer Shopify records without touching identity", async () => {
    const fixture = nexFixture();
    fixture.record.metadata = { family: "order" };
    await expect(
      shopifyCustomerIdentityJob({
        input: { event: { type: "record.ingested", properties: { platform: "shopify", record_id: "record-row-1" } } },
        nex: fixture.nex,
      }),
    ).resolves.toEqual({ projected: false, reason: "not_customer", record_id: "record-row-1" });
    expect(fixture.calls.observe).not.toHaveBeenCalled();
  });

  it("fails closed when exact provider JSON does not match its bound hash", () => {
    const record = customerRecord();
    (record.payload as Record<string, unknown>).provider_object_json = JSON.stringify({ id: "other" });
    expect(() => buildShopifyCustomerObservation(record)).toThrow(/hash does not match/);
  });

  it("fails closed when the decoded provider object identity disagrees with exact JSON", () => {
    const record = customerRecord();
    (record.payload as Record<string, unknown>).provider_object = {
      id: "gid://shopify/Customer/999",
    };
    expect(() => buildShopifyCustomerObservation(record)).toThrow(/decoded provider object disagrees/);
  });

  it("fails closed when source, normalized and provider identity anchors disagree", () => {
    const record = customerRecord();
    (record.metadata as Record<string, unknown>).provider_ids = {
      customer_gid: "gid://shopify/Customer/999",
    };
    expect(() => buildShopifyCustomerObservation(record)).toThrow(/anchors disagree/);
  });

  it("fails closed when the record is rebound to another Shopify shop", () => {
    const record = customerRecord({ space_id: "foreign-shop.myshopify.com" });
    expect(() => buildShopifyCustomerObservation(record)).toThrow(/space does not match/);
  });

  it("does not merge or anchor customers by email, phone or display name", () => {
    const record = customerRecord();
    const observation = buildShopifyCustomerObservation(record);
    expect(observation.contact_id).toBe("gid://shopify/Customer/7123456789");
    expect(observation).not.toHaveProperty("merge_candidate");
    expect(observation).not.toHaveProperty("email");
    expect(observation).not.toHaveProperty("phone");
  });

  it("fails closed when canonical resolution disagrees with the observation", async () => {
    const fixture = nexFixture({ canonicalId: "entity-canonical" });
    fixture.calls.resolve.mockResolvedValueOnce({ ok: true, payload: { canonical_id: "entity-other", hops: 1 } });
    await expect(projectShopifyCustomerIdentity(fixture.nex, fixture.record)).rejects.toThrow(
      /resolution disagrees/,
    );
  });

  it("fails closed when the canonical entity is missing required customer classification", async () => {
    const fixture = nexFixture({ tags: ["Shopify"] });
    await expect(projectShopifyCustomerIdentity(fixture.nex, fixture.record)).rejects.toThrow(
      /missing Customer tag/,
    );
  });
});
