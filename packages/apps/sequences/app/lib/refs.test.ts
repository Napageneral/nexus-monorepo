import { describe, expect, it } from "vitest";
import { EXIT, buildOutput, exitForProblems, problem } from "./output.js";
import { formatRef, parseFullRef, parseRunKey, resolveRef, resolveWildcard, runKey } from "./refs.js";

const known = ["review-giveaway-2026-10/g1.draw_1", "review-giveaway-2026-10/g2.draw_1", "review-drawing-2026-11/g1.draw_1", "review-giveaway-2026-10/g3.codes"];

describe("refs", () => {
  it("round-trips the full form", () => {
    const ref = parseFullRef("review-giveaway-2026-10/g3.claims_1/w4.desk_row")!;
    expect(ref).toEqual({ series: "review-giveaway-2026-10", instance: "g3", step: "claims_1", item: "w4", child: "desk_row" });
    expect(formatRef(ref)).toBe("review-giveaway-2026-10/g3.claims_1/w4.desk_row");
    expect(parseFullRef("nope")).toBeNull();
  });

  it("resolves a short form only when unique; otherwise refuses with the candidates", () => {
    expect(resolveRef("g2.draw_1", known)).toEqual({ ok: true, ref: "review-giveaway-2026-10/g2.draw_1", resolved_from: "g2.draw_1" });
    expect(resolveRef("g1.draw_1", known)).toMatchObject({ ok: false, code: "refuse.ambiguous_ref", candidates: ["review-drawing-2026-11/g1.draw_1", "review-giveaway-2026-10/g1.draw_1"] });
    expect(resolveRef("draw_1", known)).toMatchObject({ ok: false, code: "check.unknown_ref" });
    expect(resolveRef("g*.codes", known)).toMatchObject({ ok: false, code: "refuse.wildcard_required" });
    expect(resolveWildcard("review-giveaway-2026-10", "g*.codes", known)).toEqual(["review-giveaway-2026-10/g3.codes"]);
  });

  it("builds and parses run keys", () => {
    const key = runKey("review-giveaway-2026-10", "g3", "draw_2", "s1", 2);
    expect(key).toBe("seq:review-giveaway-2026-10:g3:draw_2:s1:a2");
    expect(parseRunKey(key)).toEqual({ series: "review-giveaway-2026-10", instance: "g3", step: "draw_2", phase: "s1", attempt: 2 });
  });
});

describe("output exit precedence", () => {
  it("reads exit by verdict: 4 > 3 > 8 > 0, refusals and transients outright", () => {
    const p = (tier: Parameters<typeof problem>[0]["tier"], fixer: Parameters<typeof problem>[0]["fixer"] = "none", code = "x") => problem({ code, tier, message: "m", fixer });
    expect(exitForProblems([])).toBe(EXIT.ok);
    expect(exitForProblems([p("error", "agent")])).toBe(EXIT.needs_agent);
    expect(exitForProblems([p("error", "agent"), p("error", "tyler")])).toBe(EXIT.needs_tyler);
    expect(exitForProblems([p("error", "tyler"), p("hold", "agent")])).toBe(EXIT.held);
    expect(exitForProblems([p("warn", "tyler")])).toBe(EXIT.ok);
    expect(exitForProblems([p("refuse", "agent", "refuse.token_stale")])).toBe(EXIT.token_stale);
    expect(exitForProblems([p("transient")])).toBe(EXIT.transient);
  });

  it("prints the verdict, problems, next and relay in the text twin", () => {
    const out = buildOutput({ command: "brief.get", now: new Date("2026-10-27T18:00:00Z"), verdict: "BEHIND: on plan · AHEAD: next g5.followup", subject: { series: "s" }, body: ["body line"], relay: { text: "All on plan." } });
    expect(out.text.split("\n")).toEqual(["BEHIND: on plan · AHEAD: next g5.followup · exit 0", "body line", "relay: All on plan."]);
    expect(out.as_of).toEqual({ ct: "Tue 10/27 1:00 PM CDT", utc: "2026-10-27T18:00:00.000Z" });
    expect(out.links.page).toBe("https://ops.moonsleep.co/?page=sequences&s=s");
  });
});
