import { describe, expect, it, vi } from "vitest";
import {
  disableMoonSleepCommerceRuntimeWork,
  ensureMoonSleepCommerceRuntimeWork,
  removeMoonSleepCommerceRuntimeWork,
} from "./runtime-work.js";

function runtimeFixture(initial: {
  jobs?: Array<Record<string, unknown>>;
  subscriptions?: Array<Record<string, unknown>>;
} = {}) {
  const jobs = [...(initial.jobs ?? [])];
  const subscriptions = [...(initial.subscriptions ?? [])];
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
  };
  return { runtime, jobs, subscriptions };
}

describe("MoonSleep commerce runtime work", () => {
  it("installs both Shopify projectors dormant pending production activation gates", async () => {
    const fixture = runtimeFixture();
    await expect(
      ensureMoonSleepCommerceRuntimeWork({ runtime: fixture.runtime, appId: "moonsleep-commerce" }),
    ).resolves.toEqual({
      jobDefinitionId: "job-1",
      subscriptionIds: ["subscription-1"],
      commerceJobDefinitionId: "job-2",
      commerceSubscriptionIds: ["subscription-2", "subscription-3"],
    });
    expect(fixture.runtime.jobs.create).toHaveBeenCalledTimes(2);
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
    const expectedScript = new URL("../jobs/shopify-customer-identity.ts", import.meta.url).pathname;
    const expectedCommerceScript = new URL("../jobs/shopify-order-commerce.ts", import.meta.url).pathname;
    const fixture = runtimeFixture({
      jobs: [
        {
          id: "job-1",
          name: "moonsleep-commerce.shopify-customer-identity",
          description: "Observe Shopify customer contacts and verify canonical MoonSleep customer entities",
          script_path: expectedScript,
          status: "inactive",
        },
        {
          id: "job-2",
          name: "moonsleep-commerce.shopify-order-commerce",
          description: "Project committed Shopify order and line-item revisions into typed commerce state",
          script_path: expectedCommerceScript,
          status: "inactive",
        },
      ],
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
    await ensureMoonSleepCommerceRuntimeWork({ runtime: fixture.runtime, appId: "moonsleep-commerce" });
    expect(fixture.runtime.jobs.create).not.toHaveBeenCalled();
    expect(fixture.runtime.jobs.update).not.toHaveBeenCalled();
    expect(fixture.runtime.events.subscriptions.create).not.toHaveBeenCalled();
  });

  it("replaces only the disabled legacy broad subscriptions", async () => {
    const fixture = runtimeFixture({
      jobs: [{
        id: "job-1",
        name: "moonsleep-commerce.shopify-customer-identity",
        description: "Observe Shopify customer contacts and verify canonical MoonSleep customer entities",
        script_path: new URL("../jobs/shopify-customer-identity.ts", import.meta.url).pathname,
        status: "inactive",
      }],
      subscriptions: [{
        id: "legacy",
        job_definition_id: "job-1",
        event_type: "record.ingested",
        match_json: JSON.stringify({ platform: "shopify" }),
        enabled: 0,
      }],
    });
    await ensureMoonSleepCommerceRuntimeWork({ runtime: fixture.runtime, appId: "moonsleep-commerce" });
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
      jobs: [{
        id: "job-1",
        name: "moonsleep-commerce.shopify-customer-identity",
        description: "Observe Shopify customer contacts and verify canonical MoonSleep customer entities",
        script_path: new URL("../jobs/shopify-customer-identity.ts", import.meta.url).pathname,
        status: "inactive",
      }],
      subscriptions: [{
        id: "foreign",
        job_definition_id: "job-1",
        event_type: "record.ingested",
        match_json: JSON.stringify({ platform: "gmail" }),
        enabled: 1,
      }],
    });
    await expect(
      ensureMoonSleepCommerceRuntimeWork({ runtime: fixture.runtime, appId: "moonsleep-commerce" }),
    ).rejects.toThrow(/unexpected event subscription/);
    expect(fixture.runtime.events.subscriptions.delete).not.toHaveBeenCalled();
  });

  it("fails closed rather than replacing an enabled legacy broad subscription", async () => {
    const fixture = runtimeFixture({
      jobs: [{
        id: "job-1",
        name: "moonsleep-commerce.shopify-customer-identity",
        description: "Observe Shopify customer contacts and verify canonical MoonSleep customer entities",
        script_path: new URL("../jobs/shopify-customer-identity.ts", import.meta.url).pathname,
        status: "inactive",
      }],
      subscriptions: [{
        id: "legacy-active",
        job_definition_id: "job-1",
        event_type: "record.ingested",
        match_json: JSON.stringify({ platform: "shopify" }),
        enabled: 1,
      }],
    });
    await expect(
      ensureMoonSleepCommerceRuntimeWork({ runtime: fixture.runtime, appId: "moonsleep-commerce" }),
    ).rejects.toThrow(/unexpected event subscription/);
    expect(fixture.runtime.events.subscriptions.delete).not.toHaveBeenCalled();
  });

  it("disables and removes only the exact owned work", async () => {
    const fixture = runtimeFixture({
      jobs: [{
        id: "job-1",
        name: "moonsleep-commerce.shopify-customer-identity",
        status: "active",
      }],
      subscriptions: [{
        id: "subscription-1",
        job_definition_id: "job-1",
        event_type: "record.ingested",
        match_json: JSON.stringify({ platform: "shopify" }),
        enabled: 1,
      }],
    });
    await disableMoonSleepCommerceRuntimeWork(fixture.runtime);
    expect(fixture.runtime.events.subscriptions.update).toHaveBeenCalledWith({
      id: "subscription-1",
      enabled: false,
    });
    expect(fixture.runtime.jobs.update).toHaveBeenCalledWith({ id: "job-1", status: "inactive" });

    await removeMoonSleepCommerceRuntimeWork(fixture.runtime);
    expect(fixture.runtime.events.subscriptions.delete).toHaveBeenCalledWith({ id: "subscription-1" });
    expect(fixture.runtime.jobs.delete).toHaveBeenCalledWith({ id: "job-1" });
  });
});
