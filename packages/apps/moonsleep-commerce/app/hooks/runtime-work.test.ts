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
    "Capture one bounded Shopify order delta page and durably ingest its exact records",
    "0 * * * * *",
  ],
  [
    "customers-delta",
    "customers.delta",
    "Capture one bounded Shopify customer delta page and durably ingest its exact records",
    "20 * * * * *",
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
      list: vi.fn(async () => ({ payload: { jobs } })),
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
      list: vi.fn(async () => ({ payload: { schedules } })),
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

    expect(occupied.size).toBe(1495);
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
      sourceJobDefinitionIds: Array.from({ length: 12 }, (_, index) => `job-${index + 3}`),
      sourceScheduleIds: Array.from({ length: 12 }, (_, index) => `schedule-${index + 1}`),
    });
    expect(fixture.runtime.jobs.create).toHaveBeenCalledTimes(14);
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
        },
        ...SOURCE_FIXTURES.map(([suffix, family, description], index) => ({
          id: `job-${index + 3}`,
          name: `moonsleep-commerce.shopify-source.${suffix}`,
          description,
          script_path: expectedSourceScript,
          config_json: JSON.stringify({ family }),
          status: "active",
        })),
        {
          id: "job-2",
          name: "moonsleep-commerce.shopify-order-commerce",
          description:
            "Project committed Shopify order and line-item revisions into typed commerce state",
          script_path: expectedCommerceScript,
          status: "inactive",
        },
      ],
      schedules: SOURCE_FIXTURES.map(([suffix, , , expression], index) => ({
        id: `schedule-${index + 1}`,
        name: `moonsleep-commerce.shopify-source.${suffix}`,
        job_definition_id: `job-${index + 3}`,
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
    expect(fixture.runtime.schedules.update).toHaveBeenCalledWith({
      id: "schedule-1",
      enabled: false,
    });

    await removeMoonSleepCommerceRuntimeWork(fixture.runtime);
    expect(fixture.runtime.events.subscriptions.delete).toHaveBeenCalledWith({
      id: "subscription-1",
    });
    expect(fixture.runtime.schedules.delete).toHaveBeenCalledWith({ id: "schedule-1" });
    expect(fixture.runtime.jobs.delete).toHaveBeenCalledWith({ id: "job-1" });
  });
});
