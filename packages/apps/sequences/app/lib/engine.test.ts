// The engine on a real store with a fake runtime: tick acceptance (lookup-first, partial batches,
// serialized draws, old-revision re-issue), the step claim, observe reads, the shadow compare,
// the probe and the alert rules. Needs SEQUENCES_TEST_DATABASE_URL.
import { afterAll, describe, expect, it } from "vitest";
import { fakeFetch, fakeRuntime } from "../test/fake-runtime.js";
import { HAS_DATABASE, adminQuery, cleanup, fixture } from "../test/pg-store.js";
import { G1, G2, labels, ledgerOf, syntheticBundle, syntheticDrawing } from "../test/synthetic.js";
import { acceptSeries } from "./accept.js";
import { entryIdOf } from "./draw/rank.js";
import { importBundle } from "./import.js";
import { listSeries, loadRuns, loadStepByRef, runtimeJobs } from "./repo.js";
import { runShadowDraw } from "./run-draw.js";
import { runObserve, runProbe } from "./run-step.js";
import { runTick } from "./tick.js";
import { hash } from "../test/synthetic.js";
import type { AppStore, JobContext } from "./types.js";

const SERIES = "review-giveaway-2026-10";
const actor = "claude@tyler-mac#t1";

async function seeded(now = new Date("2026-10-27T18:00:00Z"), drawings = [G1(), G2()]) {
  const fx = await fixture();
  const bundle = syntheticBundle({ drawings });
  const preview = await importBundle(fx.store, bundle, { mode: "preview", actor, now });
  expect(preview.problems).toEqual([]);
  await importBundle(fx.store, bundle, { mode: "apply", preview_token: preview.token!, actor, now });
  const runtime = fakeRuntime();
  for (const job of runtime.jobs) {
    await fx.store.query("INSERT INTO runtime_jobs (name, job_id, revision_id, status, updated_at) VALUES ($1, $2, $3, $4, $5)", [job.name, job.id, job.default_revision_id, job.status, "2026-10-26T00:00:00Z"]);
  }
  return { ...fx, runtime };
}

function jobCtx(store: AppStore, nex: unknown, input: Record<string, unknown>, now: Date, trigger = "sequences", runId = "jobrun_x"): JobContext {
  return {
    job: { id: "jobdef_2", name: "sequences.step", description: null, config: {} },
    app: { id: "sequences", version: "0.1.0", dataDir: "/nonexistent", packageDir: "/nonexistent", store },
    run: { id: runId, trigger_source: trigger, created_at: now.toISOString() },
    input,
    nex,
    abortSignal: new AbortController().signal,
    log: { info() {}, warn() {}, error() {} },
    now,
  };
}

const invitationsAnswer = (total: number, notCancelled: number) => ({
  status: 200,
  body: { contract: "sequences_sources_v1", as_of: "2026-10-27T18:00:05Z", sha256: hash(`inv-${total}`), count: 2, rows: { night: { total, not_cancelled: notCancelled }, followup: { total: 900, not_cancelled: 880 } } },
});

describe.runIf(HAS_DATABASE)("tick acceptance", () => {
  afterAll(cleanup);

  it("admits due observe reads through one partial invokeMany and draws through jobs.invoke with a serialization key", async () => {
    const { store, runtime } = await seeded();
    const now = new Date("2026-10-27T18:00:00Z");
    const [series] = await listSeries(store, ["observing"]);
    const report = await acceptSeries(store, runtime.nexFor("tick_run_1"), await runtimeJobs(store), series!, now, new Set(["2026-10-21#1", "2026-10-23#1"]));
    expect(report.errors).toEqual([]);
    const batches = runtime.calls.filter((call) => call.method === "jobs.invokeMany");
    expect(batches).toHaveLength(1);
    const items = batches[0]!.params.items as Array<Record<string, unknown>>;
    expect(batches[0]!.params.atomicity).toBe("partial");
    expect(items.every((item) => item.trigger_source === "sequences" && item.max_attempts === 5 && item.serialization_key === undefined)).toBe(true);
    expect(items.every((item) => Object.keys(item.input as object).sort().join(",") === "run_key,step_instance_id")).toBe(true);
    // Past night asks get only their superseding o2 read; future reads go in as delayed Runs at their due time.
    const keys = items.map((item) => String(item.idempotency_key));
    expect(keys).toContain(`seq:${SERIES}:g1:night_ask:o2:a1`);
    expect(keys).not.toContain(`seq:${SERIES}:g1:night_ask:o1:a1`);
    expect(items.find((item) => item.idempotency_key === `seq:${SERIES}:g5:followup:o1:a1`)!.available_at).toBe("2026-10-28T04:15:00.000Z");
    const draws = runtime.calls.filter((call) => call.method === "jobs.invoke");
    expect(draws.map((call) => call.params.idempotency_key)).toEqual([`seq:${SERIES}:g3:draw_2:s0:a1`]);
    expect(draws[0]!.params).toMatchObject({ serialization_key: `seq-draw:${SERIES}`, trigger_source: "sequences", max_attempts: 5, available_at: "2026-10-28T05:04:59.000Z" });
    const runs = await loadRuns(store, [(await loadStepByRef(store, `${SERIES}/g1.night_ask`))!.id]);
    expect(runs.map((run) => [run.phase, run.state, Boolean(run.nex_run_id)])).toEqual([["o2", "accepted", true]]);
    // The next tick admits nothing new.
    const again = await acceptSeries(store, runtime.nexFor("tick_run_2"), await runtimeJobs(store), series!, now, new Set());
    expect(again.accepted).toEqual([]);
  });

  it("looks a rejected item up by key and adopts the Run it already has", async () => {
    const { store, runtime } = await seeded();
    const now = new Date("2026-10-27T18:00:00Z");
    const [series] = await listSeries(store, ["observing"]);
    // Another tick Run admitted g2's read earlier but crashed before recording it.
    const key = `seq:${SERIES}:g2:night_ask:o2:a1`;
    const g2 = (await loadStepByRef(store, `${SERIES}/g2.night_ask`))!;
    await runtime.nexFor("tick_run_0").jobs.invokeMany({ items: [{ job_id: "jobdef_2", input: { step_instance_id: g2.id, run_key: key }, trigger_source: "sequences", available_at: g2.work[1]!.due_at, max_attempts: 5, idempotency_key: key }], atomicity: "partial", batch_idempotency_key: "b0" });
    const early = runtime.runs[0]!.id;
    const report = await acceptSeries(store, runtime.nexFor("tick_run_1"), await runtimeJobs(store), series!, now, new Set());
    expect(report.adopted).toContain(key);
    const lookups = runtime.calls.filter((call) => call.method === "jobs.runs.list" && call.params.idempotency_key === key);
    expect(lookups).toHaveLength(1);
    expect((await loadRuns(store, [g2.id]))[0]).toMatchObject({ state: "accepted", nex_run_id: early });
  });

  it("after a crash between invoke and record (row accepting), looks the key up first and never re-sends it", async () => {
    const { store, runtime } = await seeded();
    const now = new Date("2026-10-27T18:00:00Z");
    const [series] = await listSeries(store, ["observing"]);
    await acceptSeries(store, runtime.nexFor("tick_run_1"), await runtimeJobs(store), series!, now, new Set());
    const key = `seq:${SERIES}:g3:night_ask:o2:a1`;
    await store.query("UPDATE step_runs SET state = 'accepting', nex_run_id = NULL WHERE run_key = $1", [key]);
    runtime.calls.length = 0;
    const report = await acceptSeries(store, runtime.nexFor("tick_run_2"), await runtimeJobs(store), series!, now, new Set());
    expect(report.adopted).toEqual([key]);
    expect(runtime.calls.filter((call) => call.method === "jobs.invokeMany")).toEqual([]);
    expect((await adminQuery("SELECT 1")).rowCount).toBe(1);
  });

  it("cancels a never-started Run admitted under an older job revision and re-issues it as a2", async () => {
    const { store, runtime, schema } = await seeded();
    const now = new Date("2026-10-27T18:00:00Z");
    const [series] = await listSeries(store, ["observing"]);
    await acceptSeries(store, runtime.nexFor("tick_run_1"), await runtimeJobs(store), series!, now, new Set());
    const delayed = runtime.runs.find((run) => run.idempotency_key === `seq:${SERIES}:g5:followup:o1:a1`)!;
    // An upgrade publishes a new revision of sequences.step; the hooks record it.
    const revision = runtime.bumpRevision("sequences.step");
    await store.query("UPDATE runtime_jobs SET revision_id = $1, updated_at = $2 WHERE name = 'sequences.step'", [revision, "2026-10-27T18:30:00Z"]);
    await store.query("UPDATE step_runs SET accepted_at = '2026-10-27T18:00:00Z'");
    const later = new Date("2026-10-27T18:31:00Z");
    const cancel = await acceptSeries(store, runtime.nexFor("tick_run_2"), await runtimeJobs(store), series!, later, new Set());
    expect(cancel.cancelled).toContain(`seq:${SERIES}:g5:followup:o1:a1`);
    expect(delayed.status).toBe("cancelled");
    expect(cancel.accepted).toContain(`seq:${SERIES}:g5:followup:o1:a2`);
    const reissued = runtime.runs.find((run) => run.idempotency_key === `seq:${SERIES}:g5:followup:o1:a2`)!;
    expect(reissued.job_revision_id).toBe(revision);
    expect(reissued.available_at).toBe(delayed.available_at);
    expect((await adminQuery(`SELECT state FROM ${schema}.step_runs WHERE run_key = $1`, [`seq:${SERIES}:g5:followup:o1:a1`])).rows[0].state).toBe("cancelled");
  });
});

describe.runIf(HAS_DATABASE)("step, observe and shadow Runs", () => {
  afterAll(cleanup);

  it("refuses requeue and manual triggers, claims by compare-and-set, and a second Run is a no-op plus A2", async () => {
    const { store, runtime } = await seeded();
    const now = new Date("2026-10-27T18:00:00Z");
    const [series] = await listSeries(store, ["observing"]);
    await acceptSeries(store, runtime.nexFor("tick_run_1"), await runtimeJobs(store), series!, now, new Set());
    const key = `seq:${SERIES}:g4:night_ask:o2:a1`;
    const run = runtime.runs.find((entry) => entry.idempotency_key === key)!;
    const { default: step } = await import("../jobs/step.js");
    for (const trigger of ["requeue", "manual", "schedule"]) {
      expect(await step(jobCtx(store, runtime.nexFor(run.id), run.input, now, trigger, run.id))).toMatchObject({ refused: "refuse.trigger_source" });
    }
    const { fetch } = fakeFetch({ invitations: () => invitationsAnswer(2701, 2650) });
    const done = await runObserve(jobCtx(store, runtime.nexFor(run.id), run.input, now, "sequences", run.id), { fetch, sleep: async () => {} });
    expect(done).toMatchObject({ verdict: "ok", phase: "o2" });
    const observed = (await loadStepByRef(store, `${SERIES}/g4.night_ask`))!;
    expect([observed.state, observed.result.verdict, observed.result.summary]).toEqual(["adopted", "ok", "2,650 of 2,690 posted"]);
    const duplicate = await runObserve(jobCtx(store, runtime.nexFor("jobrun_dupe"), run.input, now, "sequences", "jobrun_dupe"), { fetch, sleep: async () => {} });
    expect(duplicate).toMatchObject({ noop: "already finished" });
    // A Run that holds no claim while another Run has it in flight is refused and alerted.
    await store.query("UPDATE step_runs SET state = 'claimed', nex_run_id = 'jobrun_other' WHERE run_key = $1", [`seq:${SERIES}:g1:night_ask:o2:a1`]);
    const g1run = runtime.runs.find((entry) => entry.idempotency_key === `seq:${SERIES}:g1:night_ask:o2:a1`)!;
    const refused = await runObserve(jobCtx(store, runtime.nexFor(g1run.id), g1run.input, now, "sequences", g1run.id), { fetch, sleep: async () => {} });
    expect(refused).toMatchObject({ noop: expect.stringContaining("claim refused") });
    const alerts = (await store.query("SELECT rule, detail->>'code' AS code FROM alerts")).rows;
    expect(alerts).toContainEqual({ rule: "A2", code: "A2.claim_refused" });
  });

  it("judges a short night as short and an unreadable source as unknown, never success", async () => {
    const { store, runtime } = await seeded();
    const now = new Date("2026-10-27T18:00:00Z");
    const [series] = await listSeries(store, ["observing"]);
    await acceptSeries(store, runtime.nexFor("tick_run_1"), await runtimeJobs(store), series!, now, new Set());
    const g2run = runtime.runs.find((entry) => entry.idempotency_key === `seq:${SERIES}:g2:night_ask:o2:a1`)!;
    const short = fakeFetch({ invitations: () => invitationsAnswer(2400, 2380) });
    await runObserve(jobCtx(store, runtime.nexFor(g2run.id), g2run.input, now, "sequences", g2run.id), { fetch: short.fetch, sleep: async () => {} });
    expect((await loadStepByRef(store, `${SERIES}/g2.night_ask`))!.state).toBe("short");
    const g3run = runtime.runs.find((entry) => entry.idempotency_key === `seq:${SERIES}:g3:night_ask:o2:a1`)!;
    const broken = fakeFetch({ invitations: () => ({ status: 200, body: { contract: "other", rows: [] } }) });
    await runObserve(jobCtx(store, runtime.nexFor(g3run.id), g3run.input, now, "sequences", g3run.id), { fetch: broken.fetch, sleep: async () => {} });
    const g3 = (await loadStepByRef(store, `${SERIES}/g3.night_ask`))!;
    expect([g3.state, g3.result.verdict]).toEqual(["observing", "unknown"]);
    const g5run = runtime.runs.find((entry) => entry.idempotency_key === `seq:${SERIES}:g5:night_ask:o2:a1`)!;
    const down = fakeFetch({ invitations: () => ({ status: 502 }) });
    await expect(runObserve(jobCtx(store, runtime.nexFor(g5run.id), g5run.input, now, "sequences", g5run.id), { fetch: down.fetch, sleep: async () => {} })).rejects.toThrow(/transient_dependency_failure/);
    expect(down.seen).toHaveLength(4); // three retries with backoff
  });

  it("shadows a Mac drawing 2: S0, S1, then the compare on import matches exactly", async () => {
    const g3d1 = syntheticDrawing({ night: "2026-10-24", drawing_no: 1, labels: labels("g3", 40), seed: "g3d1", committedAt: "2026-10-25T13:00:09Z" });
    const { store, runtime } = await seeded(new Date("2026-10-27T18:00:00Z"), [G1(), G2(), g3d1]);
    const people = labels("g3", 40).slice(10).concat(labels("g3late", 15)); // drawing-1 winners are left out by the ledger
    const all = [...labels("g3", 40), ...labels("g3late", 15)];
    const answer = (asOf: string) => ({
      status: 200,
      body: {
        contract: "sequences_sources_v1",
        as_of: asOf,
        sha256: hash(`entries-${asOf}`),
        count: all.length,
        rows: { group_size: 2600, invitation_statuses: { sent: 2500, submitted: 100 }, group_email_at_utc: "2026-10-24T00:30:00+00:00", reviews_entered: all.length, review_entrants: all.map((label) => ({ address_sha256: hash(label), entry_id: entryIdOf(hash(label)), review_ids: [] })) },
      },
    });
    let asOf = "2026-10-28T05:05:01Z";
    const { fetch } = fakeFetch({ entries: () => answer(asOf), "drand:round": () => ({ status: 503 }) });
    const deps = { fetch, sleep: async () => {} };
    const step = (await loadStepByRef(store, `${SERIES}/g3.draw_2`))!;
    const at = (phase: string) => `seq:${SERIES}:g3:draw_2:${phase}:a1`;
    for (const [phase, time] of [["s0", "2026-10-28T05:05:00Z"], ["s1", "2026-10-28T13:00:30Z"]] as const) {
      await store.query("INSERT INTO step_runs (run_key, step_instance_id, phase, attempt_no, job_name, state) VALUES ($1, $2, $3, 1, 'sequences.draw', 'accepted')", [at(phase), step.id, phase]);
      asOf = time;
      await runShadowDraw(jobCtx(store, runtime.nexFor(`jobrun_${phase}`), { step_instance_id: step.id, run_key: at(phase) }, new Date(time), "sequences", `jobrun_${phase}`), deps);
    }
    // 08:00 the Mac draws drawing 2 from the same entrants (minus the drawing-1 winners) and pushes it.
    const winnersD1 = new Set(g3d1.receipt.winners);
    const macLabels = all.filter((label) => !winnersD1.has(entryIdOf(hash(label))));
    const d2 = syntheticDrawing({ night: "2026-10-24", drawing_no: 2, labels: macLabels, seed: "g3d2", committedAt: "2026-10-28T13:00:12Z" });
    d2.receipt.commit.reviews_entered = all.length;
    d2.receipt.commit.left_out_earlier_winners_or_team = winnersD1.size;
    const push = syntheticBundle({ scope: "drawing", drawings: [d2], notes: [] });
    push.ledger = ledgerOf([G1(), G2(), g3d1, d2]);
    const now = new Date("2026-10-28T13:05:00Z");
    const preview = await importBundle(store, push, { mode: "preview", actor, now });
    expect(preview.problems).toEqual([]);
    await importBundle(store, push, { mode: "apply", preview_token: preview.token!, actor, now });
    await store.query("INSERT INTO step_runs (run_key, step_instance_id, phase, attempt_no, job_name, state) VALUES ($1, $2, 'c', 1, 'sequences.draw', 'accepted')", [at("c"), step.id]);
    asOf = "2026-10-28T13:05:02Z";
    const compared = await runShadowDraw(jobCtx(store, runtime.nexFor("jobrun_c"), { step_instance_id: step.id, run_key: at("c") }, now, "sequences", "jobrun_c"), deps);
    expect(compared).toMatchObject({ phase: "c", pass: true });
    const after = (await loadStepByRef(store, `${SERIES}/g3.draw_2`))!;
    expect(after.result.shadow).toMatchObject({ pass: true, mismatched: [], beacon_check: "unknown", read: { phase: "s1" } });
    const shadowRow = (await store.query("SELECT entries, beacon_check, compare->>'pass' AS pass FROM drawings WHERE mode = 'shadow'")).rows[0];
    expect(shadowRow).toEqual({ entries: macLabels.length, beacon_check: "unknown", pass: "true" });
    expect(people.length).toBeGreaterThan(0);
  });

  it("probes ops and drand reach every 30 minutes and records it in health", async () => {
    const { store, runtime } = await seeded();
    const { fetch, seen } = fakeFetch({ health: () => ({ status: 200, body: { contract: "sequences_sources_v1", as_of: "2026-10-27T18:00:00Z", sha256: hash("h"), count: 0, rows: [] } }), "drand:info": () => ({ status: 200, body: { period: 3 } }) });
    const result = await runProbe(jobCtx(store, runtime.nexFor("jobrun_probe"), { probe: "202610271800" }, new Date("2026-10-27T18:00:00Z")), { fetch, sleep: async () => {} });
    expect(result).toMatchObject({ ops: { ok: true }, drand: { ok: true } });
    expect(seen).toEqual(["/api/sequences/sources/health", "/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971/info"]);
    const health = (await store.query("SELECT last_ops_reach_ok, last_drand_reach_ok FROM health")).rows[0];
    expect(health).toEqual({ last_ops_reach_ok: true, last_drand_reach_ok: true });
    expect(runtime.calls.filter((call) => call.method === "credentials.resolve").map((call) => call.params)).toEqual([
      { service: "sequences", account: "ops-access-client-id" },
      { service: "sequences", account: "ops-access-client-secret" },
    ]);
  });
});

describe.runIf(HAS_DATABASE)("the tick", () => {
  afterAll(cleanup);

  it("refuses anything but its schedule, beats, admits the probe once per slot, and raises A11 for a missing import", async () => {
    const { store, runtime } = await seeded(new Date("2026-10-26T18:00:00Z"));
    const { default: tick } = await import("../jobs/tick.js");
    const now = new Date("2026-10-27T15:00:00Z"); // Tue 10:00 CDT: g2 d2 and g5 d1 were due 08:00, nothing imported
    expect(await tick(jobCtx(store, runtime.nexFor("t0"), {}, now, "manual", "t0"))).toMatchObject({ refused: "refuse.trigger_source" });
    const first = await tick(jobCtx(store, runtime.nexFor("t1"), {}, now, "schedule", "t1"));
    expect(first).toMatchObject({ ticks: 1, system: ["seq:_system:probe:202610271500", "seq:_system:notify:202610271500"] });
    const a11 = (await store.query("SELECT subject_ref FROM alerts WHERE rule = 'A11' ORDER BY subject_ref")).rows.map((row) => row.subject_ref);
    expect(a11).toEqual([`${SERIES}/g1.draw_2`, `${SERIES}/g2.draw_2`, `${SERIES}/g3.draw_1`, `${SERIES}/g4.draw_1`, `${SERIES}/g5.draw_1`]);
    const second = await tick(jobCtx(store, runtime.nexFor("t2"), {}, new Date("2026-10-27T15:01:00Z"), "schedule", "t2"));
    expect(second.system).toEqual([]); // probe slot taken; no new delivery round for 6 h
    const ticks = (await store.query("SELECT ticks FROM health")).rows[0];
    expect(Number(ticks.ticks)).toBe(2);
    // A quarantined sequences Run raises A2; once it is no longer quarantined, the A2 resolves.
    runtime.runs[0]!.status = "quarantined";
    runtime.runs[0]!.created_at = "2026-10-27T15:00:00Z";
    await tick(jobCtx(store, runtime.nexFor("t3"), {}, new Date("2026-10-27T15:02:00Z"), "schedule", "t3"));
    expect((await store.query("SELECT state FROM alerts WHERE rule = 'A2'")).rows).toEqual([{ state: "open" }]);
    runtime.runs[0]!.status = "completed";
    await tick(jobCtx(store, runtime.nexFor("t4"), {}, new Date("2026-10-27T15:03:00Z"), "schedule", "t4"));
    expect((await store.query("SELECT state FROM alerts WHERE rule = 'A2'")).rows).toEqual([{ state: "resolved" }]);
    // A 5-minute gap is recorded as A13.
    const gap = await tick(jobCtx(store, runtime.nexFor("t5"), {}, new Date("2026-10-27T15:09:00Z"), "schedule", "t5"));
    expect(gap.tick_gap_minutes).toBe(6);
  });
});
