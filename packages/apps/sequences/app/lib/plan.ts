// materialize(definition, series) -> every step instance of every instance, with UTC times, owner,
// mode, what the engine expects to see, and the engine Runs it will accept (its `work`). The plan
// is canonicalized and hashed (plan_sha256); it never depends on the wall clock, so the same files
// always give the same sha. The state a step starts in is computed separately (initialState).
import { dependencies, liveInRelease, ownerOf, type Definition, type Series, type Step } from "./compile.js";
import { formatRef } from "./refs.js";
import { planSha, shortId } from "./sha.js";
import { PHASE_OF_DO, type Mode, type Owner, type StepState } from "./states.js";
import { evalTimeExpr, parseDuration, parseTimeExpr, parseWindow, utcToWall, wallToUtc, type TimeScope } from "./time.js";

export type WorkItem = {
  phase: string; // o1/o2 (observe reads), s0/s1/c (shadow draw), main
  job: "sequences.step" | "sequences.draw" | "sequences.notify";
  due_at: string | null; // null: waits for a condition (wait_for)
  wait_for?: "import";
  deadline_at?: string | null;
  purpose: string;
  supersedes_earlier?: boolean; // when it is already due, earlier phases need no Run of their own
};

export type PlannedStep = {
  id: string;
  ref: string;
  series_id: string;
  instance_id: string;
  step_id: string;
  do: string;
  owner: Owner;
  mode: Mode;
  due_at: string | null;
  not_before: string | null;
  not_after: string | null;
  window_from: string | null;
  window_to: string | null;
  copy_valid_from: string | null;
  copy_valid_until: string | null;
  depends_on: string[];
  expected: Record<string, unknown>;
  target: Record<string, unknown> | null;
  work: WorkItem[];
};

export type Plan = {
  version: 1;
  series: string;
  definition: { name: string; revision: number; sha256: string };
  series_file_sha256: string;
  timezone: string;
  prize_scope: string | null;
  instances: Array<{ id: string; params: Record<string, unknown> }>;
  steps: PlannedStep[];
};

const iso = (date: Date | null) => (date ? date.toISOString() : null);
const MINUTE = 60_000;

/** A window that ends on a :59 minute without seconds ("07:00-11:59") runs to the minute's end. */
function windowOn(date: string, text: string, tz: string): { from: Date; to: Date } {
  const window = parseWindow(text);
  const wholeMinute = /-\s*\d{2}:59\s*$/.test(text);
  return { from: wallToUtc(date, window.from, tz), to: new Date(wallToUtc(date, window.to, tz).getTime() + (wholeMinute ? 59_000 : 0)) };
}

function at(date: string, time: string, tz: string): Date {
  return wallToUtc(date, time, tz);
}

/** Which ledger an observed review-sender send is counted in (the email monitor's GROUP_LEDGER_SQL). */
function ledgerOf(step: Step): "night" | "followup" {
  const audience = step.audience as Record<string, unknown> | undefined;
  return audience && typeof audience === "object" && !Array.isArray(audience) && typeof audience.members_of === "string" ? "followup" : "night";
}

function noteOf(step: Step): { note: "winner" | "still_entered"; draw: string } | null {
  const audience = typeof step.audience === "string" ? step.audience : "";
  const match = /^([a-z][a-z0-9_]*)\.(winners|non_winners)$/.exec(audience);
  if (!match) return null;
  return { note: match[2] === "winners" ? "winner" : "still_entered", draw: match[1]! };
}

export function materialize(def: Definition, definitionMeta: { revision: number; sha256: string }, series: Series, seriesFileSha256: string): { plan: Plan; plan_sha256: string } {
  const tz = def.timezone;
  const dateParams = Object.entries(def.params).filter(([, type]) => type === "date").map(([name]) => name);
  const drawNo = new Map(def.steps.filter((step) => step.do === "draw").map((step, index) => [step.id, index + 1]));
  const byId = new Map(def.steps.map((step) => [step.id, step]));
  const shadow = new Set(series.modes.shadow);
  const observeLive = new Set(series.modes.observe_live);
  const settleGate = parseDuration(def.defaults.send.settle_gate ?? "30m");
  const steps: PlannedStep[] = [];

  for (const instance of series.instances) {
    const dates: Record<string, string> = {};
    for (const name of dateParams) if (typeof instance[name] === "string") dates[name] = instance[name] as string;
    const scope: TimeScope = { tz, dates, instants: {} };
    const expr = (text: string | undefined) => (text ? evalTimeExpr(parseTimeExpr(text, dateParams), scope) : null);
    const due = new Map<string, Date | null>();
    const night = typeof instance.night === "string" ? (instance.night as string) : null;

    const dueOf = (stepId: string, trail = new Set<string>()): Date | null => {
      if (due.has(stepId)) return due.get(stepId)!;
      if (trail.has(stepId)) return null;
      trail.add(stepId);
      const step = byId.get(stepId)!;
      const replanned = series.replan[stepId]?.at;
      let value: Date | null = null;
      if (replanned) value = evalTimeExpr(parseTimeExpr(replanned), { tz, dates: {} });
      else if (step.at) value = expr(step.at);
      else {
        const deps = dependencies(step);
        const times = deps.explicit.map((dep) => {
          const base = dueOf(dep, trail);
          return base && deps.settled.includes(dep) ? new Date(base.getTime() + settleGate) : base;
        });
        // A step with no after (a spawn) follows the steps its fields read from.
        const implicit = times.length === 0 ? deps.implicit.filter((dep) => byId.has(dep)).map((dep) => dueOf(dep, trail)) : [];
        const all = [...times, ...implicit];
        value = all.length > 0 && all.every((time) => time !== null) ? new Date(Math.max(...all.map((time) => time!.getTime()))) : null;
      }
      due.set(stepId, value);
      scope.instants![`${stepId}.at`] = value;
      return value;
    };

    for (const step of def.steps) {
      const ref = formatRef({ series: series.series, instance: instance.id, step: step.id });
      const owner = ownerOf(def, series, step.id);
      const instStep = `${instance.id}.${step.id}`;
      const mode: Mode = owner === "engine" || owner === "task" ? "live" : shadow.has(instStep) ? "shadow" : "observe";
      const dueAt = dueOf(step.id);
      const notBefore = series.replan[step.id]?.not_before ? evalTimeExpr(parseTimeExpr(series.replan[step.id]!.not_before!), { tz, dates: {} }) : expr(step.not_before);
      const notAfter = series.replan[step.id]?.not_after ? evalTimeExpr(parseTimeExpr(series.replan[step.id]!.not_after!), { tz, dates: {} }) : expr(step.not_after);
      const dueDate = dueAt ? utcToWall(dueAt, tz).date : night;
      const window = typeof step.window === "string" && dueDate ? windowOn(dueDate, step.window, tz) : null;
      const message = step.message ? def.messages[step.message] : undefined;
      const says = message?.says ? Object.values(message.says)[0] : undefined;
      const copy = says && dueDate ? windowOn(dueDate, says, tz) : null;
      const deps = dependencies(step);
      const dependsOn = [...deps.explicit, ...deps.implicit]
        .filter((name) => byId.has(name))
        .map((name) => formatRef({ series: series.series, instance: instance.id, step: name }));
      const expected: Record<string, unknown> = { phase_needed: PHASE_OF_DO[step.do] ?? "P5" };
      const work: WorkItem[] = [];

      if (owner === "review_sender" && step.do === "send_flow_event" && window && dueDate) {
        const ledger = ledgerOf(step);
        expected.observe = "invitations";
        expected.ledger = ledger;
        expected.night = night;
        expected.live = observeLive.has(instStep);
        if (ledger === "night") {
          const expect = (step.expect as Record<string, unknown> | undefined) ?? {};
          const count = typeof expect.count === "string" ? Number(instance[expect.count]) : Number(expect.count);
          const within = typeof expect.within === "string" ? Number(expect.within.replace("%", "")) / 100 : 0.05;
          if (Number.isFinite(count)) Object.assign(expected, { count, within: expect.within ?? "5%", lo: count * (1 - within), hi: count * (1 + within) });
          // The email monitor's thresholds (#5610): not started by 20:17, short at window end + 15 m.
          const startedBy = new Date(window.from.getTime() + 60 * MINUTE);
          const settledBy = new Date(window.to.getTime() + 15 * MINUTE);
          Object.assign(expected, { started_by: iso(startedBy), settled_by: iso(settledBy) });
          work.push({ phase: "o1", job: "sequences.step", due_at: iso(startedBy), purpose: "night ask started" });
          work.push({ phase: "o2", job: "sequences.step", due_at: iso(settledBy), purpose: "night ask count against the band", supersedes_earlier: true });
        } else {
          const presentBy = new Date(window.to.getTime() + 15 * MINUTE);
          const finalAt = notAfter ? new Date(notAfter.getTime() + 15 * MINUTE) : null;
          Object.assign(expected, { present_by: iso(presentBy), final_at: iso(finalAt) });
          work.push({ phase: "o1", job: "sequences.step", due_at: iso(presentBy), purpose: "follow-up rows present" });
          if (finalAt) work.push({ phase: "o2", job: "sequences.step", due_at: iso(finalAt), purpose: "follow-up final count", supersedes_earlier: true });
        }
      }

      if (owner === "mac" && step.do === "draw" && dueAt && dueDate) {
        const closes = expr(step.closes);
        const importBy = at(dueDate, "09:30:00", tz);
        Object.assign(expected, {
          evidence: "import",
          night,
          drawing_no: drawNo.get(step.id) ?? 1,
          closes_at: iso(closes),
          import_by: iso(importBy),
          pick: step.pick ?? null,
        });
        if (mode === "shadow" && closes) {
          work.push({ phase: "s0", job: "sequences.draw", due_at: iso(new Date(closes.getTime() + 5 * MINUTE)), purpose: "entries read at close + 5 m" });
          work.push({ phase: "s1", job: "sequences.draw", due_at: iso(new Date(dueAt.getTime() + 30_000)), purpose: "entries read at draw time + 30 s" });
          work.push({ phase: "c", job: "sequences.draw", due_at: null, wait_for: "import", deadline_at: iso(importBy), purpose: "read again on the Mac's import, then compare" });
        }
      }

      if (owner === "mac" && step.do === "free_entry_intake") Object.assign(expected, { evidence: "import", night });

      if (owner === "mac" && step.do === "send_flow_event" && dueDate) {
        const note = noteOf(step);
        if (note) {
          const drawDue = dueOf(note.draw);
          const day = drawDue ? utcToWall(drawDue, tz).date : dueDate;
          const [sentBy, receivedBy] = note.note === "winner" ? ["09:00:00", "10:30:00"] : ["10:17:00", "11:17:00"];
          Object.assign(expected, {
            evidence: "import",
            night,
            note: note.note,
            drawing_no: drawNo.get(note.draw) ?? 1,
            campaign_name: message?.campaign_name?.replace("{night}", night ?? "").replace("{n}", String(drawNo.get(note.draw) ?? 1)) ?? null,
            sent_by: iso(at(day, sentBy, tz)),
            received_by: iso(at(day, receivedBy, tz)),
          });
        }
      }

      if (owner === "engine" && !liveInRelease(step.do)) expected.waiting_for_phase = PHASE_OF_DO[step.do] ?? "P5";
      if (step.do === "approval" && (series.replan[step.id]?.ask_by || step.ask_by)) {
        const askBy = series.replan[step.id]?.ask_by ? evalTimeExpr(parseTimeExpr(series.replan[step.id]!.ask_by!), { tz, dates: {} }) : expr(String(step.ask_by));
        expected.ask_by = iso(askBy);
      }

      steps.push({
        id: shortId("si", ref),
        ref,
        series_id: series.series,
        instance_id: instance.id,
        step_id: step.id,
        do: step.do,
        owner,
        mode,
        due_at: iso(dueAt),
        not_before: iso(notBefore),
        not_after: iso(notAfter),
        window_from: iso(window?.from ?? null),
        window_to: iso(window?.to ?? null),
        copy_valid_from: iso(copy?.from ?? null),
        copy_valid_until: iso(copy?.to ?? null),
        depends_on: dependsOn,
        expected,
        target: (step.target as Record<string, unknown> | undefined) ?? null,
        work,
      });
    }
  }

  const plan: Plan = {
    version: 1,
    series: series.series,
    definition: { name: def.sequence, revision: definitionMeta.revision, sha256: definitionMeta.sha256 },
    series_file_sha256: seriesFileSha256,
    timezone: tz,
    prize_scope: def.needs?.prize_scope ?? null,
    instances: series.instances.map(({ id, ...params }) => ({ id, params })),
    steps,
  };
  return { plan, plan_sha256: planSha(plan) };
}

/**
 * Where a step starts when the series is created at `now`. Engine steps whose type is not live
 * wait for their phase, except ones due before the engine took the series and not named in
 * owners.engine: nobody ran them on the engine, so they read skipped instead of waiting forever.
 */
export function initialState(step: PlannedStep, now: Date, namedEngine: ReadonlySet<string>): { state: StepState; because: string | null } {
  if (step.mode === "observe" || step.mode === "shadow") {
    return { state: "observing", because: `${step.owner === "mac" ? "the Mac" : "the review sender"} runs it` };
  }
  if (step.owner === "engine" && !liveInRelease(step.do)) {
    if (step.due_at && new Date(step.due_at).getTime() < now.getTime() && !namedEngine.has(step.step_id)) {
      return { state: "skipped", because: "due before the engine took the series" };
    }
    return { state: "waiting", because: `${String(step.expected.waiting_for_phase ?? "P2")} not released` };
  }
  return { state: "planned", because: null };
}
