import assert from "node:assert/strict";
import { test } from "vitest";
import { disablePartnerDeskRuntimeWork, ensurePartnerDeskRuntimeWork } from "./runtime-work.ts";

test("installs one inactive provider-neutral job and disabled Alibaba and Gmail subscriptions", async () => {
  const jobs: Array<Record<string, unknown>> = [];
  const subscriptions: Array<Record<string, unknown>> = [];
  const runtime = {
    jobs: {
      list: pagedJobs(jobs),
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
        const subscription = { id: `sub-${subscriptions.length + 1}`, ...params, match_json: JSON.stringify(params.match), enabled: 0 };
        subscriptions.push(subscription);
        return { payload: { subscription } };
      },
      update: async () => { throw new Error("unexpected update"); },
    } },
  };
  assert.deepEqual(
    await ensurePartnerDeskRuntimeWork({ runtime: runtime as never, appId: "moonsleep-partner-desk" }),
    { jobDefinitionId: "job-1", subscriptionIds: ["sub-1", "sub-2"] },
  );
  assert.equal(jobs[0]?.status, "inactive");
  assert.deepEqual(subscriptions[0]?.match, { platform: "alibaba" });
  assert.deepEqual(subscriptions[1]?.match, { platform: "gmail" });
  assert.ok(subscriptions.every((subscription) => subscription.enabled === 0));
});

// jobs.list as the runtime answers it: newest first, 100 rows unless asked, at most 1,000, and internal
// definitions dropped after the limit (so a page can come back short before the end).
function pagedJobs(jobs: Array<Record<string, unknown>>) {
  return async (params: { limit?: number; offset?: number } = {}) => {
    const limit = Math.min(params.limit ?? 100, 1_000);
    const offset = params.offset ?? 0;
    const page = [...jobs].reverse().slice(offset, offset + limit).filter((job) => job.internal !== true);
    return { payload: { jobs: page } };
  };
}

test("finds its job past the runtime's first page instead of creating a second one", async () => {
  const jobs: Array<Record<string, unknown>> = [{
    id: "job-partner",
    name: "moonsleep-partner-desk.reviewed-open-loop-projection",
    description: "Project reviewed partner communication evidence into Partner Desk open loops",
    script_path: "/stale/path.ts",
    status: "inactive",
  }];
  // 1,149 newer definitions sit ahead of it; every tenth is internal and dropped after the limit.
  for (let index = 0; index < 1_149; index += 1) {
    jobs.push({ id: `foreign-${index}`, name: `moonsleep-site.timer.unit-${index}`, status: "active", internal: index % 10 === 0 });
  }
  const subscriptions: Array<Record<string, unknown>> = [
    { id: "sub-1", job_definition_id: "job-partner", match_json: JSON.stringify({ platform: "alibaba" }), enabled: 0 },
    { id: "sub-2", job_definition_id: "job-partner", match_json: JSON.stringify({ platform: "gmail" }), enabled: 0 },
  ];
  const updates: Array<Record<string, unknown>> = [];
  const runtime = {
    jobs: {
      list: pagedJobs(jobs),
      create: async () => { throw new Error("must not create a job that exists"); },
      update: async (params: Record<string, unknown>) => {
        updates.push(params);
        const job = jobs.find((entry) => entry.id === params.id)!;
        Object.assign(job, params);
        return { payload: { job } };
      },
    },
    events: { subscriptions: {
      list: async () => ({ payload: { subscriptions } }),
      create: async () => { throw new Error("must not create a subscription that exists"); },
      update: async () => { throw new Error("unexpected update"); },
    } },
  };
  assert.deepEqual(
    await ensurePartnerDeskRuntimeWork({ runtime: runtime as never, appId: "moonsleep-partner-desk" }),
    { jobDefinitionId: "job-partner", subscriptionIds: ["sub-1", "sub-2"] },
  );
  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.id, "job-partner");
  assert.equal(jobs.filter((job) => job.name === "moonsleep-partner-desk.reviewed-open-loop-projection").length, 1);

  // Deactivation finds it the same way.
  jobs[0]!.status = "active";
  await disablePartnerDeskRuntimeWork(runtime as never);
  assert.equal(jobs[0]?.status, "inactive");
});

test("fails closed when jobs.list does not answer a list", async () => {
  const runtime = {
    jobs: { list: async () => ({ payload: { jobs: "not a list" } }) },
    events: { subscriptions: { list: async () => ({ payload: { subscriptions: [] } }) } },
  };
  await assert.rejects(
    ensurePartnerDeskRuntimeWork({ runtime: runtime as never, appId: "moonsleep-partner-desk" }),
    /did not return a jobs list/,
  );
});
