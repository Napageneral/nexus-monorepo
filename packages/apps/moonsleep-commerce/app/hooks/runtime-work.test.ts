import { Cron } from "croner";
import { describe, expect, it, vi } from "vitest";
import {
  disableMoonSleepCommerceRuntimeWork,
  ensureMoonSleepCommerceRuntimeWork,
  removeMoonSleepCommerceRuntimeWork,
} from "./runtime-work.js";

const SOURCE_FIXTURES = [
  [
    "orders-delta",
    "orders.delta",
    "Drain bounded Shopify order delta pages and durably ingest their exact records",
    "0 0-59/20 * * * *",
  ],
  [
    "customers-delta",
    "customers.delta",
    "Capture one bounded Shopify customer delta page and durably ingest its exact records",
    "20 10-59/20 * * * *",
  ],
  [
    "inventory-hot",
    "inventory.hot",
    "Capture bounded current Shopify inventory observations",
    "40 * * * * *",
  ],
  [
    "inventory-reconcile",
    "inventory.reconcile",
    "Reconcile the complete Shopify inventory snapshot in bounded provider pages",
    "5 1-59/5 * * * *",
  ],
  [
    "fulfillment-delta",
    "fulfillment.delta",
    "Capture bounded Shopify fulfillment observations",
    "15 2-59/5 * * * *",
  ],
  [
    "discounts-delta",
    "discounts.delta",
    "Capture bounded Shopify discount observations",
    "25 3-59/5 * * * *",
  ],
  [
    "finance-transactions",
    "finance.transactions",
    "Capture bounded Shopify Payments balance transaction observations",
    "35 4-59/5 * * * *",
  ],
  [
    "disputes-delta",
    "disputes.delta",
    "Capture bounded Shopify Payments dispute observations",
    "45 0-59/5 * * * *",
  ],
  [
    "products-delta",
    "products.delta",
    "Capture bounded Shopify product observations",
    "10 2-59/15 * * * *",
  ],
  [
    "catalog-delta",
    "catalog.delta",
    "Capture bounded Shopify collection and catalog observations",
    "50 7-59/15 * * * *",
  ],
  [
    "marketing-delta",
    "marketing.delta",
    "Capture bounded low-priority Shopify marketing observations",
    "13 13 * * * *",
  ],
  [
    "payouts-delta",
    "payouts.delta",
    "Capture bounded low-priority Shopify Payments payout observations",
    "17 17 */6 * * *",
  ],
] as const;

const SOURCE_RUNTIME_METHOD_ALLOWLIST = JSON.stringify([
  "record.ingest",
  "record.ingest_many",
  "shopify.source.abort",
  "shopify.source.capture",
  "shopify.source.commit",
]);
const CUSTOMER_PROJECTOR_RUNTIME_METHOD_ALLOWLIST = JSON.stringify([
  "contacts.observe",
  "facets.attachments.get",
  "memory.evidence.profiles.list",
  "memory.evidence.profiles.register",
  "records.get",
  "records.get_many",
  "semantics.apply",
]);
const COMMERCE_PROJECTOR_RUNTIME_METHOD_ALLOWLIST = JSON.stringify([
  "commerce.line-items.observe",
  "commerce.line-items.observe_many",
  "commerce.orders.get",
  "commerce.orders.observe",
  "commerce.orders.observe_many",
  "contacts.observe",
  "contacts.resolve",
  "entities.resolve",
  "records.get",
  "records.get_many",
]);

// The runtime's jobs.list and schedules.list: newest first, 100 rows unless a
// limit is given (at most 1,000), internal definitions dropped after the limit.
function runtimePage(rows: Array<Record<string, unknown>>, params: Record<string, unknown> = {}) {
  const limit = Math.max(1, Math.min(1_000, Number(params.limit ?? 100)));
  const offset = Math.max(0, Number(params.offset ?? 0));
  return rows
    .toReversed()
    .slice(offset, offset + limit)
    .filter((row) => row.internal !== true);
}

// Definitions registered after this app's own, as the moonsleep-site bridge
// timers were from 2026-09-11; one in fifteen is internal.
function newerForeignWork(count: number) {
  const jobs = Array.from({ length: count }, (_, index) => ({
    id: `foreign-job-${index}`,
    name: `moonsleep-site.timer.unit-${index}`,
    status: "active",
    internal: index % 15 === 0,
  }));
  const schedules = jobs.map((job) => ({
    id: job.id.replace("job", "schedule"),
    name: job.name,
    job_definition_id: job.id,
    expression: "0 * * * * *",
    timezone: "UTC",
    enabled: 1,
    internal: job.internal,
  }));
  return { jobs, schedules };
}

function runtimeFixture(
  initial: {
    jobs?: Array<Record<string, unknown>>;
    subscriptions?: Array<Record<string, unknown>>;
    schedules?: Array<Record<string, unknown>>;
  } = {},
) {
  const jobs = [...(initial.jobs ?? [])];
  const subscriptions = [...(initial.subscriptions ?? [])];
  const schedules = [...(initial.schedules ?? [])];
  const runtime = {
    jobs: {
      list: vi.fn(async (params?: Record<string, unknown>) => ({
        payload: { jobs: runtimePage(jobs, params) },
      })),
      create: vi.fn(async (params: Record<string, unknown>) => {
        const job = { id: `job-${jobs.length + 1}`, ...params };
        jobs.push(job);
        return { payload: { job } };
      }),
      update: vi.fn(async (params: Record<string, unknown>) => {
        const job = jobs.find((entry) => entry.id === params.id) ?? { id: params.id };
        Object.assign(job, params);
        return { payload: { job } };
      }),
      delete: vi.fn(async () => ({ payload: { deleted: true } })),
    },
    events: {
      subscriptions: {
        list: vi.fn(async (params: Record<string, unknown>) => ({
          payload: {
            subscriptions: subscriptions.filter(
              (entry) =>
                (!params.event_type || entry.event_type === params.event_type) &&
                (!params.job_definition_id || entry.job_definition_id === params.job_definition_id),
            ),
          },
        })),
        create: vi.fn(async (params: Record<string, unknown>) => {
          const subscription = {
            id: `subscription-${subscriptions.length + 1}`,
            match_json: JSON.stringify(params.match),
            ...params,
            enabled: params.enabled === true ? 1 : 0,
          };
          subscriptions.push(subscription);
          return { payload: { subscription } };
        }),
        update: vi.fn(async (params: Record<string, unknown>) => ({
          payload: { subscription: { id: params.id, ...params } },
        })),
        delete: vi.fn(async (params: Record<string, unknown>) => {
          const index = subscriptions.findIndex((entry) => entry.id === params.id);
          if (index >= 0) subscriptions.splice(index, 1);
          return { payload: { deleted: true } };
        }),
      },
    },
    schedules: {
      list: vi.fn(async (params?: Record<string, unknown>) => ({
        payload: { schedules: runtimePage(schedules, params) },
      })),
      create: vi.fn(async (params: Record<string, unknown>) => {
        const schedule = {
          id: `schedule-${schedules.length + 1}`,
          ...params,
          enabled: params.enabled === true ? 1 : 0,
        };
        schedules.push(schedule);
        return { payload: { schedule } };
      }),
      update: vi.fn(async (params: Record<string, unknown>) => {
        const schedule = schedules.find((entry) => entry.id === params.id) ?? { id: params.id };
        Object.assign(schedule, params, {
          enabled:
            params.enabled === undefined ? schedule.enabled : params.enabled === true ? 1 : 0,
        });
        return { payload: { schedule } };
      }),
      delete: vi.fn(async (params: Record<string, unknown>) => {
        const index = schedules.findIndex((entry) => entry.id === params.id);
        if (index >= 0) schedules.splice(index, 1);
        return { payload: { deleted: true } };
      }),
    },
  };
  return { runtime, jobs, subscriptions, schedules };
}

describe("MoonSleep commerce runtime work", () => {
  it("staggered source schedules never share an execution second", () => {
    const startMs = Date.parse("2026-07-24T00:00:00.000Z");
    const endMs = startMs + 6 * 60 * 60 * 1000;
    const occupied = new Map<number, string>();

    for (const [suffix, , , expression] of SOURCE_FIXTURES) {
      const cron = new Cron(expression, { timezone: "UTC", catch: false });
      let cursorMs = startMs;
      let occurrences = 0;
      while (cursorMs < endMs) {
        const nextRunMs = cron.nextRun(new Date(cursorMs - 1))?.getTime();
        expect(nextRunMs).toBeDefined();
        if (nextRunMs === undefined || nextRunMs >= endMs) {
          break;
        }
        expect(occupied.get(nextRunMs)).toBeUndefined();
        occupied.set(nextRunMs, suffix);
        occurrences += 1;
        cursorMs = nextRunMs + 1000;
      }
      expect(occurrences).toBeGreaterThan(0);
    }

    expect(occupied.size).toBe(811);
  });

  it("installs both Shopify projectors dormant pending production activation gates", async () => {
    const fixture = runtimeFixture();
    await expect(
      ensureMoonSleepCommerceRuntimeWork({ runtime: fixture.runtime, appId: "moonsleep-commerce" }),
    ).resolves.toEqual({
      jobDefinitionId: "job-1",
      subscriptionIds: ["subscription-1"],
      commerceJobDefinitionId: "job-2",
      commerceSubscriptionIds: ["subscription-2", "subscription-3"],
      paidOrderEffectsJobDefinitionId: "job-3",
      sourceJobDefinitionIds: Array.from({ length: 12 }, (_, index) => `job-${index + 4}`),
      sourceScheduleIds: Array.from({ length: 12 }, (_, index) => `schedule-${index + 1}`),
    });
    expect(fixture.runtime.jobs.create).toHaveBeenCalledTimes(15);
    expect(fixture.runtime.jobs.create.mock.calls[2]![0]).toMatchObject({
      name: "moonsleep-commerce.shopify-paid-order-effects",
      lane_id: "adapter_io",
      execution_profile_revision_id: "job_profile_bulk_compute_r1",
      runtime_method_allowlist: JSON.stringify(["jobs.effects.perform"]),
      status: "active",
      timeout_ms: 300_000,
    });
    for (const call of fixture.runtime.jobs.create.mock.calls.slice(3)) {
      expect(call[0]).toMatchObject({
        lane_id: "adapter_io",
        timeout_ms: 900_000,
        execution_profile_revision_id: "job_profile_adapter_capture_r1",
        runtime_method_allowlist: SOURCE_RUNTIME_METHOD_ALLOWLIST,
      });
    }
    expect(fixture.runtime.jobs.create.mock.calls[0]![0]).toMatchObject({
      lane_id: "automation",
      execution_profile_revision_id: "job_profile_adapter_projection_r1",
      runtime_method_allowlist: CUSTOMER_PROJECTOR_RUNTIME_METHOD_ALLOWLIST,
    });
    expect(fixture.runtime.jobs.create.mock.calls[1]![0]).toMatchObject({
      lane_id: "automation",
      execution_profile_revision_id: "job_profile_adapter_projection_r1",
      runtime_method_allowlist: COMMERCE_PROJECTOR_RUNTIME_METHOD_ALLOWLIST,
    });
    for (const call of fixture.runtime.jobs.create.mock.calls.slice(0, 2)) {
      expect(call[0]).not.toHaveProperty("timeout_ms");
    }
    expect(fixture.runtime.schedules.create).toHaveBeenCalledTimes(12);
    for (const call of fixture.runtime.schedules.create.mock.calls) {
      expect(call[0]).toMatchObject({ enabled: false, timezone: "UTC" });
    }
    expect(fixture.runtime.schedules.create.mock.calls.map((call) => call[0].expression)).toEqual(
      SOURCE_FIXTURES.map((fixture) => fixture[3]),
    );
    expect(
      new Set(SOURCE_FIXTURES.slice(0, 3).map((fixture) => fixture[3].split(" ")[0])).size,
    ).toBe(3);
    expect(
      new Set(
        SOURCE_FIXTURES.slice(3, 8).map((fixture) => fixture[3].split(" ").slice(0, 2).join(" ")),
      ).size,
    ).toBe(5);
    expect(
      new Set(
        SOURCE_FIXTURES.slice(8, 10).map((fixture) => fixture[3].split(" ").slice(0, 2).join(" ")),
      ).size,
    ).toBe(2);
    expect(fixture.runtime.events.subscriptions.create).toHaveBeenCalledTimes(3);
    expect(fixture.runtime.events.subscriptions.create).toHaveBeenCalledWith({
      job_definition_id: "job-1",
      event_type: "record.ingested",
      match: { platform: "shopify", container_id: "customer" },
      enabled: false,
    });
    for (const container_id of ["order", "line_item"]) {
      expect(fixture.runtime.events.subscriptions.create).toHaveBeenCalledWith({
        job_definition_id: "job-2",
        event_type: "record.ingested",
        match: { platform: "shopify", container_id },
        enabled: false,
      });
    }
  });

  it("is idempotent when the exact dormant job and subscription already exist", async () => {
    const expectedScript = new URL("../jobs/shopify-customer-identity.ts", import.meta.url)
      .pathname;
    const expectedCommerceScript = new URL("../jobs/shopify-order-commerce.ts", import.meta.url)
      .pathname;
    const expectedSourceScript = new URL("../jobs/shopify-source-observation.ts", import.meta.url)
      .pathname;
    const fixture = runtimeFixture({
      jobs: [
        {
          id: "job-1",
          name: "moonsleep-commerce.shopify-customer-identity",
          description:
            "Observe Shopify customer contacts and verify canonical MoonSleep customer entities",
          script_path: expectedScript,
          status: "inactive",
          lane_id: "automation",
          execution_profile_revision_id: "job_profile_adapter_projection_r1",
          runtime_method_allowlist: CUSTOMER_PROJECTOR_RUNTIME_METHOD_ALLOWLIST,
        },
        {
          id: "job-3",
          name: "moonsleep-commerce.shopify-paid-order-effects",
          description:
            "Reserve provider-write-disabled effect intents for one paid Shopify order work group",
          script_path: new URL("../jobs/shopify-paid-order-effects.ts", import.meta.url).pathname,
          status: "active",
          lane_id: "adapter_io",
          timeout_ms: 300_000,
          execution_profile_revision_id: "job_profile_bulk_compute_r1",
          runtime_method_allowlist: JSON.stringify(["jobs.effects.perform"]),
        },
        ...SOURCE_FIXTURES.map(([suffix, family, description], index) => ({
          id: `job-${index + 4}`,
          name: `moonsleep-commerce.shopify-source.${suffix}`,
          description,
          script_path: expectedSourceScript,
          config_json: JSON.stringify({ family }),
          status: "active",
          lane_id: "adapter_io",
          timeout_ms: 900_000,
          execution_profile_revision_id: "job_profile_adapter_capture_r1",
          runtime_method_allowlist: SOURCE_RUNTIME_METHOD_ALLOWLIST,
        })),
        {
          id: "job-2",
          name: "moonsleep-commerce.shopify-order-commerce",
          description:
            "Project committed Shopify order and line-item revisions into typed commerce state",
          script_path: expectedCommerceScript,
          status: "inactive",
          lane_id: "automation",
          execution_profile_revision_id: "job_profile_adapter_projection_r1",
          runtime_method_allowlist: COMMERCE_PROJECTOR_RUNTIME_METHOD_ALLOWLIST,
        },
      ],
      schedules: SOURCE_FIXTURES.map(([suffix, , , expression], index) => ({
        id: `schedule-${index + 1}`,
        name: `moonsleep-commerce.shopify-source.${suffix}`,
        job_definition_id: `job-${index + 4}`,
        expression,
        timezone: "UTC",
        enabled: 0,
      })),
      subscriptions: [
        {
          id: "subscription-1",
          job_definition_id: "job-1",
          event_type: "record.ingested",
          match_json: JSON.stringify({ platform: "shopify", container_id: "customer" }),
          enabled: 0,
        },
        {
          id: "subscription-2",
          job_definition_id: "job-2",
          event_type: "record.ingested",
          match_json: JSON.stringify({ platform: "shopify", container_id: "order" }),
          enabled: 0,
        },
        {
          id: "subscription-3",
          job_definition_id: "job-2",
          event_type: "record.ingested",
          match_json: JSON.stringify({ platform: "shopify", container_id: "line_item" }),
          enabled: 0,
        },
      ],
    });
    await ensureMoonSleepCommerceRuntimeWork({
      runtime: fixture.runtime,
      appId: "moonsleep-commerce",
    });
    expect(fixture.runtime.jobs.create).not.toHaveBeenCalled();
    expect(fixture.runtime.jobs.update).not.toHaveBeenCalled();
    expect(fixture.runtime.events.subscriptions.create).not.toHaveBeenCalled();
    expect(fixture.runtime.schedules.create).not.toHaveBeenCalled();
    expect(fixture.runtime.schedules.update).not.toHaveBeenCalled();
  });

  it("re-installs over owned work that newer definitions pushed past the first page", async () => {
    // On the primary (2026-10-19) the default jobs.list page holds 74 of 160
    // visible definitions, newest first, and every job this app owns (created
    // 2026-07-21 to 08-31) is older than the bridge timers registered from
    // 2026-09-11. A re-install that read one page created a second definition
    // and a second schedule for each of them.
    const fixture = runtimeFixture();
    await ensureMoonSleepCommerceRuntimeWork({
      runtime: fixture.runtime,
      appId: "moonsleep-commerce",
    });
    const foreign = newerForeignWork(1_050);
    fixture.jobs.push(...foreign.jobs);
    fixture.schedules.push(...foreign.schedules);
    vi.clearAllMocks();

    await ensureMoonSleepCommerceRuntimeWork({
      runtime: fixture.runtime,
      appId: "moonsleep-commerce",
    });

    expect(fixture.runtime.jobs.create).not.toHaveBeenCalled();
    expect(fixture.runtime.jobs.update).not.toHaveBeenCalled();
    expect(fixture.runtime.schedules.create).not.toHaveBeenCalled();
    expect(fixture.runtime.schedules.update).not.toHaveBeenCalled();
    expect(fixture.runtime.events.subscriptions.create).not.toHaveBeenCalled();
    expect(fixture.jobs).toHaveLength(15 + 1_050);
    expect(fixture.schedules).toHaveLength(12 + 1_050);
    // The first full page came back short once internal rows were dropped;
    // the owned work was only on the second.
    expect(fixture.runtime.jobs.list).toHaveBeenCalledWith({ limit: 1_000, offset: 1_000 });
    expect(fixture.runtime.schedules.list).toHaveBeenCalledWith({ limit: 1_000, offset: 1_000 });
  });

  it("refuses to choose between two definitions of an owned job", async () => {
    const fixture = runtimeFixture();
    await ensureMoonSleepCommerceRuntimeWork({
      runtime: fixture.runtime,
      appId: "moonsleep-commerce",
    });
    const effects = fixture.jobs.find(
      (row) => row.name === "moonsleep-commerce.shopify-paid-order-effects",
    )!;
    fixture.jobs.push({ ...effects, id: "job-duplicate" });
    vi.clearAllMocks();

    await expect(
      ensureMoonSleepCommerceRuntimeWork({ runtime: fixture.runtime, appId: "moonsleep-commerce" }),
    ).rejects.toThrow(
      "MoonSleep commerce job moonsleep-commerce.shopify-paid-order-effects has duplicate definitions",
    );
    expect(fixture.runtime.jobs.create).not.toHaveBeenCalled();
    expect(fixture.runtime.jobs.update).not.toHaveBeenCalled();
  });

  it("fails closed when jobs.list never reaches an empty page", async () => {
    const fixture = runtimeFixture();
    fixture.runtime.jobs.list.mockImplementation(async () => ({
      payload: { jobs: [{ id: "foreign-job", name: "another-app.job", status: "active" }] },
    }));

    await expect(
      ensureMoonSleepCommerceRuntimeWork({ runtime: fixture.runtime, appId: "moonsleep-commerce" }),
    ).rejects.toThrow("Nex jobs.list reached its page bound");
    expect(fixture.runtime.jobs.list).toHaveBeenCalledTimes(20);
    expect(fixture.runtime.jobs.list).toHaveBeenLastCalledWith({ limit: 1_000, offset: 19_000 });
    expect(fixture.runtime.jobs.create).not.toHaveBeenCalled();
  });

  it("fails closed when a jobs.list page is not a list instead of creating every job", async () => {
    const fixture = runtimeFixture();
    fixture.runtime.jobs.list.mockImplementation(async () => ({
      ok: false,
      error: { message: "jobs.list failed: unavailable" },
    }));

    await expect(
      ensureMoonSleepCommerceRuntimeWork({ runtime: fixture.runtime, appId: "moonsleep-commerce" }),
    ).rejects.toThrow("Nex jobs.list did not return a jobs list");
    expect(fixture.runtime.jobs.create).not.toHaveBeenCalled();
  });

  it("repairs Shopify projectors that were defaulted into the workflow lane", async () => {
    const fixture = runtimeFixture({
      jobs: [
        {
          id: "job-1",
          name: "moonsleep-commerce.shopify-customer-identity",
          description:
            "Observe Shopify customer contacts and verify canonical MoonSleep customer entities",
          script_path: new URL("../jobs/shopify-customer-identity.ts", import.meta.url).pathname,
          status: "active",
          lane_id: "workflow",
        },
        {
          id: "job-2",
          name: "moonsleep-commerce.shopify-order-commerce",
          description:
            "Project committed Shopify order and line-item revisions into typed commerce state",
          script_path: new URL("../jobs/shopify-order-commerce.ts", import.meta.url).pathname,
          status: "active",
          lane_id: "workflow",
        },
      ],
    });

    await ensureMoonSleepCommerceRuntimeWork({
      runtime: fixture.runtime,
      appId: "moonsleep-commerce",
    });

    expect(fixture.runtime.jobs.update).toHaveBeenCalledTimes(2);
    expect(fixture.runtime.jobs.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: "job-1", lane_id: "automation", status: "active" }),
    );
    expect(fixture.runtime.jobs.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: "job-2", lane_id: "automation", status: "active" }),
    );
  });

  it("preserves configured source bindings and enabled schedules during rehydration", async () => {
    const expectedSourceScript = new URL("../jobs/shopify-source-observation.ts", import.meta.url)
      .pathname;
    const fixture = runtimeFixture({
      jobs: SOURCE_FIXTURES.map(([suffix, family, description], index) => ({
        id: `job-${index + 1}`,
        name: `moonsleep-commerce.shopify-source.${suffix}`,
        description,
        script_path: expectedSourceScript,
        config_json: JSON.stringify({ family, connection_id: "shopify-production" }),
        status: "active",
        lane_id: "adapter_io",
        timeout_ms: 900_000,
        execution_profile_revision_id: "job_profile_adapter_capture_r1",
        runtime_method_allowlist: SOURCE_RUNTIME_METHOD_ALLOWLIST,
      })),
      schedules: SOURCE_FIXTURES.map(([suffix, , , expression], index) => ({
        id: `schedule-${index + 1}`,
        name: `moonsleep-commerce.shopify-source.${suffix}`,
        job_definition_id: `job-${index + 1}`,
        expression,
        timezone: "UTC",
        enabled: index < 2 ? 1 : 0,
      })),
    });

    await ensureMoonSleepCommerceRuntimeWork({
      runtime: fixture.runtime,
      appId: "moonsleep-commerce",
    });

    expect(fixture.runtime.jobs.update).not.toHaveBeenCalled();
    expect(fixture.runtime.schedules.update).not.toHaveBeenCalled();
    expect(fixture.jobs[0]?.config_json).toBe(
      JSON.stringify({ family: "orders.delta", connection_id: "shopify-production" }),
    );
    expect(fixture.schedules.slice(0, 2).map((schedule) => schedule.enabled)).toEqual([1, 1]);
  });

  it("repairs the bounded source timeout without replacing its binding or schedule state", async () => {
    const fixture = runtimeFixture({
      jobs: SOURCE_FIXTURES.map(([suffix, family, description], index) => ({
        id: `job-${index + 1}`,
        name: `moonsleep-commerce.shopify-source.${suffix}`,
        description,
        script_path: new URL("../jobs/shopify-source-observation.ts", import.meta.url).pathname,
        config_json: JSON.stringify({ family, connection_id: "shopify-production" }),
        status: "active",
        lane_id: "adapter_io",
        timeout_ms: index === 0 ? null : 900_000,
        execution_profile_revision_id: "job_profile_adapter_capture_r1",
        runtime_method_allowlist: SOURCE_RUNTIME_METHOD_ALLOWLIST,
      })),
      schedules: SOURCE_FIXTURES.map(([suffix, , , expression], index) => ({
        id: `schedule-${index + 1}`,
        name: `moonsleep-commerce.shopify-source.${suffix}`,
        job_definition_id: `job-${index + 1}`,
        expression,
        timezone: "UTC",
        enabled: index === 0 ? 1 : 0,
      })),
    });

    await ensureMoonSleepCommerceRuntimeWork({
      runtime: fixture.runtime,
      appId: "moonsleep-commerce",
    });

    expect(fixture.runtime.jobs.update).toHaveBeenCalledTimes(1);
    expect(fixture.runtime.jobs.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "job-1", timeout_ms: 900_000 }),
    );
    expect(fixture.runtime.jobs.update.mock.calls[0]?.[0]).not.toHaveProperty("config_json");
    expect(fixture.runtime.schedules.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: "schedule-1", enabled: false }),
    );
    expect(fixture.jobs[0]?.config_json).toBe(
      JSON.stringify({ family: "orders.delta", connection_id: "shopify-production" }),
    );
    expect(fixture.schedules[0]?.enabled).toBe(1);
  });

  it("preserves a configured binding when repairing other source job metadata", async () => {
    const fixture = runtimeFixture({
      jobs: [
        {
          id: "job-1",
          name: "moonsleep-commerce.shopify-source.inventory-hot",
          description: "stale description",
          script_path: new URL("../jobs/shopify-source-observation.ts", import.meta.url).pathname,
          config_json: JSON.stringify({
            family: "inventory.hot",
            connection_id: "shopify-production",
          }),
          status: "active",
          lane_id: "workflow",
          timeout_ms: 900_000,
        },
      ],
      schedules: [
        {
          id: "schedule-1",
          name: "moonsleep-commerce.shopify-source.inventory-hot",
          job_definition_id: "job-1",
          expression: "40 * * * * *",
          timezone: "UTC",
          enabled: 1,
        },
      ],
    });

    await ensureMoonSleepCommerceRuntimeWork({
      runtime: fixture.runtime,
      appId: "moonsleep-commerce",
    });

    expect(fixture.runtime.jobs.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "job-1", lane_id: "adapter_io" }),
    );
    expect(fixture.runtime.jobs.update.mock.calls[0]?.[0]).not.toHaveProperty("config_json");
    expect(fixture.runtime.schedules.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: "schedule-1", enabled: false }),
    );
    expect(fixture.jobs[0]?.config_json).toBe(
      JSON.stringify({ family: "inventory.hot", connection_id: "shopify-production" }),
    );
    expect(fixture.schedules[0]?.enabled).toBe(1);
  });

  it("fails closed on an unexpected configured source payload", async () => {
    const fixture = runtimeFixture({
      jobs: [
        {
          id: "job-1",
          name: "moonsleep-commerce.shopify-source.inventory-hot",
          description: "Capture bounded current Shopify inventory observations",
          script_path: new URL("../jobs/shopify-source-observation.ts", import.meta.url).pathname,
          config_json: JSON.stringify({
            family: "inventory.hot",
            connection_id: "shopify-production",
            unexpected: true,
          }),
          status: "active",
          lane_id: "adapter_io",
        },
      ],
    });

    await expect(
      ensureMoonSleepCommerceRuntimeWork({
        runtime: fixture.runtime,
        appId: "moonsleep-commerce",
      }),
    ).rejects.toThrow(/unexpected config/);
    expect(fixture.runtime.jobs.update).not.toHaveBeenCalled();
    expect(fixture.runtime.schedules.update).not.toHaveBeenCalled();
  });

  it("repairs source jobs that were defaulted into the workflow lane", async () => {
    const expectedSourceScript = new URL("../jobs/shopify-source-observation.ts", import.meta.url)
      .pathname;
    const fixture = runtimeFixture({
      jobs: SOURCE_FIXTURES.map(([suffix, family, description], index) => ({
        id: `job-${index + 1}`,
        name: `moonsleep-commerce.shopify-source.${suffix}`,
        description,
        script_path: expectedSourceScript,
        config_json: JSON.stringify({ family }),
        status: "active",
        lane_id: "workflow",
      })),
    });

    await ensureMoonSleepCommerceRuntimeWork({
      runtime: fixture.runtime,
      appId: "moonsleep-commerce",
    });

    expect(fixture.runtime.jobs.update).toHaveBeenCalledTimes(SOURCE_FIXTURES.length);
    for (const call of fixture.runtime.jobs.update.mock.calls) {
      expect(call[0]).toMatchObject({ lane_id: "adapter_io" });
    }
  });

  it("replaces only the disabled legacy broad subscriptions", async () => {
    const fixture = runtimeFixture({
      jobs: [
        {
          id: "job-1",
          name: "moonsleep-commerce.shopify-customer-identity",
          description:
            "Observe Shopify customer contacts and verify canonical MoonSleep customer entities",
          script_path: new URL("../jobs/shopify-customer-identity.ts", import.meta.url).pathname,
          status: "inactive",
        },
      ],
      subscriptions: [
        {
          id: "legacy",
          job_definition_id: "job-1",
          event_type: "record.ingested",
          match_json: JSON.stringify({ platform: "shopify" }),
          enabled: 0,
        },
      ],
    });
    await ensureMoonSleepCommerceRuntimeWork({
      runtime: fixture.runtime,
      appId: "moonsleep-commerce",
    });
    expect(fixture.runtime.events.subscriptions.delete).toHaveBeenCalledWith({ id: "legacy" });
    expect(fixture.runtime.events.subscriptions.create).toHaveBeenCalledWith({
      job_definition_id: "job-1",
      event_type: "record.ingested",
      match: { platform: "shopify", container_id: "customer" },
      enabled: false,
    });
  });

  it("fails closed on an unexpected subscription rather than deleting or replacing it", async () => {
    const fixture = runtimeFixture({
      jobs: [
        {
          id: "job-1",
          name: "moonsleep-commerce.shopify-customer-identity",
          description:
            "Observe Shopify customer contacts and verify canonical MoonSleep customer entities",
          script_path: new URL("../jobs/shopify-customer-identity.ts", import.meta.url).pathname,
          status: "inactive",
        },
      ],
      subscriptions: [
        {
          id: "foreign",
          job_definition_id: "job-1",
          event_type: "record.ingested",
          match_json: JSON.stringify({ platform: "gmail" }),
          enabled: 1,
        },
      ],
    });
    await expect(
      ensureMoonSleepCommerceRuntimeWork({ runtime: fixture.runtime, appId: "moonsleep-commerce" }),
    ).rejects.toThrow(/unexpected event subscription/);
    expect(fixture.runtime.events.subscriptions.delete).not.toHaveBeenCalled();
  });

  it("fails closed rather than replacing an enabled legacy broad subscription", async () => {
    const fixture = runtimeFixture({
      jobs: [
        {
          id: "job-1",
          name: "moonsleep-commerce.shopify-customer-identity",
          description:
            "Observe Shopify customer contacts and verify canonical MoonSleep customer entities",
          script_path: new URL("../jobs/shopify-customer-identity.ts", import.meta.url).pathname,
          status: "inactive",
        },
      ],
      subscriptions: [
        {
          id: "legacy-active",
          job_definition_id: "job-1",
          event_type: "record.ingested",
          match_json: JSON.stringify({ platform: "shopify" }),
          enabled: 1,
        },
      ],
    });
    await expect(
      ensureMoonSleepCommerceRuntimeWork({ runtime: fixture.runtime, appId: "moonsleep-commerce" }),
    ).rejects.toThrow(/unexpected event subscription/);
    expect(fixture.runtime.events.subscriptions.delete).not.toHaveBeenCalled();
  });

  it("preserves operator-enabled source schedules across package upgrade lifecycle hooks", async () => {
    const expectedSourceScript = new URL("../jobs/shopify-source-observation.ts", import.meta.url)
      .pathname;
    const fixture = runtimeFixture({
      jobs: SOURCE_FIXTURES.map(([suffix, family, description], index) => ({
        id: `job-${index + 1}`,
        name: `moonsleep-commerce.shopify-source.${suffix}`,
        description,
        script_path: expectedSourceScript,
        config_json: JSON.stringify({ family, connection_id: "shopify-production" }),
        status: "active",
        lane_id: "adapter_io",
        timeout_ms: 900_000,
        execution_profile_revision_id: "job_profile_adapter_capture_r1",
        runtime_method_allowlist: SOURCE_RUNTIME_METHOD_ALLOWLIST,
      })),
      schedules: SOURCE_FIXTURES.map(([suffix, , , expression], index) => ({
        id: `schedule-${index + 1}`,
        name: `moonsleep-commerce.shopify-source.${suffix}`,
        job_definition_id: `job-${index + 1}`,
        expression,
        timezone: "UTC",
        enabled: index < 2 ? 1 : 0,
      })),
    });

    await disableMoonSleepCommerceRuntimeWork(fixture.runtime);
    await ensureMoonSleepCommerceRuntimeWork({
      runtime: fixture.runtime,
      appId: "moonsleep-commerce",
    });

    expect(fixture.schedules.slice(0, 2).map((schedule) => schedule.enabled)).toEqual([1, 1]);
  });

  it("disables and removes only the exact owned work", async () => {
    const fixture = runtimeFixture({
      jobs: [
        {
          id: "job-1",
          name: "moonsleep-commerce.shopify-customer-identity",
          status: "active",
        },
      ],
      subscriptions: [
        {
          id: "subscription-1",
          job_definition_id: "job-1",
          event_type: "record.ingested",
          match_json: JSON.stringify({ platform: "shopify" }),
          enabled: 1,
        },
      ],
      schedules: [
        {
          id: "schedule-1",
          name: "moonsleep-commerce.shopify-source.orders-delta",
          job_definition_id: "job-1",
          expression: "* * * * *",
          timezone: "UTC",
          enabled: 1,
        },
      ],
    });
    await disableMoonSleepCommerceRuntimeWork(fixture.runtime);
    expect(fixture.runtime.events.subscriptions.update).toHaveBeenCalledWith({
      id: "subscription-1",
      enabled: false,
    });
    expect(fixture.runtime.jobs.update).toHaveBeenCalledWith({ id: "job-1", status: "inactive" });
    expect(fixture.runtime.schedules.update).not.toHaveBeenCalled();
    expect(fixture.schedules[0]?.enabled).toBe(1);

    await removeMoonSleepCommerceRuntimeWork(fixture.runtime);
    expect(fixture.runtime.events.subscriptions.delete).toHaveBeenCalledWith({
      id: "subscription-1",
    });
    expect(fixture.runtime.schedules.delete).toHaveBeenCalledWith({ id: "schedule-1" });
    expect(fixture.runtime.jobs.delete).toHaveBeenCalledWith({ id: "job-1" });
  });
});
