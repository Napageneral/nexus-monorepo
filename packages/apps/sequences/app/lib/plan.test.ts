import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileDefinition, compileSeries } from "./compile.js";
import { initialState, materialize } from "./plan.js";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../test/fixtures/october");
const load = (name: string) => JSON.parse(fs.readFileSync(path.join(DIR, name), "utf8"));

function october() {
  const def = compileDefinition(load("review-group-giveaway.json"));
  const series = compileSeries(def.normalized, 1, load("review-giveaway-2026-10.json"));
  return { def, series, ...materialize(def.normalized, { revision: 1, sha256: def.sha256 }, series.normalized, series.sha256) };
}

describe("materialize the October series", () => {
  const { plan, plan_sha256 } = october();
  const step = (ref: string) => plan.steps.find((entry) => entry.ref === `review-giveaway-2026-10/${ref}`)!;

  it("plans every step of every group, with a stable plan_sha256", () => {
    expect(plan.steps).toHaveLength(5 * 15);
    expect(october().plan_sha256).toBe(plan_sha256);
    expect(plan.prize_scope).toBe("review-giveaway-2026-10");
    expect(new Set(plan.steps.map((entry) => entry.id)).size).toBe(plan.steps.length);
  });

  it("matches the design's materialized g5 table", () => {
    expect(step("g5.night_ask").window_from).toBe("2026-10-27T00:17:00.000Z");
    expect(step("g5.draw_1").due_at).toBe("2026-10-27T13:00:00.000Z");
    expect(step("g5.draw_2").expected.closes_at).toBe("2026-10-30T04:59:59.000Z");
    expect(step("g5.draw_2").due_at).toBe("2026-10-30T13:00:00.000Z");
    expect(step("g5.followup").window_from).toBe("2026-10-28T00:17:00.000Z");
    expect(step("g5.followup").not_before).toBeNull(); // per person: night_ask.first_post + 24h
    expect(step("g5.code_go").expected.ask_by).toBe("2026-11-02T15:00:00.000Z");
    expect(step("g5.half_off_note").due_at).toBe("2026-11-02T16:00:00.000Z");
  });

  it("gives each step its owner and mode: observed, shadowed or engine", () => {
    expect([step("g1.night_ask").owner, step("g1.night_ask").mode]).toEqual(["review_sender", "observe"]);
    expect([step("g1.draw_2").owner, step("g1.draw_2").mode]).toEqual(["mac", "observe"]);
    expect([step("g3.draw_2").owner, step("g3.draw_2").mode]).toEqual(["mac", "shadow"]);
    expect([step("g4.claims_1").owner, step("g4.claims_1").mode]).toEqual(["engine", "live"]);
    expect(step("g5.followup").expected.live).toBe(true);
  });

  it("plans the engine's own Runs: observe reads and the three shadow Runs", () => {
    expect(step("g5.night_ask").work.map((item) => [item.phase, item.due_at])).toEqual([
      ["o1", "2026-10-27T01:17:00.000Z"],
      ["o2", "2026-10-27T04:15:00.000Z"],
    ]);
    expect(step("g5.night_ask").expected).toMatchObject({ ledger: "night", count: 2690, lo: 2555.5, hi: 2824.5 });
    expect(step("g5.followup").work.map((item) => item.phase)).toEqual(["o1", "o2"]);
    expect(step("g3.draw_2").work).toEqual([
      { phase: "s0", job: "sequences.draw", due_at: "2026-10-28T05:04:59.000Z", purpose: "entries read at close + 5 m" },
      { phase: "s1", job: "sequences.draw", due_at: "2026-10-28T13:00:30.000Z", purpose: "entries read at draw time + 30 s" },
      { phase: "c", job: "sequences.draw", due_at: null, wait_for: "import", deadline_at: "2026-10-28T14:30:00.000Z", purpose: "read again on the Mac's import, then compare" },
    ]);
    expect(step("g1.draw_2").work).toEqual([]);
    expect(step("g4.claims_1").work).toEqual([]);
  });

  it("knows what evidence each Mac step owes and when", () => {
    expect(step("g2.winner_note_2").expected).toMatchObject({
      note: "winner",
      drawing_no: 2,
      campaign_name: "Review group winners · 2026-10-23 · drawing 2",
      sent_by: "2026-10-27T14:00:00.000Z",
      received_by: "2026-10-27T15:30:00.000Z",
    });
    expect(step("g2.still_entered_1").expected).toMatchObject({ note: "still_entered", campaign_name: "Review group still entered · 2026-10-23 · drawing 1" });
    expect(step("g4.draw_1").expected).toMatchObject({ evidence: "import", drawing_no: 1, import_by: "2026-10-26T14:30:00.000Z" });
    expect(step("g5.winner_note_1").copy_valid_until).toBe("2026-10-27T16:59:59.000Z");
  });

  it("starts steps observing, waiting for P2, or skipped when they fell due before the engine", () => {
    const named = new Set(["claims_1", "claims_2", "code_go", "codes", "half_off_note"]);
    const now = new Date("2026-10-27T18:00:00Z");
    expect(initialState(step("g1.draw_1"), now, named)).toEqual({ state: "observing", because: "the Mac runs it" });
    expect(initialState(step("g1.claims_1"), now, named)).toEqual({ state: "waiting", because: "P2 not released" });
    expect(initialState(step("g5.preflight"), now, named)).toEqual({ state: "skipped", because: "due before the engine took the series" });
  });
});
