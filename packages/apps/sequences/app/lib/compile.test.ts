import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileDefinition, compileSeries } from "./compile.js";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../test/fixtures/october");
const load = (name: string) => JSON.parse(fs.readFileSync(path.join(DIR, name), "utf8"));
const codes = (result: { problems: Array<{ code: string; tier: string }> }, tier?: string) =>
  result.problems.filter((entry) => !tier || entry.tier === tier).map((entry) => entry.code);

describe("compileDefinition on the October files", () => {
  it("compiles review-group-giveaway with a stable definition_sha256", () => {
    const first = compileDefinition(load("review-group-giveaway.json"));
    const again = compileDefinition(load("review-group-giveaway.json"));
    expect(first.ok).toBe(true);
    expect(codes(first, "error")).toEqual([]);
    expect(first.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(again.sha256).toBe(first.sha256);
    // Key order in the file never changes the sha (RFC 8785).
    const reordered = Object.fromEntries(Object.entries(load("review-group-giveaway.json")).reverse());
    expect(compileDefinition(reordered).sha256).toBe(first.sha256);
    // P1b: the P2 routes and the rules-page sha are PENDING, never ERROR.
    expect(new Set(codes(first, "pending"))).toEqual(new Set(["check.source_route_missing", "check.rules_terms_missing"]));
  });

  it("expands defaults into the normalized form", () => {
    const { normalized } = compileDefinition(load("review-group-giveaway.json"));
    const winnerNote = normalized.steps.find((step) => step.id === "winner_note_1")!;
    expect(winnerNote.window).toBe("09:00-21:00");
    expect(winnerNote.late).toEqual({ grace: "10m", then: "late_copy", after_that: "hold" });
    expect(normalized.steps.find((step) => step.id === "draw_2")!.after).toEqual(["draw_1", "entries_2"]);
    expect(normalized.steps.find((step) => step.id === "night_ask")!.exclude).toEqual(["giveaway"]);
  });

  it("compiles the prize-claim child, whose messages come from the parent", () => {
    const result = compileDefinition(load("prize-claim.json"));
    expect(result.ok).toBe(true);
    expect(codes(result, "warn")).toContain("check.messages_from_parent");
  });

  it("compiles the series against revision 1: only engine copy is PENDING", () => {
    const def = compileDefinition(load("review-group-giveaway.json"));
    const series = compileSeries(def.normalized, 1, load("review-giveaway-2026-10.json"));
    expect(series.ok).toBe(true);
    expect(series.problems.map((entry) => `${entry.tier} ${entry.code} ${entry.path}`)).toEqual([
      "pending check.copy_not_approved /messages/alternate_win/sha256",
      "pending check.copy_not_approved /messages/half_off/sha256",
    ]);
    expect(series.normalized.owners.mac).toContain("draw_2");
    expect(series.normalized.modes.shadow).toEqual(["g3.draw_2", "g4.draw_2", "g5.draw_2"]);
  });
});

describe("every P1b semantic check fires on a crafted bad file", () => {
  const base = () => load("review-group-giveaway.json");
  const step = (body: Record<string, any>, id: string) => body.steps.find((entry: { id: string }) => entry.id === id);
  const cases: Array<[string, (body: Record<string, any>) => void]> = [
    ["check.unknown_ref", (body) => (step(body, "draw_2").after = ["draw_1", "entries_9"])],
    ["check.cycle", (body) => (step(body, "draw_1").after = ["winner_note_1"])],
    ["check.schema", (body) => (step(body, "draw_1").do = "drawing")],
    ["check.field_kind_forbidden", (body) => (body.messages.night_ask.kind = "ask")],
    ["check.yaml_bool_key", (body) => (step(body, "codes").code = { true: "lunair_cover", false: "50%" })],
    ["check.exclude_missing", (body) => delete step(body, "winner_note_1").exclude],
    ["check.says_window_uncovered", (body) => delete body.messages.winner_note.late],
    ["check.promise_unbacked", (body) => (body.messages.night_ask.promises[0].by = "night+1 07:00")],
    ["check.states_unbacked", (body) => (step(body, "followup").after = ["night_ask"])],
    ["check.draw_closes_after_at", (body) => (step(body, "draw_1").closes = "night+1 09:00")],
    ["check.source_unknown", (body) => (body.sources.refunds.from = "shopify_refunds_table")],
    ["check.sql_forbidden", (body) => (body.sources.refunds.from = "select email from refunds")],
    ["check.time_format", (body) => (step(body, "draw_1").at = "night+1 8am")],
    ["check.duplicate_id", (body) => (step(body, "draw_2").id = "draw_1")],
    ["check.task_guards_send_unverified", (body) => body.steps.push({ id: "refresh", do: "task", owner: "agent", what: "refresh the list", guards: ["night_ask"] })],
    ["check.copy_sha_mismatch", (body) => (body.messages.half_off.sha256 = "1234")],
  ];
  for (const [code, mutate] of cases) {
    it(code, () => {
      const body = base();
      mutate(body);
      const result = compileDefinition(body);
      expect(result.ok, code).toBe(false);
      expect(codes(result, "error")).toContain(code);
    });
  }

  it("expect takes {count, within} or {at_most}, and at_most alone is fine", () => {
    const body = base();
    step(body, "still_entered_1").expect = { at_most: 500 };
    expect(compileDefinition(body).ok).toBe(true);
    step(body, "still_entered_1").expect = { at_most: 500, count: 3 };
    expect(codes(compileDefinition(body), "error")).toContain("check.schema");
  });
});

describe("series checks", () => {
  const def = compileDefinition(load("review-group-giveaway.json")).normalized;
  const cases: Array<[string, (body: Record<string, any>) => void]> = [
    ["check.unknown_ref", (body) => (body.sequence = "review-group-giveaway@2")],
    ["check.owner_conflict", (body) => body.owners.engine.push("draw_1")],
    ["check.last_night_exceeded", (body) => body.instances.push({ id: "g6", group: 6, night: "2026-10-29", limit: 2690 })],
    ["check.time_format", (body) => (body.instances[0].night = "2026-10-32")],
    ["check.copy_observed_on_engine", (body) => body.owners.engine.push("still_entered_1") && (body.owners.mac = body.owners.mac.filter((id: string) => id !== "still_entered_1"))],
    ["check.schema", (body) => (body.modes.shadow = ["g3.winner_note_2"])],
    ["check.unknown_ref", (body) => (body.replan.code_goes = { ask_by: "2026-11-02 09:00" })],
    ["refuse.dst_ambiguous_time", (body) => (body.replan.code_go.ask_by = "2026-11-01 01:30")],
  ];
  for (const [code, mutate] of cases) {
    it(code, () => {
      const body = load("review-giveaway-2026-10.json");
      mutate(body);
      const result = compileSeries(def, 1, body);
      expect(result.ok, code).toBe(false);
      expect(codes(result, "error")).toContain(code);
    });
  }

  it("ask and decisions need every field", () => {
    const body = load("review-giveaway-2026-10.json");
    body.decisions = [{ about: "when", set: "Tue release", why: "blackout windows" }];
    expect(codes(compileSeries(def, 1, body), "error")).toContain("check.schema");
  });
});
