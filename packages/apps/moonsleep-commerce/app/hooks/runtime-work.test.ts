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
        const job = { id: "job-1", ...params };
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
        list: vi.fn(async () => ({ payload: { subscriptions } })),
        create: vi.fn(async (params: Record<string, unknown>) => {
          const subscription = {
            id: "subscription-1",
            match_json: JSON.stringify(params.match),
            ...params,
            enabled: 1,
          };
          subscriptions.push(subscription);
          return { payload: { subscription } };
        }),
        update: vi.fn(async (params: Record<string, unknown>) => ({
          payload: { subscription: { id: params.id, ...params } },
        })),
        delete: vi.fn(async () => ({ payload: { deleted: true } })),
      },
    },
  };
  return { runtime, jobs, subscriptions };
}

describe("MoonSleep commerce runtime work", () => {
  it("creates one active Shopify record subscription for the customer projector", async () => {
    const fixture = runtimeFixture();
    await expect(
      ensureMoonSleepCommerceRuntimeWork({ runtime: fixture.runtime, appId: "moonsleep-commerce" }),
    ).resolves.toEqual({ jobDefinitionId: "job-1", subscriptionId: "subscription-1" });
    expect(fixture.runtime.jobs.create).toHaveBeenCalledOnce();
    expect(fixture.runtime.events.subscriptions.create).toHaveBeenCalledWith({
      job_definition_id: "job-1",
      event_type: "record.ingested",
      match: { platform: "shopify" },
      enabled: true,
    });
  });

  it("is idempotent when the exact active job and subscription already exist", async () => {
    const expectedScript = new URL("../jobs/shopify-customer-identity.ts", import.meta.url).pathname;
    const fixture = runtimeFixture({
      jobs: [{
        id: "job-1",
        name: "moonsleep-commerce.shopify-customer-identity",
        description: "Observe Shopify customer contacts and verify canonical MoonSleep customer entities",
        script_path: expectedScript,
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
    await ensureMoonSleepCommerceRuntimeWork({ runtime: fixture.runtime, appId: "moonsleep-commerce" });
    expect(fixture.runtime.jobs.create).not.toHaveBeenCalled();
    expect(fixture.runtime.jobs.update).not.toHaveBeenCalled();
    expect(fixture.runtime.events.subscriptions.create).not.toHaveBeenCalled();
  });

  it("fails closed on an unexpected subscription rather than deleting or replacing it", async () => {
    const fixture = runtimeFixture({
      jobs: [{
        id: "job-1",
        name: "moonsleep-commerce.shopify-customer-identity",
        description: "Observe Shopify customer contacts and verify canonical MoonSleep customer entities",
        script_path: new URL("../jobs/shopify-customer-identity.ts", import.meta.url).pathname,
        status: "active",
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
