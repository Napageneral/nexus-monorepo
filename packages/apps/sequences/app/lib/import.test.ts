import { afterAll, describe, expect, it } from "vitest";
import { G1, G2, hash, labels, ledgerOf, syntheticBundle, syntheticDrawing } from "../test/synthetic.js";
import { HAS_DATABASE, adminQuery, cleanup, fixture } from "../test/pg-store.js";
import { importBundle } from "./import.js";
import { ledgerAt, loadStepByRef } from "./repo.js";

const now = new Date("2026-10-27T18:00:00Z");
const actor = "claude@tyler-mac#t1";

describe.runIf(HAS_DATABASE)("sequences.series.import on a real store", () => {
  afterAll(cleanup);

  it("previews V1-V10 for every drawing, then applies with the token and adopts the evidence", async () => {
    const { store, schema } = await fixture();
    const bundle = syntheticBundle();
    const preview = await importBundle(store, bundle, { mode: "preview", actor, now });
    expect(preview.problems).toEqual([]);
    expect(preview.ok).toBe(true);
    expect(preview.token).toMatch(/^pt_[0-9a-f]{32}$/);
    const validation = preview.data.validation as { pass: boolean; drawings: Array<{ checks: Array<{ id: string; status: string }> }> };
    expect(validation.pass).toBe(true);
    expect(validation.drawings[0]!.checks.map((check) => check.id)).toEqual(["V1", "V2", "V3", "V4", "V5", "V6", "V8.team", "V9", "V10", "V8.ledger"]);
    expect((await adminQuery(`SELECT count(*)::int AS n FROM ${schema}.series`)).rows[0].n).toBe(0);

    const applied = await importBundle(store, bundle, { mode: "apply", preview_token: preview.token!, actor, now });
    expect(applied.problems).toEqual([]);
    expect(applied.ok).toBe(true);
    expect(applied.data).toMatchObject({ mode: "apply", new_series: true, counts: { drawings: 2, ledger: 20, send_decisions: 10 + 77, campaigns: 4 } });
    const series = (await adminQuery(`SELECT state, definition_revision FROM ${schema}.series`)).rows[0];
    expect(series).toEqual({ state: "observing", definition_revision: 1 });
    expect((await adminQuery(`SELECT count(*)::int AS n FROM ${schema}.step_instances`)).rows[0].n).toBe(75);
    expect((await adminQuery(`SELECT count(*)::int AS n FROM ${schema}.winners`)).rows[0].n).toBe(20);
    expect((await adminQuery(`SELECT count(*)::int AS n FROM ${schema}.definitions`)).rows[0].n).toBe(2);

    const draw = await loadStepByRef(store, "review-giveaway-2026-10/g1.draw_1");
    expect([draw!.state, draw!.mode, draw!.result.summary]).toEqual(["adopted", "adopted", "87 -> 10 + 10"]);
    const note = await loadStepByRef(store, "review-giveaway-2026-10/g1.winner_note_1");
    expect([note!.state, note!.result.verdict, note!.result.received, note!.result.planned]).toEqual(["adopted", "ok", 10, 10]);
    const stillEntered = await loadStepByRef(store, "review-giveaway-2026-10/g1.still_entered_1");
    expect([stillEntered!.result.verdict, stillEntered!.result.received, stillEntered!.result.planned]).toEqual(["ok", 77, 77]);
    const claims = await loadStepByRef(store, "review-giveaway-2026-10/g1.claims_1");
    expect([claims!.state, claims!.waiting_because]).toEqual(["waiting", "P2 not released"]);
    const preflight = await loadStepByRef(store, "review-giveaway-2026-10/g5.preflight");
    expect(preflight!.state).toBe("skipped");
    const ask = await loadStepByRef(store, "review-giveaway-2026-10/g1.night_ask");
    expect([ask!.state, (ask!.result.mac_send as Record<string, unknown>).sent]).toEqual(["observing", 2629]);
    const kinds = (await adminQuery(`SELECT DISTINCT delivery_receipt_kind, status FROM ${schema}.send_decisions`)).rows;
    expect(kinds).toEqual([{ delivery_receipt_kind: "campaign_only", status: "adopted" }]);
    expect(JSON.stringify((await adminQuery(`SELECT * FROM ${schema}.step_events`)).rows)).not.toContain("@tyler-mac.");

    // Idempotent by bundle sha: the same apply returns the first result and writes nothing.
    const again = await importBundle(store, bundle, { mode: "apply", preview_token: preview.token!, actor, now });
    expect(again.data.replayed).toBe(true);
    expect((await adminQuery(`SELECT count(*)::int AS n FROM ${schema}.import_bundles`)).rows[0].n).toBe(1);
  });

  it("takes a later morning's drawing push and a promotion re-push", async () => {
    const { store, schema } = await fixture();
    const first = syntheticBundle();
    await importBundle(store, first, { mode: "apply", preview_token: (await importBundle(store, first, { mode: "preview", actor, now })).token!, actor, now });

    const g1 = G1();
    const g2 = G2();
    const g3 = syntheticDrawing({ night: "2026-10-24", drawing_no: 1, labels: labels("g3", 40), seed: "g3", committedAt: "2026-10-25T13:00:09Z" });
    const push = syntheticBundle({ scope: "drawing", drawings: [g3], notes: [] });
    push.ledger = ledgerOf([g1, g2, g3]);
    const pushPreview = await importBundle(store, push, { mode: "preview", actor, now });
    expect(pushPreview.problems).toEqual([]);
    await importBundle(store, push, { mode: "apply", preview_token: pushPreview.token!, actor, now });
    expect((await loadStepByRef(store, "review-giveaway-2026-10/g3.draw_1"))!.state).toBe("adopted");

    // Thu: a G1 winner did not claim; the Mac promotes the first alternate and re-pushes.
    const promoted = G1();
    const replaced = promoted.receipt.winners[2]!;
    const alternate = promoted.receipt.alternates[0]!;
    promoted.receipt.promoted = [{ replaces: replaced, entry_id: alternate, why: "unclaimed", at_utc: "2026-10-30T05:10:00Z" }];
    const repush = syntheticBundle({ scope: "drawing", drawings: [promoted], notes: [] });
    repush.ledger = ledgerOf([promoted, g2, g3]);
    const repushPreview = await importBundle(store, repush, { mode: "preview", actor, now });
    expect(repushPreview.problems).toEqual([]);
    expect(repushPreview.data.counts).toMatchObject({ drawings_promoted: 1 });
    await importBundle(store, repush, { mode: "apply", preview_token: repushPreview.token!, actor, now });
    const ledgerAfter = await ledgerAt(store, "review-giveaway-2026-10", "2026-10-31T00:00:00Z");
    expect(ledgerAfter.has(alternate)).toBe(true);
    expect(ledgerAfter.has(replaced)).toBe(false);
    expect((await ledgerAt(store, "review-giveaway-2026-10", "2026-10-29T00:00:00Z")).has(replaced)).toBe(true);
    expect((await adminQuery(`SELECT role FROM ${schema}.winners WHERE entry_id = $1`, [alternate])).rows).toEqual([{ role: "promoted" }]);
  });

  it("refuses a stale token, a tampered receipt, a changed drawing and a drawing push before the series", async () => {
    const { store } = await fixture();
    const bundle = syntheticBundle();
    const preview = await importBundle(store, bundle, { mode: "preview", actor, now });
    const tampered = syntheticBundle();
    tampered.drawings[0]!.receipt.winners = [...tampered.drawings[0]!.receipt.winners].reverse();
    const bad = await importBundle(store, tampered, { mode: "preview", actor, now });
    expect(bad.ok).toBe(false);
    expect(bad.problems.map((entry) => entry.code)).toContain("import.V4");
    expect(bad.token).toBeNull();
    const badApply = await importBundle(store, tampered, { mode: "apply", preview_token: preview.token!, actor, now });
    expect(badApply.ok).toBe(false);

    const early = await importBundle(store, syntheticBundle({ scope: "drawing" }), { mode: "preview", actor, now });
    expect(early.problems.map((entry) => entry.code)).toEqual(["refuse.series_not_registered"]);

    await importBundle(store, bundle, { mode: "apply", preview_token: preview.token!, actor, now });
    const other = syntheticBundle({ notes: [] });
    const stale = await importBundle(store, other, { mode: "apply", preview_token: preview.token!, actor, now });
    expect(stale.problems.map((entry) => entry.code)).toEqual(["refuse.token_stale"]);

    const changed = syntheticBundle({ scope: "drawing", notes: [] });
    changed.drawings[1]!.receipt.method = "something else";
    changed.drawings[1]!.receipt.commit.reviews_entered = 999;
    const refused = await importBundle(store, changed, { mode: "preview", actor, now });
    expect(refused.problems.map((entry) => entry.code)).toContain("refuse.drawing_changed");
  });

  it("refuses a kind field (NX-P17) and anything shaped like an address (HR-21)", async () => {
    const { store } = await fixture();
    const withKind = { ...syntheticBundle(), kind: "full" };
    expect((await importBundle(store, withKind, { mode: "preview", actor, now })).problems[0]!.code).toBe("check.field_kind_forbidden");
    const withAddress = syntheticBundle();
    (withAddress.drawings[0]!.entries[0] as Record<string, unknown>).contact = { first_name: "x" };
    expect((await importBundle(store, withAddress, { mode: "preview", actor, now })).problems[0]!.code).toBe("refuse.address_in_bundle");
    const withAt = syntheticBundle();
    withAt.files[0]!.path_rel = "private/someone@example.test.txt";
    expect((await importBundle(store, withAt, { mode: "preview", actor, now })).problems[0]!.code).toBe("refuse.address_in_bundle");
    expect(hash("x")).toHaveLength(64);
  });
});
