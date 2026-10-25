import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { fakeNex } from "../hooks/runtime-work.test.js";
import { ensureSequencesWork } from "../hooks/runtime-work.js";
import { OUTPUT_SCHEMA } from "../lib/schemas.js";
import { validateSchema } from "../lib/validate.js";
import { runTick } from "../lib/tick.js";
import { importBundle } from "../lib/import.js";
import { fakeRuntime } from "../test/fake-runtime.js";
import { HAS_DATABASE, cleanup, fixture } from "../test/pg-store.js";
import { octoberFile, syntheticBundle } from "../test/synthetic.js";
import handlers, { setClockForTests } from "./index.js";
import type { Output } from "../lib/output.js";
import type { AppStore } from "../lib/types.js";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERIES = "review-giveaway-2026-10";
const actor = "claude@tyler-mac#t1";
type Handler = (ctx: unknown) => Promise<unknown>;
const call = (name: string, ctx: { store: AppStore; nex?: unknown; params?: Record<string, unknown> }) =>
  (handlers as Record<string, Handler>)[name]!({
    params: ctx.params ?? {},
    user: { userId: "entity_moonsleep_ops", email: "", displayName: "", role: "operator", accountId: "" },
    app: { id: "sequences", version: "0.1.0", dataDir: "/nonexistent", packageDir: APP, config: {}, store: ctx.store },
    nex: ctx.nex ?? fakeRuntime().nexFor("method", false),
    invoke: async () => undefined,
  }) as Promise<Output>;

/** The text and the JSON carry the same facts (ax principle 3). */
function assertContract(out: Output): void {
  expect(validateSchema(OUTPUT_SCHEMA, JSON.parse(JSON.stringify(out)))).toEqual([]);
  const lines = out.text.split("\n");
  expect(lines[0]).toBe(`${out.verdict.text} · exit ${out.exit}`);
  expect(lines[lines.length - 1]).toBe(`relay: ${out.relay.text}`);
  for (const entry of out.problems) expect(out.text).toContain(entry.code);
  for (const entry of out.next) expect(out.text).toContain(entry.cmd);
  for (const fact of out.relay.facts) expect(out.text).toContain(fact.text);
  if (out.apply) expect(out.text).toContain(out.apply.cmd);
  expect(out.text).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+/);
}

describe("the method map", () => {
  it("exports exactly the methods app.nexus.json declares, all sequences.*", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(APP, "app.nexus.json"), "utf8"));
    expect(Object.keys(handlers).sort()).toEqual(Object.keys(manifest.methods).sort());
    expect(Object.keys(handlers)).toHaveLength(16);
    expect(Object.keys(handlers).every((name) => name.startsWith("sequences."))).toBe(true);
    expect(manifest.methods["sequences.runtime.configure"].access).toBe("admin");
  });
});

describe.runIf(HAS_DATABASE)("P1b methods on a real store", () => {
  afterAll(cleanup);
  afterEach(() => setClockForTests(null));

  async function imported(now = new Date("2026-10-27T18:00:00Z")) {
    const fx = await fixture();
    const bundle = syntheticBundle();
    setClockForTests(() => now);
    const preview = await call("sequences.series.import", { store: fx.store, params: { bundle, mode: "preview", by: actor } });
    assertContract(preview);
    expect(preview.exit).toBe(0);
    expect(preview.apply?.token).toMatch(/^pt_/);
    const applied = await call("sequences.series.import", { store: fx.store, params: { bundle, mode: "apply", preview_token: preview.apply!.token, by: actor } });
    assertContract(applied);
    expect(applied.ok).toBe(true);
    return fx;
  }

  it("health reads the tick, counts and delivery rounds, with no address anywhere", async () => {
    const { store } = await imported();
    const before = (await call("sequences.health", { store })) as unknown as Record<string, unknown>;
    expect(before).toMatchObject({ contract_id: "sequences_health_v1", ticks: 0, last_tick_at: null, series: { observing: 1 }, provider_write_authority: false });
    const runtime = fakeRuntime();
    for (const job of runtime.jobs) await store.query("INSERT INTO runtime_jobs (name, job_id, revision_id, status) VALUES ($1, $2, $3, $4)", [job.name, job.id, job.default_revision_id, job.status]);
    const now = new Date("2026-10-27T15:00:00Z");
    setClockForTests(() => new Date("2026-10-27T15:00:30Z"));
    await runTick({ job: { id: "jobdef_1", name: "sequences.tick", description: null, config: {} }, app: { id: "sequences", version: "0.1.0", dataDir: "", packageDir: APP, store }, run: { id: "jobrun_tick", trigger_source: "schedule", created_at: now.toISOString() }, input: {}, nex: runtime.nexFor("jobrun_tick"), abortSignal: new AbortController().signal, log: console, now });
    const { default: notify } = await import("../jobs/notify.js");
    await notify({ job: { id: "jobdef_5", name: "sequences.notify", description: null, config: {} }, app: { id: "sequences", version: "0.1.0", dataDir: "", packageDir: APP, store }, run: { id: "jobrun_notify", trigger_source: "sequences", created_at: now.toISOString() }, input: { notify: "x" }, nex: runtime.nexFor("jobrun_notify"), abortSignal: new AbortController().signal, log: console, now });
    const after = (await call("sequences.health", { store })) as unknown as { ticks: number; tick_age_s: number; alerts_to_deliver: Array<{ id: string; delivery_key: string; text: string }>; open_alerts: number };
    expect(after.ticks).toBe(1);
    expect(after.tick_age_s).toBe(30);
    expect(after.open_alerts).toBeGreaterThan(0);
    expect(after.alerts_to_deliver[0]!.delivery_key).toBe(`${after.alerts_to_deliver[0]!.id}#1`);
    expect(JSON.stringify(after)).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+/);
  });

  it("brief gives the two-clause verdict, the same facts in text and JSON, and exits by its verdict", async () => {
    const { store } = await imported();
    const out = await call("sequences.brief.get", { store, params: { series: SERIES, by: actor } });
    assertContract(out);
    expect(out.verdict.text).toMatch(/^BEHIND: .* · AHEAD: /);
    expect(out.subject.series).toBe(SERIES);
    expect(out.links.page).toBe(`https://ops.moonsleep.co/?page=sequences&s=${SERIES}`);
    expect(out.text).toContain("SINCE");
    expect((out.data.since as unknown[]).length).toBeGreaterThan(0);
    const digest = await call("sequences.brief.get", { store, params: { series: SERIES, digest: "1" } });
    expect([digest.ok, digest.exit, digest.problems[0]!.code]).toEqual([false, 5, "refuse.not_engine_owned"]);
    const missing = await call("sequences.brief.get", { store, params: { series: "review-giveaway-2099-01" } });
    expect(missing.exit).toBe(5);
  });

  it("timeline lays out the grid and one group's rows", async () => {
    const { store } = await imported();
    const grid = await call("sequences.timeline.get", { store, params: { series: SERIES } });
    assertContract(grid);
    expect((grid.data.groups as unknown[]).length).toBe(5);
    expect(grid.text).toContain("GROUP");
    const rows = await call("sequences.timeline.get", { store, params: { series: `${SERIES}/g5`, owner: "mac" } });
    assertContract(rows);
    expect((rows.data.steps as Array<{ ref: string }>).every((step) => step.ref.startsWith(`${SERIES}/g5.`))).toBe(true);
    expect(rows.text).toContain("draw_2");
  });

  it("explain resolves full and unique short refs, alerts, msg: and src:, and refuses what is not P1b", async () => {
    const { store } = await imported();
    const full = await call("sequences.explain", { store, params: { ref: `${SERIES}/g1.draw_1` } });
    assertContract(full);
    expect(full.text).toContain("EVIDENCE");
    const short = await call("sequences.explain", { store, params: { ref: "g1.winner_note_1" } });
    assertContract(short);
    expect(short.subject).toMatchObject({ ref: `${SERIES}/g1.winner_note_1`, resolved_from: "g1.winner_note_1" });
    expect(short.text).toContain("campaign_only");
    const unknown = await call("sequences.explain", { store, params: { ref: "g9.draw_1" } });
    expect([unknown.exit, unknown.problems[0]!.code]).toEqual([5, "check.unknown_ref"]);
    const wildcard = await call("sequences.explain", { store, params: { ref: "g*.draw_1" } });
    expect(wildcard.problems[0]!.code).toBe("refuse.wildcard_required");
    const message = await call("sequences.explain", { store, params: { ref: "msg:winner_note" } });
    assertContract(message);
    expect(message.text).toContain("Review group winners");
    const approval = await call("sequences.explain", { store, params: { ref: "ar_2210" } });
    expect(approval.problems[0]!.code).toBe("refuse.not_engine_owned");
  });

  it("audit by step shows the outcome vector and the overlap with the winners ledger; the person view is P4", async () => {
    const { store } = await imported();
    const out = await call("sequences.audit.query", { store, params: { step: `${SERIES}/g1.still_entered_1`, against: "winners", actions: "1" } });
    assertContract(out);
    expect(out.data).toMatchObject({ planned: 77, received: 77, against: { set: "winners", overlap: 0 } });
    expect(out.text).toContain("77 received of 77 planned");
    const winners = await call("sequences.audit.query", { store, params: { step: `${SERIES}/g1.winner_note_1`, against: "winners" } });
    expect(winners.data).toMatchObject({ planned: 10, against: { overlap: 10 } });
    const person = await call("sequences.audit.query", { store, params: { hash: "h:5e1a907c" } });
    expect(person.problems[0]!.code).toBe("refuse.not_engine_owned");
  });

  it("check.file runs every check on the October files; a bad file exits 2", async () => {
    const { store } = await imported();
    const files = [
      { path: "sequences/review-group-giveaway.yaml", body: octoberFile("review-group-giveaway.json") },
      { path: "sequences/series/review-giveaway-2026-10.yaml", body: octoberFile("review-giveaway-2026-10.json") },
    ];
    const ok = await call("sequences.check.file", { store, params: { files } });
    assertContract(ok);
    expect([ok.exit, ok.data.errors]).toEqual([0, 0]);
    expect(Number(ok.data.pending)).toBeGreaterThan(0);
    expect(ok.text).toContain("(registered)");
    const broken = octoberFile("review-group-giveaway.json");
    broken.steps[0].kind = "assert";
    const bad = await call("sequences.check.file", { store, params: { files: [{ path: "bad.yaml", body: broken }] } });
    assertContract(bad);
    expect(bad.exit).toBe(2);
    expect(bad.problems.map((entry) => entry.code)).toContain("check.field_kind_forbidden");
  });

  it("live check reports the engine; help, events and the page read from the same rows", async () => {
    const { store } = await imported();
    const live = await call("sequences.check.run", { store, nex: fakeRuntime().nexFor("m", false), params: { series: SERIES } });
    assertContract(live);
    expect(live.text).toContain("ENGINE");
    for (const topic of ["", "A11", "draw", "sources", "times", "output brief"]) {
      const help = await call("sequences.help.get", { store, params: { topic } });
      assertContract(help);
      expect(help.exit).toBe(0);
    }
    expect((await call("sequences.help.get", { store, params: { topic: "nonsense" } })).exit).toBe(5);
    const events = await call("sequences.events.list", { store, params: { series: SERIES, limit: "5" } });
    assertContract(events);
    const page1 = events.data.events as Array<{ id: number }>;
    expect(page1).toHaveLength(5);
    const more = await call("sequences.events.list", { store, params: { series: SERIES, after: String(events.data.next_after) } });
    expect((more.data.events as Array<{ id: number }>)[0]!.id).toBeGreaterThan(page1[4]!.id);
    const page = await call("sequences.page.get", { store, params: { s: SERIES } });
    assertContract(page);
    expect(page.data).toMatchObject({ contract: "sequences_page_v1", series: { id: SERIES, state: "observing" } });
    expect((page.data.drawings as unknown[]).length).toBe(2);
    expect((page.data.notes as Array<{ label: string }>)[0]!.label).toBe("on the list, can't confirm it reached them");
  });

  it("take leases an alert (re-sends pause) and told stops its re-sends and moves the brief window", async () => {
    const { store } = await imported();
    await store.query("INSERT INTO alerts (id, rule, subject_ref, immediate, state, detail) VALUES ('A11-0001', 'A11', $1, true, 'open', $2::jsonb)", [`${SERIES}/g3.draw_1`, JSON.stringify({ code: "A11.not_imported", message: "drawing 1 of 2026-10-24 not imported", ref: `${SERIES}/g3.draw_1`, series_id: SERIES })]);
    const take = await call("sequences.items.take", { store, params: { item: "A11-0001", by: actor, note: "pushing the import" } });
    assertContract(take);
    expect((await store.query("SELECT state FROM alerts WHERE id = 'A11-0001'")).rows[0].state).toBe("taken");
    setClockForTests(() => new Date("2026-10-27T18:05:00Z"));
    const told = await call("sequences.items.told", { store, params: { items: ["A11-0001"], by: actor, note: "told Tyler the Mac push is late; pushing now" } });
    assertContract(told);
    expect(told.data.stopped).toEqual(["A11-0001"]);
    expect((await store.query("SELECT state, told_by FROM alerts WHERE id = 'A11-0001'")).rows[0]).toEqual({ state: "told", told_by: actor });
    const brief = await call("sequences.brief.get", { store, params: { series: SERIES, by: actor } });
    expect(brief.text).toContain(`${actor}'s last relay`);
    const noBy = await call("sequences.items.told", { store, params: { items: ["A11-0001"], note: "x" } });
    expect(noBy.exit).toBe(1);
  });

  it("refuses unknown params and anything shaped like an address, as usage (exit 1)", async () => {
    const { store } = await imported();
    const extra = await call("sequences.brief.get", { store, params: { series: SERIES, sql: "select 1" } });
    expect([extra.ok, extra.exit]).toEqual([false, 1]);
    const address = await call("sequences.explain", { store, params: { ref: `${SERIES}/g1.draw_1`, by: "x", note: "someone@example.com" } });
    expect(address.exit).toBe(1);
    expect(address.text).not.toContain("example.com");
  });
});

describe("sequences.runtime.configure through the method", () => {
  it("plans, refuses a stale sha or a wrong literal, then applies and reads back", async () => {
    const fake = fakeNex();
    await ensureSequencesWork(fake.nex, "sequences");
    const store = { schema: "sequences", inTransaction: false, query: async () => ({ rows: [], rowCount: 1, fields: [] }), transaction: async (fn: (q: unknown) => unknown) => fn(store) } as unknown as AppStore;
    const plan = await call("sequences.runtime.configure", { store, nex: fake.nex, params: { mode: "plan", target: "armed" } });
    assertContract(plan);
    const sha = (plan.data as { plan_sha256: string }).plan_sha256;
    const stale = await call("sequences.runtime.configure", { store, nex: fake.nex, params: { mode: "apply", target: "armed", expected_plan_sha256: "0".repeat(64), confirmation: "CONFIGURE_SEQUENCES_RUNTIME" } });
    expect([stale.exit, stale.problems[0]!.code]).toEqual([7, "refuse.token_stale"]);
    const literal = await call("sequences.runtime.configure", { store, nex: fake.nex, params: { mode: "apply", target: "armed", expected_plan_sha256: sha, confirmation: "yes" } });
    expect(literal.problems[0]!.code).toBe("refuse.token_required");
    const applied = await call("sequences.runtime.configure", { store, nex: fake.nex, params: { mode: "apply", target: "armed", expected_plan_sha256: sha, confirmation: "CONFIGURE_SEQUENCES_RUNTIME" } });
    assertContract(applied);
    expect(applied.data).toMatchObject({ state: "applied", readback: { schedule: { enabled: true } } });
    expect(fake.schedules[0]!.enabled).toBe(1);
  });
});

// Keeps the import import used when the store suites are skipped.
void importBundle;
