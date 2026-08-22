import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  buildShopifySourceIdentityObservations,
  configureShopifyProjections,
  configureShopifySourceSchedules,
  projectShopifyCustomerCohort,
  seedShopifySourceIdentities,
  triggerShopifySource,
} from "./index.js";
import { SHOPIFY_SOURCE_SCHEDULES } from "../jobs/shopify-source-schedules.js";

const SHOPIFY_SOURCE_FAMILIES = [
  "orders.delta",
  "customers.delta",
  "inventory.hot",
  "inventory.reconcile",
  "fulfillment.delta",
  "discounts.delta",
  "finance.transactions",
  "disputes.delta",
  "products.delta",
  "catalog.delta",
  "marketing.delta",
  "payouts.delta",
] as const;

function sourceJobName(family: string): string {
  return `moonsleep-commerce.shopify-source.${family.replaceAll(".", "-")}`;
}

describe("Shopify source schedule configuration", () => {
  it("plans without mutation and applies only an exact hash-bound family set", async () => {
    const jobs = SHOPIFY_SOURCE_FAMILIES.map((family, index) => ({
      id: `job-${index}`,
      name: sourceJobName(family),
      status: "active",
      config_json: JSON.stringify({ family }),
    }));
    const schedules = SHOPIFY_SOURCE_FAMILIES.map((family, index) => ({
      id: `schedule-${index}`,
      job_definition_id: `job-${index}`,
      name: sourceJobName(family),
      expression: "0 0 1 1 *",
      timezone: "UTC",
      enabled: 0,
    }));
    schedules.push({
      id: "foreign-schedule",
      job_definition_id: "foreign-job",
      name: "another-app.critical-schedule",
      expression: "7 * * * * *",
      timezone: "UTC",
      enabled: 1,
    });
    let failingJobId = "";
    const jobsUpdate = vi.fn(async (input: Record<string, unknown>) => {
      if (input.id === failingJobId) {
        throw new Error("injected job update failure");
      }
      const row = jobs.find((entry) => entry.id === input.id)!;
      row.config_json = String(input.config_json);
      return { payload: { job: row } };
    });
    const schedulesUpdate = vi.fn(async (input: Record<string, unknown>) => {
      const row = schedules.find((entry) => entry.id === input.id)!;
      if (input.expression !== undefined) row.expression = String(input.expression);
      if (input.timezone !== undefined) row.timezone = String(input.timezone);
      if (input.enabled !== undefined) row.enabled = input.enabled === true ? 1 : 0;
      return { payload: { schedule: row } };
    });
    const nex = {
      jobs: { list: vi.fn(async () => ({ payload: { jobs } })), update: jobsUpdate },
      schedules: {
        list: vi.fn(async () => ({ payload: { schedules } })),
        update: schedulesUpdate,
      },
    };
    const enabledFamilies = ["orders.delta", "customers.delta", "inventory.hot"];
    const planned = (await configureShopifySourceSchedules({
      params: { mode: "plan", connection_id: "shopify-primary", enabled_families: enabledFamilies },
      nex,
    } as never)) as Record<string, unknown>;
    expect(planned).toMatchObject({ state: "planned", provider_write_authority: false });
    expect(
      Object.fromEntries(
        (planned.schedules as Array<{ family: string; expression: string }>).map((row) => [
          row.family,
          row.expression,
        ]),
      ),
    ).toEqual(SHOPIFY_SOURCE_SCHEDULES);
    expect(planned.plan_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(jobsUpdate).not.toHaveBeenCalled();
    expect(schedulesUpdate).not.toHaveBeenCalled();

    await expect(
      configureShopifySourceSchedules({
        params: {
          mode: "apply",
          connection_id: "shopify-primary",
          enabled_families: enabledFamilies,
          expected_plan_sha256: "0".repeat(64),
          confirmation: "CONFIGURE_MOONSLEEP_SHOPIFY_SOURCE_SCHEDULES",
        },
        nex,
      } as never),
    ).rejects.toThrow("does not match");
    expect(jobsUpdate).not.toHaveBeenCalled();

    const applied = await configureShopifySourceSchedules({
      params: {
        mode: "apply",
        connection_id: "shopify-primary",
        enabled_families: enabledFamilies,
        expected_plan_sha256: planned.plan_sha256,
        confirmation: "CONFIGURE_MOONSLEEP_SHOPIFY_SOURCE_SCHEDULES",
      },
      nex,
    } as never);
    expect(applied).toMatchObject({ state: "applied", plan_sha256: planned.plan_sha256 });
    expect(jobsUpdate).toHaveBeenCalledTimes(12);
    expect(schedulesUpdate).toHaveBeenCalledTimes(27);
    expect(schedulesUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: "foreign-schedule" }),
    );
    expect(schedules.find((row) => row.id === "foreign-schedule")?.enabled).toBe(1);
    expect(
      schedules
        .filter((row) => row.enabled === 1 && row.id !== "foreign-schedule")
        .map((row) => row.name)
        .sort(),
    ).toEqual(enabledFamilies.map(sourceJobName).sort());
    expect(jobs.every((row) => row.config_json.includes('"connection_id":"shopify-primary"'))).toBe(
      true,
    );

    failingJobId = "job-5";
    await expect(
      configureShopifySourceSchedules({
        params: {
          mode: "apply",
          connection_id: "shopify-primary",
          enabled_families: enabledFamilies,
          expected_plan_sha256: planned.plan_sha256,
          confirmation: "CONFIGURE_MOONSLEEP_SHOPIFY_SOURCE_SCHEDULES",
        },
        nex,
      } as never),
    ).rejects.toThrow("injected job update failure");
    expect(
      schedules.filter((row) => row.id !== "foreign-schedule").every((row) => row.enabled === 0),
    ).toBe(true);
    expect(schedules.find((row) => row.id === "foreign-schedule")?.enabled).toBe(1);
  });
});
describe("Shopify durable projection configuration", () => {
  it("plans without mutation and atomically enables exact customer and commerce subscriptions", async () => {
    const jobs = [
      {
        id: "job-customer",
        name: "moonsleep-commerce.shopify-customer-identity",
        status: "inactive",
      },
      {
        id: "job-commerce",
        name: "moonsleep-commerce.shopify-order-commerce",
        status: "inactive",
      },
    ];
    const subscriptions = [
      {
        id: "sub-customer",
        job_definition_id: "job-customer",
        event_type: "record.ingested",
        match_json: JSON.stringify({ platform: "shopify", container_id: "customer" }),
        enabled: 0,
      },
      {
        id: "sub-order",
        job_definition_id: "job-commerce",
        event_type: "record.ingested",
        match_json: JSON.stringify({ platform: "shopify", container_id: "order" }),
        enabled: 0,
      },
      {
        id: "sub-line",
        job_definition_id: "job-commerce",
        event_type: "record.ingested",
        match_json: JSON.stringify({ platform: "shopify", container_id: "line_item" }),
        enabled: 0,
      },
    ];
    let failSubscription = "";
    const jobsUpdate = vi.fn(async (input: Record<string, unknown>) => {
      const row = jobs.find((entry) => entry.id === input.id)!;
      row.status = String(input.status);
      return { payload: { job: row } };
    });
    const subscriptionsUpdate = vi.fn(async (input: Record<string, unknown>) => {
      if (input.id === failSubscription && input.enabled === true) {
        throw new Error("injected subscription update failure");
      }
      const row = subscriptions.find((entry) => entry.id === input.id)!;
      row.enabled = input.enabled === true ? 1 : 0;
      return { payload: { subscription: row } };
    });
    const nex = {
      jobs: { list: vi.fn(async () => ({ payload: { jobs } })), update: jobsUpdate },
      events: {
        subscriptions: {
          list: vi.fn(async (input: Record<string, unknown>) => ({
            payload: {
              subscriptions: subscriptions.filter(
                (row) => row.job_definition_id === input.job_definition_id,
              ),
            },
          })),
          update: subscriptionsUpdate,
        },
      },
    };

    const planned = (await configureShopifyProjections({
      params: {
        mode: "plan",
        enabled_projections: ["customer_identity", "order_commerce"],
      },
      nex,
    } as never)) as Record<string, unknown>;
    expect(planned).toMatchObject({
      state: "planned",
      provider_read_authority: false,
      provider_write_authority: false,
    });
    expect(planned.plan_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(jobsUpdate).not.toHaveBeenCalled();
    expect(subscriptionsUpdate).not.toHaveBeenCalled();

    await configureShopifyProjections({
      params: {
        mode: "apply",
        enabled_projections: ["customer_identity", "order_commerce"],
        expected_plan_sha256: planned.plan_sha256,
        confirmation: "CONFIGURE_MOONSLEEP_SHOPIFY_PROJECTIONS",
      },
      nex,
    } as never);
    expect(jobs.every((row) => row.status === "active")).toBe(true);
    expect(subscriptions.every((row) => row.enabled === 1)).toBe(true);

    failSubscription = "sub-line";
    await expect(
      configureShopifyProjections({
        params: {
          mode: "apply",
          enabled_projections: ["customer_identity", "order_commerce"],
          expected_plan_sha256: planned.plan_sha256,
          confirmation: "CONFIGURE_MOONSLEEP_SHOPIFY_PROJECTIONS",
        },
        nex,
      } as never),
    ).rejects.toThrow("injected subscription update failure");
    expect(jobs.every((row) => row.status === "inactive")).toBe(true);
    expect(subscriptions.every((row) => row.enabled === 0)).toBe(true);
  });

  it("rejects drifted subscriptions before mutating jobs", async () => {
    const update = vi.fn();
    const nex = {
      jobs: {
        list: vi.fn(async () => ({
          payload: {
            jobs: [
              {
                id: "job-customer",
                name: "moonsleep-commerce.shopify-customer-identity",
                status: "inactive",
              },
              {
                id: "job-commerce",
                name: "moonsleep-commerce.shopify-order-commerce",
                status: "inactive",
              },
            ],
          },
        })),
        update,
      },
      events: {
        subscriptions: {
          list: vi.fn(async (input: Record<string, unknown>) => ({
            payload: {
              subscriptions:
                input.job_definition_id === "job-customer"
                  ? [
                      {
                        id: "sub-customer",
                        job_definition_id: "job-customer",
                        event_type: "record.ingested",
                        match_json: JSON.stringify({ platform: "shopify" }),
                        enabled: 0,
                      },
                    ]
                  : [],
            },
          })),
          update: vi.fn(),
        },
      },
    };
    const planned = (await configureShopifyProjections({
      params: { mode: "plan", enabled_projections: ["customer_identity"] },
      nex,
    } as never)) as Record<string, unknown>;
    await expect(
      configureShopifyProjections({
        params: {
          mode: "apply",
          enabled_projections: ["customer_identity"],
          expected_plan_sha256: planned.plan_sha256,
          confirmation: "CONFIGURE_MOONSLEEP_SHOPIFY_PROJECTIONS",
        },
        nex,
      } as never),
    ).rejects.toThrow("subscription contract drifted");
    expect(update).not.toHaveBeenCalled();
  });
});

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

  it("queues one immutable observation through the existing source job without a provider call", async () => {
    const invoke = vi.fn(async () => ({ payload: { run: { id: "run-observation-1" } } }));
    const observation = {
      projection_work_id: `channelprojection_${"1".repeat(32)}`,
      observation_receipt_id: `channelobs_${"2".repeat(32)}`,
      projection_target: "nex",
      source_system: "shopify",
      source_account_ref: "moonsleep",
      source_stream: "orders/paid",
      external_receipt_id: "f5d13f46-6d83-4a93-baf8-acdeec37893a",
      semantic_revision_id: "8328002633890:2026-08-22T20:00:00Z",
      raw_body_sha256: "3".repeat(64),
      verification_issuer: "cloudflare:moonsleep-meta-capi",
      verification_receipt_sha256: "4".repeat(64),
      observation_sha256: "5".repeat(64),
      immutable_facts_sha256: "6".repeat(64),
      immutable_facts: {
        id: 8328002633890,
        updated_at: "2026-08-22T20:00:00Z",
        line_items: [{ id: 1, quantity: 1 }],
      },
    };
    const ctx = {
      params: {
        family: "orders.delta",
        connection_id: "shopify-primary",
        observation,
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
      request_id: observation.projection_work_id,
      projection_work_id: observation.projection_work_id,
      observation_receipt_id: observation.observation_receipt_id,
      job_definition_id: "job-orders",
      run_id: "run-observation-1",
      provider_write_authority: false,
    });
    expect(invoke).toHaveBeenCalledWith({
      job_id: "job-orders",
      input: { family: "orders.delta", connection_id: "shopify-primary", observation },
      trigger_source: "moonsleep-commerce-shopify-observation",
      max_attempts: 3,
      idempotency_key: `shopify-observation:${observation.projection_work_id}`,
    });
  });

  it("rejects an observation whose source stream disagrees with the source family", async () => {
    const invoke = vi.fn();
    await expect(
      triggerShopifySource({
        params: {
          family: "customers.delta",
          connection_id: "shopify-primary",
          observation: {
            projection_work_id: `channelprojection_${"1".repeat(32)}`,
            observation_receipt_id: `channelobs_${"2".repeat(32)}`,
            projection_target: "nex",
            source_system: "shopify",
            source_account_ref: "moonsleep",
            source_stream: "orders/updated",
            external_receipt_id: "receipt-1",
            semantic_revision_id: "1:revision-1",
            raw_body_sha256: "3".repeat(64),
            verification_issuer: "cloudflare:moonsleep-meta-capi",
            verification_receipt_sha256: "4".repeat(64),
            observation_sha256: "5".repeat(64),
            immutable_facts_sha256: "6".repeat(64),
            immutable_facts: { id: 1 },
          },
        },
        nex: { jobs: { list: vi.fn(), invoke } },
      } as never),
    ).rejects.toThrow("source_stream does not match family");
    expect(invoke).not.toHaveBeenCalled();
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
      triggerShopifySource({
        ...base,
        params: { ...base.params, family: "themes.delta" },
      } as never),
    ).rejects.toThrow("not an installed");
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("Shopify source identity seed", () => {
  function sourceIdentityContext(options?: { legacyReceiverEntityId?: string }) {
    const seen = new Set<string>();
    const contactsByAnchor = new Map<
      string,
      {
        id: string;
        platform: string;
        space_id: string;
        contact_id: string;
        canonical_entity_id: string;
      }
    >();
    const anchor = (platform: string, spaceId: string, contactId: string) =>
      `${platform}\n${spaceId}\n${contactId}`;
    if (options?.legacyReceiverEntityId) {
      contactsByAnchor.set(anchor("shopify", "", "shopify-primary"), {
        id: "contact-legacy-shopify-primary",
        platform: "shopify",
        space_id: "",
        contact_id: "shopify-primary",
        canonical_entity_id: options.legacyReceiverEntityId,
      });
    }
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
    const resolveEntity = vi.fn(async ({ entity_id }: { entity_id: string }) => ({
      canonical_id: entity_id,
    }));
    const getEntity = vi.fn(async ({ id }: { id: string }) => ({
      entity: {
        id,
        is_agent: id === "entity_moonsleep_ops",
        deleted_at: null,
      },
    }));
    const list = vi.fn(async ({ entity_id }: { entity_id: string }) => ({
      tags:
        entity_id === "entity-store"
          ? ["Store", "Shopify", "MoonSleep", "Reviewed"]
          : ["Shopify", "Integration", "MoonSleep"],
    }));
    const resolveContact = vi.fn(
      async ({
        platform,
        space_id,
        contact_id,
      }: {
        platform: string;
        space_id: string;
        contact_id: string;
      }) => {
        const contact = contactsByAnchor.get(anchor(platform, space_id, contact_id)) ?? null;
        return { found: contact !== null, contact };
      },
    );
    const createContact = vi.fn(async (input: Record<string, unknown>) => {
      const contact = {
        id: `contact-${contactsByAnchor.size + 1}`,
        platform: String(input.platform),
        space_id: String(input.space_id ?? ""),
        contact_id: String(input.contact_id),
        canonical_entity_id: String(input.entity_id),
      };
      contactsByAnchor.set(anchor(contact.platform, contact.space_id, contact.contact_id), contact);
      return { contact };
    });
    const updateContact = vi.fn(async (input: Record<string, unknown>) => {
      const existing = [...contactsByAnchor.values()].find((contact) => contact.id === input.id);
      if (!existing) throw new Error("missing fixture contact");
      const updated = {
        ...existing,
        id: `${existing.id}-updated`,
        canonical_entity_id: String(input.entity_id),
      };
      contactsByAnchor.set(anchor(updated.platform, updated.space_id, updated.contact_id), updated);
      return { contact: updated };
    });
    return {
      params: {
        shop_domain: "moonsleepco.myshopify.com",
        connection_id: "shopify-primary",
      },
      nex: {
        contacts: {
          observe,
          resolve: resolveContact,
          create: createContact,
          update: updateContact,
        },
        entities: { get: getEntity, resolve: resolveEntity, tags: { list } },
      },
      observe,
      resolveContact,
      createContact,
      updateContact,
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
      receiver_grounding: {
        outcome: "created",
        canonical_entity_id: "entity_moonsleep_ops",
      },
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
      receiver_grounding: {
        outcome: "unchanged",
        canonical_entity_id: "entity_moonsleep_ops",
      },
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
      space_id: "moonsleepco.myshopify.com",
      contact_id: "shopify-primary",
      entity_type: "integration",
    });
    expect(ctx.createContact).toHaveBeenCalledTimes(1);
    expect(ctx.updateContact).not.toHaveBeenCalled();
  });

  it("moves only the legacy local receiver anchor to MoonSleep Ops and replays unchanged", async () => {
    const ctx = sourceIdentityContext({
      legacyReceiverEntityId: "entity-integration",
    });
    await expect(seedShopifySourceIdentities(ctx as never)).resolves.toMatchObject({
      receiver_grounding: {
        outcome: "updated",
        platform: "shopify",
        space_id: "",
        contact_id: "shopify-primary",
        canonical_entity_id: "entity_moonsleep_ops",
      },
    });
    await expect(seedShopifySourceIdentities(ctx as never)).resolves.toMatchObject({
      receiver_grounding: {
        outcome: "unchanged",
        canonical_entity_id: "entity_moonsleep_ops",
      },
    });
    expect(ctx.createContact).not.toHaveBeenCalled();
    expect(ctx.updateContact).toHaveBeenCalledTimes(1);
    expect(ctx.updateContact).toHaveBeenCalledWith({
      id: "contact-legacy-shopify-primary",
      entity_id: "entity_moonsleep_ops",
      contact_name: "MoonSleep Ops",
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
        space_id: "moonsleepco.myshopify.com",
        source_observation_id:
          "moonsleep-commerce:shopify-source:integration:v2:moonsleepco.myshopify.com:shopify-primary",
        observed_at: Date.UTC(2026, 6, 20),
        tags: ["Integration", "MoonSleep", "Shopify"],
      }),
    ]);
  });
});

function customerRecord(recordId: string, customerId: string) {
  const providerObjectJson = JSON.stringify({
    id: customerId,
    displayName: `Customer ${customerId}`,
  });
  return {
    id: recordId,
    record_id: recordId,
    payload_sha256: createHash("sha256").update(`immutable:${recordId}`).digest("hex"),
    platform: "shopify",
    source_record_type: "shopify.customer",
    source_space_id: "moonsleepco.myshopify.com",
    space_id: "moonsleepco.myshopify.com",
    timestamp: 1_784_564_000_000,
    payload: {
      source_metadata: {
        provider_payload: {
          provider_object_json: providerObjectJson,
          provider_object_sha256: createHash("sha256").update(providerObjectJson).digest("hex"),
        },
      },
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
  const customerFacets = new Map<string, Record<string, unknown>>();
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
  const episodeCreate = vi.fn(async (input: Record<string, unknown>) => ({
    item: { episode_id: `episode-${String(input.idempotencyKey)}` },
  }));
  const factCreate = vi.fn(async (input: Record<string, unknown>) => ({
    item: { fact: { id: `fact-${String(input.idempotencyKey)}` } },
  }));
  const setCreate = vi.fn(async (input: Record<string, unknown>) => ({
    set: { id: `set-${String(input.idempotencyKey)}` },
  }));
  const memberAdd = vi.fn(async () => ({ ok: true }));
  const setSeal = vi.fn(async () => ({ seal: { setId: "set" }, reused: false }));
  const headGet = vi.fn(async () => ({ item: null }));
  const observationCommit = vi.fn(async (input: Record<string, unknown>) => {
    const subjectRef = String(input.subjectRef);
    return {
      item: {
        observation: { id: `observation-${subjectRef}` },
        receipt: {
          receipt_id: `receipt-${subjectRef}`,
          operation_type: "observation_commit",
        },
      },
      reused: false,
    };
  });
  const facetsList = vi.fn(async (input: Record<string, unknown>) => ({
    items: customerFacets.has(String(input.subject_id))
      ? [customerFacets.get(String(input.subject_id))]
      : [],
  }));
  const facetsGet = vi.fn(async (input: Record<string, unknown>) => {
    const attachment = [...customerFacets.values()].find(
      (candidate) => candidate.id === input.id,
    );
    if (!attachment) throw new Error(`Facet ${String(input.id)} not found`);
    return { attachment };
  });
  const facetsCreate = vi.fn(async (input: Record<string, unknown>) => {
    const attachment = { ...input, instance_key: null, lifecycle_state: "active" };
    customerFacets.set(String(input.subject_id), attachment);
    return { value: attachment, replayed: false };
  });
  return {
    params: { record_ids: Object.keys(recordById) },
    nex: {
      records: { get: recordsGet },
      contacts: { observe },
      entities: { resolve, tags: { list: tagsList } },
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
    recordsGet,
    observe,
  };
}

describe("Shopify customer cohort projector", () => {
  it("validates every record before creating identity observations", async () => {
    const first = customerRecord("record-1", "gid://shopify/Customer/1");
    const invalid = {
      ...customerRecord("record-2", "gid://shopify/Customer/2"),
      platform: "other",
    };
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
