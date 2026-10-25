import { describe, expect, it } from "vitest";
import { RESEND_MS, evaluateRunAlerts, evaluateStepAlerts, phasesDue, renderAlert, type StepView } from "./alerts.js";

const base: StepView = {
  id: "si_1",
  ref: "s/g3.night_ask",
  series_id: "s",
  series_created_at: "2026-10-24T00:00:00Z",
  step_id: "night_ask",
  owner: "review_sender",
  mode: "observe",
  state: "observing",
  due_at: "2026-10-25T00:30:00Z",
  expected: {},
  result: {},
  work: [
    { phase: "o1", job: "sequences.step", due_at: "2026-10-25T01:17:00Z" },
    { phase: "o2", job: "sequences.step", due_at: "2026-10-25T04:15:00Z", supersedes_earlier: true },
  ],
  runs: [],
};
const at = (iso: string) => new Date(iso);

describe("A1: late", () => {
  it("fires 10 minutes after an engine Run's due time, not before, and not once it started", () => {
    expect(evaluateStepAlerts([base], at("2026-10-25T01:26:59Z"), new Set())).toEqual([]);
    const late = evaluateStepAlerts([base], at("2026-10-25T01:27:01Z"), new Set());
    expect(late.map((alert) => `${alert.rule} ${alert.subject_ref}`)).toEqual(["A1 s/g3.night_ask#o1"]);
    expect(evaluateStepAlerts([{ ...base, runs: [{ phase: "o1", state: "claimed" }] }], at("2026-10-25T01:30:00Z"), new Set())).toEqual([]);
  });

  it("drops an earlier phase once a superseding one is due, and draws get 15 minutes", () => {
    expect(phasesDue(base, at("2026-10-25T05:00:00Z"))).toEqual(["o2"]);
    const draw = { ...base, ref: "s/g3.draw_2", work: [{ phase: "s1", job: "sequences.draw", due_at: "2026-10-28T13:00:30Z" }] };
    expect(evaluateStepAlerts([draw], at("2026-10-28T13:14:00Z"), new Set())).toEqual([]);
    expect(evaluateStepAlerts([draw], at("2026-10-28T13:16:00Z"), new Set())).toHaveLength(1);
  });

  it("counts grace from when the engine took the series, for work already past at import", () => {
    const imported = { ...base, series_created_at: "2026-10-27T18:00:00Z" };
    expect(evaluateStepAlerts([imported], at("2026-10-27T18:05:00Z"), new Set())).toEqual([]);
    expect(evaluateStepAlerts([imported], at("2026-10-27T18:11:00Z"), new Set()).map((alert) => alert.subject_ref)).toEqual(["s/g3.night_ask#o2"]);
  });

  it("turns observed verdicts into A1, A4 and A9, and a shadow mismatch into A4", () => {
    const rules = (result: Record<string, unknown>) => evaluateStepAlerts([{ ...base, work: [], result }], at("2026-10-26T00:00:00Z"), new Set()).map((alert) => `${alert.rule}:${String(alert.detail.code)}`);
    expect(rules({ verdict: "late", summary: "x" })).toEqual(["A1:A1.evidence_late"]);
    expect(rules({ verdict: "short", summary: "x" })).toEqual(["A4:A4.short"]);
    expect(rules({ verdict: "over", summary: "x" })).toEqual(["A9:A9.audience_over"]);
    expect(rules({ verdict: "unknown" })).toEqual([]);
    expect(rules({ shadow: { pass: false, unexplained: 1, diffs: [{}] } })).toEqual(["A4:shadow.mismatch"]);
  });
});

describe("A11: a Mac drawing not imported by 09:30", () => {
  const draw: StepView = { ...base, ref: "s/g4.draw_1", owner: "mac", work: [], expected: { evidence: "import", night: "2026-10-25", drawing_no: 1, import_by: "2026-10-26T14:30:00Z" } };
  it("fires after 09:30 CT on the drawing morning unless the drawing is imported", () => {
    expect(evaluateStepAlerts([draw], at("2026-10-26T14:29:59Z"), new Set())).toEqual([]);
    expect(evaluateStepAlerts([draw], at("2026-10-26T14:30:01Z"), new Set()).map((alert) => alert.rule)).toEqual(["A11"]);
    expect(evaluateStepAlerts([draw], at("2026-10-26T15:00:00Z"), new Set(["2026-10-25#1"]))).toEqual([]);
  });
});

describe("A2 and the words", () => {
  it("raises A2 for quarantined, held, failed and dead-lettered sequences Runs only", () => {
    const alerts = evaluateRunAlerts([
      { id: "r1", job_name: "sequences.step", status: "quarantined" },
      { id: "r2", job_name: "sequences.step", status: "completed" },
      { id: "r3", job_name: "sequences.draw", status: "held", error: "lease_expired" },
    ]);
    expect(alerts.map((alert) => alert.subject_ref)).toEqual(["run:r1", "run:r3"]);
  });

  it("re-sends every 6 hours and renders ids and counts only", () => {
    expect(RESEND_MS).toBe(6 * 60 * 60 * 1000);
    const text = renderAlert({ id: "A11-0007", rule: "A11", subject_ref: "s/g4.draw_1", opened_at: "2026-10-26T14:30:05Z", detail: { message: "drawing 1 of 2026-10-25 not imported by Mon 10/26 9:30 AM CDT" } });
    expect(text).toBe("A11-0007 · a Mac drawing is not imported · s/g4.draw_1 · drawing 1 of 2026-10-25 not imported by Mon 10/26 9:30 AM CDT · opened Mon 10/26 9:30 AM CDT");
  });
});
