import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { projectShopifyCustomerCohort } from "./index.js";

function customerRecord(recordId: string, customerId: string) {
  const providerObjectJson = JSON.stringify({ id: customerId, displayName: `Customer ${customerId}` });
  return {
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
  const recordsGet = vi.fn(async ({ id }: { id: string }) => ({ record: recordById[id] }));
  const observe = vi.fn(async (input: Record<string, unknown>) => {
    const contactId = String(input.contact_id);
    const suffix = contactId.split("/").at(-1);
    return {
      entity: { id: `entity-${suffix}` },
      contact: {
        id: `contact-${suffix}`,
        platform: "shopify",
        space_id: input.space_id,
        contact_id: contactId,
      },
      observation: { source_observation_id: input.source_observation_id },
      canonical_entity_id: `entity-${suffix}`,
      created_entity: true,
      created_contact: true,
      replayed: false,
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
