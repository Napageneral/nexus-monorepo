import assert from "node:assert/strict";
import { test } from "vitest";
import { ensurePartnerDeskRuntimeWork } from "./runtime-work.ts";

test("installs exactly one inactive Alibaba job and disabled subscription", async () => {
  const jobs: Array<Record<string, unknown>> = [];
  const subscriptions: Array<Record<string, unknown>> = [];
  const runtime = {
    jobs: {
      list: async () => ({ payload: { jobs } }),
      create: async (params: Record<string, unknown>) => {
        const job = { id: "job-1", ...params };
        jobs.push(job);
        return { payload: { job } };
      },
      update: async () => { throw new Error("unexpected update"); },
    },
    events: { subscriptions: {
      list: async () => ({ payload: { subscriptions } }),
      create: async (params: Record<string, unknown>) => {
        const subscription = { id: "sub-1", ...params, match_json: JSON.stringify(params.match), enabled: 0 };
        subscriptions.push(subscription);
        return { payload: { subscription } };
      },
      update: async () => { throw new Error("unexpected update"); },
    } },
  };
  assert.deepEqual(
    await ensurePartnerDeskRuntimeWork({ runtime: runtime as never, appId: "moonsleep-partner-desk" }),
    { jobDefinitionId: "job-1", subscriptionId: "sub-1" },
  );
  assert.equal(jobs[0]?.status, "inactive");
  assert.deepEqual(subscriptions[0]?.match, { platform: "alibaba" });
  assert.equal(subscriptions[0]?.enabled, 0);
});
