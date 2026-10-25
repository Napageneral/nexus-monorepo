// The server writes the words (ax principle 4): verdict lines, bodies, next: and relay: lines for
// brief, timeline, explain, audit and the page, all from the same rows, in Central time with the
// weekday, counts as "R of P", and never an address (people are entry ids or hashes).
import { RULE_WORDS, type Rule } from "./alerts.js";
import { next, problem, table, type Fixer, type Next, type Problem, type RelayFact } from "./output.js";
import type { SeriesRow, StepRow } from "./repo.js";
import { FINAL_STEP_STATES, PHASE_DATES, stateLabel, type StepState } from "./states.js";
import { formatCt, formatCtShort, utcToWall } from "./time.js";

export type AlertView = {
  id: string;
  rule: string;
  subject_ref: string;
  state: string;
  immediate: boolean;
  opened_at: string;
  last_delivered_at: string | null;
  deliveries: number;
  told_at: string | null;
  told_by: string | null;
  detail: Record<string, unknown>;
  lease: { holder: string; until: string; eta: string | null } | null;
};

const OWNER_WORDS: Record<string, string> = { engine: "engine", mac: "mac", review_sender: "review_sender", task: "task" };

export function shortRef(ref: string): string {
  return ref.includes("/") ? ref.slice(ref.indexOf("/") + 1) : ref;
}

/** "10 received of 10 (campaign aggregate)" or the observe summary, or what is still owed. */
export function resultText(step: StepRow): string {
  const summary = typeof step.result.summary === "string" ? step.result.summary : "";
  if (summary) return summary;
  if (step.state === "waiting") return ""; // the state label already says what it waits for
  if (step.expected.evidence === "import" && typeof step.expected.import_by === "string") return `import by ${formatCt(step.expected.import_by)}`;
  if (typeof step.expected.sent_by === "string") return `sent by ${formatCtShort(step.expected.sent_by)}, received by ${formatCtShort(String(step.expected.received_by))}`;
  if (typeof step.expected.count === "number") return `${Number(step.expected.count).toLocaleString("en-US")} expected (±${String(step.expected.within)})`;
  return "";
}

export function stepState(step: StepRow): string {
  const because = step.waiting_because ?? (step.state === "observing" ? (step.owner === "mac" ? "the Mac runs it" : "the review sender runs it") : null);
  const base = stateLabel(step.state, because, step.hold_code);
  return step.mode === "shadow" ? `${base} · shadow ${String((step.result.shadow as { pass?: boolean } | undefined)?.pass === undefined ? "pending" : (step.result.shadow as { pass: boolean }).pass ? "match" : "MISMATCH")}` : base;
}

function fixerFor(alert: AlertView, step: StepRow | undefined): Fixer {
  if (alert.rule === "A2" || alert.rule === "A13") return "agent";
  if (step?.owner === "mac") return "owner:mac";
  if (step?.owner === "review_sender") return "owner:review_sender";
  return "agent";
}

// P1b alerts are warn-tier facts: the engine only observes, so nothing here holds a step.
export function alertProblem(alert: AlertView, step: StepRow | undefined): Problem {
  const ref = typeof alert.detail.ref === "string" ? alert.detail.ref : null;
  const commands: Next[] = [next(`seqctl explain ${alert.id}`, "what happened and what fixes it", "agent")];
  if (alert.state !== "told") commands.push(next(`seqctl told ${alert.id} --note '<what you told Tyler>'`, "stops the 6-hourly re-sends", "agent"));
  if (alert.rule === "A11") commands.unshift(next("on the Mac: python3 -I scripts/sequences_import.py --drawing <night>-<n> --push, then --apply <pt_…>", "the drawing's evidence is not on the server", "agent", "command", "~5 min"));
  return problem({
    code: String(alert.detail.code ?? alert.rule),
    tier: "warn",
    ref,
    message: `${alert.id} · ${RULE_WORDS[alert.rule as Rule] ?? alert.rule} · ${String(alert.detail.message ?? "")}`,
    impact: step?.owner === "mac" || step?.owner === "review_sender" ? "another owner's step: the engine only observes it this week" : null,
    resumes: "auto",
    fixer: fixerFor(alert, step),
    claimed_by: alert.lease ? { by: alert.lease.holder, until: formatCt(alert.lease.until), eta: alert.lease.eta ? formatCt(alert.lease.eta) : null } : null,
    tyler_told: alert.told_at
      ? { emailed_at: alert.last_delivered_at, incident: null, in_digest: false, relayed_by: alert.told_by, relayed_at: alert.told_at }
      : alert.last_delivered_at
        ? { emailed_at: alert.last_delivered_at, incident: null, in_digest: false, relayed_by: null, relayed_at: null }
        : null,
    next: commands,
  });
}

export type BriefInput = {
  series: SeriesRow[];
  steps: Map<string, StepRow[]>;
  alerts: AlertView[];
  relays: Array<{ at: string; by: string; refs: string[]; note: string; asked: string | null }>;
  since: string;
  until: string;
  now: Date;
};

export function renderBrief(input: BriefInput): { verdict: { text: string; behind: string; ahead: string }; body: string[]; problems: Problem[]; facts: RelayFact[]; relay: string; data: Record<string, unknown> } {
  const body: string[] = [];
  const facts: RelayFact[] = [];
  const since = Date.parse(input.since);
  const until = Date.parse(input.until);
  const now = input.now.getTime();
  const allSteps = [...input.steps.values()].flat();
  const byRef = new Map(allSteps.map((step) => [step.ref, step]));
  const problems = input.alerts.filter((alert) => alert.state !== "resolved").map((alert) => alertProblem(alert, byRef.get(String(alert.detail.ref ?? ""))));

  const finishedSince = allSteps.filter((step) => FINAL_STEP_STATES.has(step.state as StepState) && Date.parse(step.updated_at) >= since && step.state !== "skipped");
  const shadows = allSteps.filter((step) => step.result.shadow && Date.parse(step.updated_at) >= since);
  const short = allSteps.filter((step) => step.state === "short" || step.result.verdict === "short" || step.result.verdict === "late");
  const ahead = allSteps
    .filter((step) => !FINAL_STEP_STATES.has(step.state as StepState) || step.mode === "shadow")
    .flatMap((step) => {
      // The next thing that happens: the owner's due time, or an engine Run of the step (S0, o2…).
      const times = [
        ...(step.due_at ? [{ at: Date.parse(step.due_at), what: null as string | null }] : []),
        ...step.work.filter((item) => item.due_at).map((item) => ({ at: Date.parse(item.due_at!), what: `engine ${item.phase}: ${item.purpose}` })),
      ];
      const nextUp = times.filter((time) => time.at >= now && time.at <= until).sort((a, b) => a.at - b.at)[0];
      return nextUp === undefined || step.state === "waiting" ? [] : [{ step, at: nextUp.at, what: nextUp.what }];
    })
    .sort((a, b) => a.at - b.at || a.step.ref.localeCompare(b.step.ref));

  if (input.series.length > 1) {
    body.push("SERIES");
    for (const series of input.series) body.push(`  ${series.id} · ${series.state} · ${input.steps.get(series.id)?.length ?? 0} steps`);
  } else if (input.series[0]) {
    const series = input.series[0];
    body.push(`${series.id} · ${series.state}${series.state === "observing" ? " · the Mac and the review sender run every step this week; nothing to approve" : ""}`);
  }
  if (finishedSince.length > 0) {
    body.push("");
    body.push(...table([["SINCE", "STEP", "OWNER", "RESULT", "STATE"], ...finishedSince.map((step) => [formatCtShort(step.updated_at), shortRef(step.ref), OWNER_WORDS[step.owner] ?? step.owner, resultText(step), step.state])]));
  }
  for (const step of shadows) {
    const shadow = step.result.shadow as { pass: boolean; unexplained?: number; mismatched?: string[] };
    body.push(`SHADOW ${shortRef(step.ref)} · ${shadow.pass ? "match: entries, sha, winners and alternates equal the Mac's" : `MISMATCH (${(shadow.mismatched ?? []).join(", ")}; ${shadow.unexplained ?? 0} unexplained)`}`);
    facts.push({ priority: shadow.pass ? 5 : 1, text: shadow.pass ? `The server's shadow of ${shortRef(step.ref)} matched the Mac's drawing exactly.` : `The server's shadow of ${shortRef(step.ref)} did not match the Mac's drawing; that blocks the server drawing (P3) until it is explained and fixed.`, needs_tyler: false, link: null });
  }
  for (const step of short) {
    body.push(`SHORT  ${shortRef(step.ref)} · ${resultText(step)} · fixer: ${step.owner === "engine" ? "agent" : `owner:${step.owner}`}`);
    facts.push({ priority: 2, text: `${shortRef(step.ref)} is ${String(step.result.verdict ?? step.state)}: ${resultText(step)}.`, needs_tyler: false, link: null });
  }
  if (ahead.length > 0) {
    body.push("");
    body.push(...table([["AHEAD", "STEP", "OWNER", "STATE", "WHAT"], ...ahead.slice(0, 20).map(({ step, at, what }) => [formatCtShort(new Date(at)), shortRef(step.ref), OWNER_WORDS[step.owner] ?? step.owner, stepState(step), what ?? resultText(step)])]));
  }
  const waiting = allSteps.filter((step) => step.state === "waiting");
  if (waiting.length > 0) body.push(`WAITING ${waiting.length} engine steps (claims, codes, half-off note): ${waiting[0]!.waiting_because ?? "P2 not released"} (${PHASE_DATES.P2})`);
  const told = input.relays.filter((relay) => Date.parse(relay.at) >= since);
  const delivered = input.alerts.filter((alert) => alert.last_delivered_at && Date.parse(alert.last_delivered_at) >= since);
  if (told.length + delivered.length > 0) {
    body.push(`TOLD TYLER ${[...delivered.map((alert) => `${formatCtShort(alert.last_delivered_at!)} alert ${alert.id}`), ...told.map((relay) => `${formatCtShort(relay.at)} ${relay.by}: ${relay.note.slice(0, 80)}`)].join(" · ")}`);
  } else {
    body.push("TOLD TYLER nothing since the window opened");
  }

  const open = input.alerts.filter((alert) => alert.state === "open" || alert.state === "taken");
  const behind = short.length > 0 ? `short, ${short.slice(0, 2).map((step) => `${shortRef(step.ref)} ${resultText(step)}`).join("; ")}` : open.length > 0 ? `${open.length} open alert${open.length === 1 ? "" : "s"} (${open.slice(0, 3).map((alert) => alert.id).join(", ")})` : finishedSince.length > 0 ? `on plan, ${finishedSince.length} steps finished` : "on plan";
  const first = ahead[0];
  const aheadText = first ? `next ${shortRef(first.step.ref)} ${formatCt(new Date(first.at))} (${OWNER_WORDS[first.step.owner] ?? first.step.owner})` : `nothing due before ${formatCt(input.until)}`;
  if (open.length === 0 && short.length === 0) facts.push({ priority: 4, text: first ? `Everything is on plan; next is ${shortRef(first.step.ref)} at ${formatCt(new Date(first.at), undefined, false)}.` : "Everything is on plan and nothing more is due today.", needs_tyler: false, link: null });
  for (const alert of open.slice(0, 2)) facts.push({ priority: 1, text: `${alert.id}: ${String(alert.detail.message ?? RULE_WORDS[alert.rule as Rule] ?? "")}.`, needs_tyler: false, link: null });
  facts.sort((a, b) => a.priority - b.priority);
  const relay = facts.slice(0, 4).map((fact) => fact.text).join(" ");
  return {
    verdict: { text: `BEHIND: ${behind} · AHEAD: ${aheadText}`, behind, ahead: aheadText },
    body,
    problems,
    facts,
    relay,
    data: {
      window: { since: input.since, until: input.until },
      series: input.series.map((series) => ({ id: series.id, state: series.state })),
      since: finishedSince.map((step) => ({ ref: step.ref, owner: step.owner, state: step.state, result: resultText(step), at: step.updated_at })),
      short: short.map((step) => ({ ref: step.ref, verdict: step.result.verdict ?? step.state, result: resultText(step) })),
      ahead: ahead.map(({ step, at }) => ({ ref: step.ref, at: new Date(at).toISOString(), owner: step.owner, state: step.state })),
      shadows: shadows.map((step) => ({ ref: step.ref, shadow: step.result.shadow })),
      waiting: waiting.length,
      told: told.map((relay) => ({ at: relay.at, by: relay.by, refs: relay.refs })),
      alerts: open.map((alert) => ({ id: alert.id, rule: alert.rule, subject_ref: alert.subject_ref, state: alert.state })),
    },
  };
}

/** The group grid: one row per instance, its night, each drawing and its notes. */
export function renderGrid(series: SeriesRow, steps: StepRow[]): { body: string[]; rows: Array<Record<string, unknown>> } {
  const instances = series.plan.instances ?? [];
  const rows = instances.map((instance) => {
    const mine = steps.filter((step) => step.instance_id === instance.id);
    const cell = (stepId: string) => {
      const step = mine.find((entry) => entry.step_id === stepId);
      if (!step) return "-";
      if (step.state === "adopted" || step.state === "short") return resultText(step) || step.state;
      return step.due_at ? `${step.state} ${formatCtShort(step.due_at)}` : step.state;
    };
    const shadow = mine.find((step) => step.mode === "shadow");
    const claims = mine.filter((step) => step.do === "spawn");
    return {
      instance: instance.id,
      night: String(instance.params.night ?? ""),
      drawing_1: cell("draw_1"),
      drawing_2: cell("draw_2"),
      notes: mine.filter((step) => step.expected.note).map((step) => `${step.step_id}: ${step.result.verdict ?? step.state}`).join(", "),
      shadow: shadow ? stepState(shadow).split("· shadow ")[1] ?? "pending" : "-",
      claims: claims.length > 0 ? claims[0]!.waiting_because ?? claims[0]!.state : "-",
    };
  });
  const header = ["GROUP", "NIGHT", "DRAWING 1", "DRAWING 2", "NOTES", "SHADOW", "CLAIMS"];
  const nightOf = (text: string) => {
    if (!text) return "";
    const wall = utcToWall(new Date(`${text}T17:00:00Z`));
    return `${wall.weekday} ${Number(text.slice(5, 7))}/${Number(text.slice(8, 10))}`;
  };
  return {
    body: table([header, ...rows.map((row) => [String(row.instance), nightOf(String(row.night)), String(row.drawing_1), String(row.drawing_2), String(row.notes) || "-", String(row.shadow), String(row.claims)])]),
    rows,
  };
}

export function renderStepRows(steps: StepRow[]): string[] {
  return table([["DUE (CT)", "STEP", "OWNER", "STATE", "RESULT (target)"], ...steps.map((step) => [step.due_at ? formatCtShort(step.due_at) : "-", step.step_id, OWNER_WORDS[step.owner] ?? step.owner, stepState(step), resultText(step)])]);
}

export function countsByState(steps: StepRow[]): string {
  const counts = new Map<string, number>();
  for (const step of steps) counts.set(step.state, (counts.get(step.state) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([state, n]) => `${n} ${state}`).join(" · ");
}

export function outcomeVector(input: { received: number | null; planned: number; receiptKind: string }): string {
  if (input.received === null) return `${input.planned.toLocaleString("en-US")} planned · received unknown (${input.receiptKind})`;
  return `${input.received.toLocaleString("en-US")} received of ${input.planned.toLocaleString("en-US")} planned (${input.receiptKind === "campaign_only" ? "campaign aggregate: on the list, can't confirm per person" : input.receiptKind})`;
}
