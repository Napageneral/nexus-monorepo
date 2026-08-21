import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import shopifyCustomerIdentityJob, {
  buildShopifyCustomerObservation,
  projectShopifyCustomerIdentity,
} from "./shopify-customer-identity.js";

function sourceEnvelope(source: Record<string, unknown>) {
  const providerObjectJson = JSON.stringify(source);
  return {
    source_metadata: {
      provider_payload: {
        provider_object_json: providerObjectJson,
        provider_object_sha256: createHash("sha256").update(providerObjectJson).digest("hex"),
      },
    },
  };
}

function customerRecord(overrides: Record<string, unknown> = {}) {
  const gid = "gid://shopify/Customer/7123456789";
  return {
    id: "record-row-1",
    record_id: "shopify:primary:customer:7123456789:revision-1",
    payload_sha256: "b".repeat(64),
    platform: "shopify",
    source_record_type: "shopify.customer",
    source_space_id: "moonsleepco.myshopify.com",
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

function nexFixture(options: { replayed?: boolean; canonicalId?: string } = {}) {
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
  const resolve = vi.fn(async () => ({
    ok: true,
    payload: { canonical_id: canonicalId, hops: 0 },
  }));
  const get = vi.fn(async () => ({ ok: true, payload: { record } }));
  let attachment: Record<string, unknown> | null = options.replayed
    ? {
        id: "facet-customer-1",
        facet_definition_id: "moonsleep.customer.v1",
        definition_version: 1,
        subject_class: "nex.entity",
        subject_id: canonicalId,
        domain_scope: "moonsleep",
        attachment_slot: "customer",
        instance_key: null,
        lifecycle_state: "active",
        privacy_class: "restricted",
        basis: {
          basis_type: "accepted_observation",
          observation_id: "observation-customer-1",
          commit_receipt_id: "receipt-customer-1",
          commit_receipt_sha256: "c".repeat(64),
        },
        observation_refs: [],
        values: {},
        relationships: [],
        redacted_fields: ["observation_refs", "relationships"],
      }
    : null;
  const facetsList = vi.fn(async () => ({ items: attachment ? [attachment] : [] }));
  const facetsGet = vi.fn(async (params: Record<string, unknown>) => {
    if (!attachment || attachment.id !== params.id) throw new Error("Facet not found");
    return { attachment };
  });
  const facetsCreate = vi.fn(async (params: Record<string, unknown>) => {
    attachment = {
      ...params,
      lifecycle_state: "active",
      instance_key: null,
    };
    return { value: attachment, replayed: false };
  });
  const profilesList = vi.fn(async () => ({
    items: [
      {
        profile_id: "commerce.customer.reference_fact.v1",
        profile_version: "1.0.0",
        element_type: "fact",
        owner_package: "@moonsleep/continuous-evidence",
        source_manifest_sha256: "4cd81823b8380e5414d278d3f67e89fae037a20f8c31d2df29f33660048bf93c",
        status: "active",
      },
      {
        profile_id: "commerce.customer.current.v1",
        profile_version: "1.0.0",
        element_type: "observation",
        owner_package: "@moonsleep/continuous-evidence",
        source_manifest_sha256: "4cd81823b8380e5414d278d3f67e89fae037a20f8c31d2df29f33660048bf93c",
        status: "active",
      },
    ],
  }));
  const profileRegister = vi.fn(async (input: Record<string, unknown>) => ({
    item: {
      profile_id: input.profileId,
      profile_version: input.profileVersion,
      element_type: input.elementType,
      owner_package: input.ownerPackage,
      source_manifest_sha256: input.sourceManifestSha256,
      status: "active",
    },
    reused: false,
  }));
  const episodeCreate = vi.fn(async () => ({
    item: { episode_id: "episode-customer-1" },
  }));
  const factCreate = vi.fn(async () => ({ item: { fact: { id: "fact-customer-1" } } }));
  const setCreate = vi.fn(async () => ({ set: { id: "set-customer-1" } }));
  const memberAdd = vi.fn(async () => ({ ok: true }));
  const setSeal = vi.fn(async () => ({ seal: { setId: "set-customer-1" }, reused: false }));
  const headGet = vi.fn(async () => ({ item: null }));
  const observationCommit = vi.fn(async () => ({
    item: {
      observation: { id: "observation-customer-1" },
      receipt: { receipt_id: "receipt-customer-1", operation_type: "observation_commit" },
    },
    reused: false,
  }));
  return {
    record,
    nex: {
      records: { get },
      contacts: { observe },
      entities: { resolve },
      memory: {
        evidence: {
          profiles: { list: profilesList, register: profileRegister },
          episodes: { create: episodeCreate },
          facts: { create_from_episode: factCreate },
          observations: { head: { get: headGet }, commit: observationCommit },
        },
        sets: { create: setCreate, members: { add: memberAdd }, seal: setSeal },
      },
      facets: { attachments: { get: facetsGet, list: facetsList, create: facetsCreate } },
    },
    calls: {
      get,
      observe,
      resolve,
      facetsGet,
      facetsList,
      facetsCreate,
      profilesList,
      profileRegister,
      episodeCreate,
      factCreate,
      setCreate,
      memberAdd,
      setSeal,
      headGet,
      observationCommit,
    },
  };
}

describe("Shopify customer identity projection", () => {
  it("builds the stable shop-domain plus customer-GID contact anchor", () => {
    expect(buildShopifyCustomerObservation(customerRecord())).toEqual({
      platform: "shopify",
      space_id: "moonsleepco.myshopify.com",
      contact_id: "gid://shopify/Customer/7123456789",
      source_observation_id: "record-row-1",
      observed_at: 1_721_234_567_890,
      contact_name: "Rina Alvarez",
      entity_name: "Rina Alvarez",
      tags: ["Customer", "Shopify"],
    });
  });

  it("observes, resolves and verifies the canonical customer entity through public Nex operations", async () => {
    const fixture = nexFixture();
    await expect(
      projectShopifyCustomerIdentity(fixture.nex, fixture.record),
    ).resolves.toMatchObject({
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
    expect(fixture.calls.factCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: "commerce.customer.reference_fact.v1",
        sourceRecordRefs: [{ recordId: "record-row-1", payloadSha256: "b".repeat(64) }],
      }),
    );
    expect(fixture.calls.factCreate.mock.calls[0]?.[0]).not.toHaveProperty("entityIds");
    expect(fixture.calls.factCreate.mock.calls[0]?.[0]).not.toHaveProperty("sourceJobId");
    expect(fixture.calls.memberAdd).toHaveBeenCalledWith({
      setId: "set-customer-1",
      memberType: "element",
      memberId: "fact-customer-1",
      position: 0,
    });
    expect(fixture.calls.profileRegister).toHaveBeenCalledTimes(2);
    expect(fixture.calls.observationCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: "commerce.customer.current.v1",
        subjectRef: "gid://shopify/Customer/7123456789",
        expectedHeadId: null,
      }),
    );
    expect(fixture.calls.observationCommit.mock.calls[0]?.[0]).not.toHaveProperty("entityIds");
    expect(fixture.calls.observationCommit.mock.calls[0]?.[0]).not.toHaveProperty("sourceJobId");
    expect(fixture.calls.facetsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        facet_definition_id: "moonsleep.customer.v1",
        subject_id: "entity-shopify-customer-1",
        privacy_class: "restricted",
        basis: expect.objectContaining({
          basis_type: "accepted_observation",
          observation_id: "observation-customer-1",
          commit_receipt_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      }),
    );
  });

  it("replays the same immutable observation without changing entity binding", async () => {
    const fixture = nexFixture({ replayed: true });
    await expect(
      projectShopifyCustomerIdentity(fixture.nex, fixture.record),
    ).resolves.toMatchObject({
      projected: true,
      replayed: true,
      created_entity: false,
      created_contact: false,
      canonical_entity_id: "entity-shopify-customer-1",
      customer_observation_outcome: "adopted_existing",
      customer_facet_outcome: "adopted_existing",
    });
    expect(fixture.calls.profilesList).not.toHaveBeenCalled();
    expect(fixture.calls.profileRegister).not.toHaveBeenCalled();
    expect(fixture.calls.observationCommit).not.toHaveBeenCalled();
    expect(fixture.calls.facetsCreate).not.toHaveBeenCalled();
  });

  it("adopts the deterministic active facet after a production cardinality conflict", async () => {
    const fixture = nexFixture();
    await projectShopifyCustomerIdentity(fixture.nex, fixture.record);
    fixture.calls.facetsList.mockResolvedValue({ items: [] });
    fixture.calls.facetsCreate.mockRejectedValueOnce(
      new Error("canonical subject already has an active attachment in this slot"),
    );

    await expect(
      projectShopifyCustomerIdentity(fixture.nex, fixture.record),
    ).resolves.toMatchObject({
      projected: true,
      customer_facet_outcome: "adopted_existing",
    });
    expect(fixture.calls.facetsGet).toHaveBeenCalledWith({
      id: expect.stringMatching(/^facet-attachment:moonsleep\.customer\.v1:/),
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
        input: {
          event: {
            type: "record.ingested",
            properties: { platform: "shopify", record_id: "record-row-1" },
          },
        },
        nex: fixture.nex,
      }),
    ).resolves.toEqual({ projected: false, reason: "not_customer", record_id: "record-row-1" });
    expect(fixture.calls.observe).not.toHaveBeenCalled();
  });

  it("fails closed when exact provider JSON does not match its bound hash", () => {
    const record = customerRecord();
    const sourceMetadata = (record.payload as Record<string, unknown>).source_metadata as Record<
      string,
      unknown
    >;
    const providerPayload = sourceMetadata.provider_payload as Record<string, unknown>;
    providerPayload.provider_object_json = JSON.stringify({ id: "other" });
    expect(() => buildShopifyCustomerObservation(record)).toThrow(/hash does not match/);
  });

  it("keeps the exact JSON string authoritative across the JavaScript number boundary", () => {
    const record = customerRecord();
    const source = {
      id: "gid://shopify/Customer/7123456789",
      displayName: "Rina Alvarez",
      provider_large_integer: 9_007_199_254_740_993n.toString(),
    };
    const raw = `{"id":"${source.id}","displayName":"${source.displayName}","provider_large_integer":9007199254740993123456789}`;
    record.payload = {
      source_metadata: {
        provider_payload: {
          provider_object_json: raw,
          provider_object_sha256: createHash("sha256").update(raw).digest("hex"),
        },
      },
    };
    expect(buildShopifyCustomerObservation(record).contact_id).toBe(source.id);
    expect(
      ((record.payload as Record<string, unknown>).source_metadata as Record<string, unknown>)
        .provider_payload,
    ).not.toHaveProperty("provider_object");
  });

  it("fails closed when source, normalized and provider identity anchors disagree", () => {
    const record = customerRecord();
    (record.metadata as Record<string, unknown>).provider_ids = {
      customer_gid: "gid://shopify/Customer/999",
    };
    expect(() => buildShopifyCustomerObservation(record)).toThrow(/anchors disagree/);
  });

  it("fails closed when the record is rebound to another Shopify shop", () => {
    const record = customerRecord({ source_space_id: "foreign-shop.myshopify.com" });
    expect(() => buildShopifyCustomerObservation(record)).toThrow(/space does not match/);
  });

  it("fails closed when immutable Record type differs from shopify.customer", () => {
    const record = customerRecord({ source_record_type: "shopify.order" });
    expect(() => buildShopifyCustomerObservation(record)).toThrow(/shopify.customer Records/);
  });

  it("projects an exact legacy text Record from its immutable normalized row only when enabled", () => {
    const record = customerRecord({
      source_record_type: "text",
      provider_account_ref: "moonsleepco.myshopify.com",
      provider_record_id: "shopify:shopify:shopify-primary:customer:7123456789:revision-1",
      payload: { source_metadata: {} },
    });
    (record.metadata as Record<string, unknown>).connection_id = "shopify-primary";
    expect(() => buildShopifyCustomerObservation(record)).toThrow(
      "expected shopify.customer Records",
    );
    expect(buildShopifyCustomerObservation(record, { allowLegacyText: true })).toMatchObject({
      contact_id: "gid://shopify/Customer/7123456789",
      contact_name: "Rina Alvarez",
    });
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
    fixture.calls.resolve.mockResolvedValueOnce({
      ok: true,
      payload: { canonical_id: "entity-other", hops: 1 },
    });
    await expect(projectShopifyCustomerIdentity(fixture.nex, fixture.record)).rejects.toThrow(
      /resolution disagrees/,
    );
  });

  it("treats Entity tags as compatibility hints rather than customer-role authority", async () => {
    const fixture = nexFixture();
    await expect(
      projectShopifyCustomerIdentity(fixture.nex, fixture.record),
    ).resolves.toMatchObject({
      tags: ["Customer", "Shopify"],
      tag_contract: "compatibility_hint",
      customer_facet_outcome: "attached",
    });
  });
});
