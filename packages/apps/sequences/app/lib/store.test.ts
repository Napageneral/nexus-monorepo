import { afterAll, describe, expect, it } from "vitest";
import { HAS_DATABASE, cleanup, fixture } from "../test/pg-store.js";
import { syncAlerts, type DesiredAlert } from "./alerts.js";
import { requireStore } from "./store.js";

const denied = async (run: () => Promise<unknown>) => {
  try {
    await run();
    return "ALLOWED";
  } catch (error) {
    return (error as Error).message.includes("permission denied") ? "denied" : (error as Error).message;
  }
};

describe("requireStore", () => {
  it("fails closed without ctx.app.store", () => {
    expect(() => requireStore(undefined)).toThrow(/not provisioned/);
    expect(() => requireStore({})).toThrow(/not provisioned/);
  });
});

describe.runIf(HAS_DATABASE)("the sequences store under the sequences_app role", () => {
  afterAll(cleanup);

  it("refuses UPDATE and DELETE on the append-only tables and the ledger", async () => {
    const { store } = await fixture();
    await store.query("INSERT INTO definitions (name, revision, definition_sha256, body, yaml_sha256, source_commit, registered_by) VALUES ('x', 1, $1, '{}', $1, 'abc1234', 't')", ["a".repeat(64)]);
    await store.query("INSERT INTO step_events (actor, event) VALUES ('t', 'e')");
    await store.query("INSERT INTO relays (by, refs, note) VALUES ('t', '{}', 'n')");
    await store.query("INSERT INTO winners (prize_scope, recipient_hash, entry_id, night, drawing_no, role, at, source) VALUES ('s', $1, 'e_aaaaaaaaaaaaaaaa', '2026-10-21', 1, 'winner', now(), 't')", ["b".repeat(64)]);
    const results: Record<string, string> = {};
    for (const table of ["step_events", "relays", "winners", "definitions", "import_bundles"]) {
      results[`UPDATE ${table}`] = await denied(() => store.query(`UPDATE ${table} SET ${table === "winners" ? "source" : table === "definitions" ? "registered_by" : table === "import_bundles" ? "applied_by" : table === "relays" ? "note" : "actor"} = 'x'`));
      results[`DELETE ${table}`] = await denied(() => store.query(`DELETE FROM ${table}`));
    }
    results["INSERT health"] = await denied(() => store.query("INSERT INTO health (id) VALUES ('singleton')"));
    results["DELETE health"] = await denied(() => store.query("DELETE FROM health"));
    results["CREATE TABLE"] = await denied(() => store.query("CREATE TABLE x (id int)"));
    expect(Object.values(results).every((value) => value === "denied"), JSON.stringify(results)).toBe(true);
    // ...while the work the app does is allowed.
    await store.query("UPDATE health SET ticks = ticks + 1");
    await store.query("INSERT INTO item_leases (item_ref, holder, until) VALUES ('A1-0001', 't', now())");
    await store.query("DELETE FROM item_leases");
  });

  it("keeps one open alert per (rule, subject) and resolves it when its cause clears", async () => {
    const { store } = await fixture();
    const desired: DesiredAlert[] = [{ rule: "A11", subject_ref: "s/g1.draw_1", immediate: true, fix_by: null, detail: { code: "A11.not_imported", message: "m", ref: "s/g1.draw_1", series_id: "s" } }];
    const now = new Date("2026-10-27T15:00:00Z");
    expect((await syncAlerts(store, desired, ["A11"], now)).opened).toEqual(["A11-0001"]);
    expect((await syncAlerts(store, desired, ["A11"], now)).opened).toEqual([]);
    await expect(store.query("INSERT INTO alerts (id, rule, subject_ref, immediate, state) VALUES ('A11-9999', 'A11', 's/g1.draw_1', true, 'open')")).rejects.toThrow(/alerts_open_dedupe/);
    expect((await syncAlerts(store, [], ["A11"], now)).resolved).toEqual(["A11-0001"]);
    // Once resolved, the same cause may open a new alert.
    expect((await syncAlerts(store, desired, ["A11"], now)).opened).toEqual(["A11-0002"]);
    // A told alert re-opens only when it gets worse (a new code).
    await store.query("UPDATE alerts SET state = 'told' WHERE id = 'A11-0002'");
    expect((await syncAlerts(store, desired, ["A11"], now)).reopened).toEqual([]);
    expect((await syncAlerts(store, [{ ...desired[0]!, detail: { ...desired[0]!.detail, code: "A11.worse" } }], ["A11"], now)).reopened).toEqual(["A11-0002"]);
  });
});
