// The one output contract (ax principle 3, error_and_explain_model): every read and write method
// returns the same keys, and a `text` twin rendered from the same values. Domain refusals come back
// as ok:false inside the payload, never as a thrown error: the ops API's Nex client flattens thrown
// errors to "unavailable", which would hide the fix from the agent reading it.
import { asOf } from "./time.js";

export const OUTPUT_CONTRACT = "sequences_output_v1";
export const PAGE_BASE = "https://ops.moonsleep.co/?page=sequences";

export type Tier = "error" | "pending" | "warn" | "hold" | "refuse" | "transient";
export type Fixer = "none" | "agent" | "desk" | "casey" | "tyler" | "owner:mac" | "owner:review_sender";
export type NextKind = "command" | "edit" | "code_release" | "ruling" | "human" | "tyler_tap";

// NX-P17: no data schema carries a property named `kind`, so the ax draft's next[].kind is `fix_type`.
export type Next = {
  cmd: string;
  why: string;
  who: string;
  fix_type: NextKind;
  lead_time: string | null;
  reasks_tyler: boolean;
};

export type FixBy = { ct: string; utc: string; reason: "not_after" | "copy_window" | "promise" | "dependent_start" };

export type Problem = {
  code: string;
  tier: Tier;
  ref: string | null;
  message: string;
  impact: string | null;
  resumes: "auto" | "on_resume" | "never";
  fixer: Fixer;
  fix_by: FixBy | null;
  claimed_by: { by: string; until: string; eta: string | null } | null;
  tyler_told: TylerTold | null;
  next: Next[];
  // check.file findings also carry where the problem is.
  file?: string;
  path?: string;
  fix?: { text: string; fix_type: string; who: string; lead_time: string | null; safe: boolean };
};

export type TylerTold = {
  emailed_at: string | null;
  incident: string | null;
  in_digest: boolean;
  relayed_by: string | null;
  relayed_at: string | null;
};

export type RelayFact = { priority: number; text: string; needs_tyler: boolean; link: string | null };

export type Output = {
  contract: typeof OUTPUT_CONTRACT;
  command: string;
  ok: boolean;
  exit: number;
  verdict: { text: string; behind: string | null; ahead: string | null };
  as_of: { ct: string; utc: string };
  subject: { series: string | null; ref: string | null; resolved_from: string | null };
  data: Record<string, unknown>;
  problems: Problem[];
  next: Next[];
  apply: { token: string; expires_at: { ct: string; utc: string } | null; cmd: string; effect_sha: string } | null;
  relay: { text: string; facts: RelayFact[] };
  tyler_told: TylerTold[] | null;
  links: { page: string | null };
  text: string;
};

export const EXIT = {
  ok: 0,
  usage: 1,
  file_errors: 2,
  needs_tyler: 3,
  held: 4,
  refused: 5,
  transient: 6,
  token_stale: 7,
  needs_agent: 8,
} as const;

export function problem(input: Partial<Problem> & Pick<Problem, "code" | "tier" | "message">): Problem {
  return {
    ref: null,
    impact: null,
    resumes: input.tier === "transient" ? "auto" : "never",
    fixer: "none",
    fix_by: null,
    claimed_by: null,
    tyler_told: null,
    next: [],
    ...input,
  };
}

export function next(cmd: string, why: string, who = "agent", fix_type: NextKind = "command", lead_time: string | null = null, reasks_tyler = false): Next {
  return { cmd, why, who, fix_type, lead_time, reasks_tyler };
}

/** Reads exit by their verdict, with precedence 4 > 3 > 8 > 0 (refusals and transients win outright). */
export function exitForProblems(problems: readonly Problem[]): number {
  if (problems.some((entry) => entry.tier === "refuse")) {
    return problems.some((entry) => entry.code === "refuse.token_stale") ? EXIT.token_stale : EXIT.refused;
  }
  if (problems.some((entry) => entry.tier === "transient")) return EXIT.transient;
  if (problems.some((entry) => entry.tier === "hold")) return EXIT.held;
  if (problems.some((entry) => entry.fixer === "tyler" && entry.tier !== "warn")) return EXIT.needs_tyler;
  if (problems.some((entry) => (entry.fixer === "agent" || entry.fixer.startsWith("owner:")) && entry.tier !== "warn")) return EXIT.needs_agent;
  return EXIT.ok;
}

export function pageLink(series: string | null, extra: Record<string, string> = {}): string | null {
  if (!series) return null;
  const query = Object.entries({ s: series, ...extra })
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  return `${PAGE_BASE}&${query}`;
}

function fmtNext(entry: Next): string {
  const tail = [entry.who, entry.fix_type === "command" ? null : entry.fix_type, entry.lead_time].filter(Boolean).join(" · ");
  return `${entry.cmd}${tail ? `   (${tail})` : ""}`;
}

export type BuildInput = {
  command: string;
  now: Date;
  verdict: string | { text: string; behind?: string | null; ahead?: string | null };
  subject?: Partial<Output["subject"]>;
  body?: string[];
  data?: Record<string, unknown>;
  problems?: Problem[];
  next?: Next[];
  apply?: Output["apply"];
  relay?: { text: string; facts?: RelayFact[] } | null;
  tyler_told?: TylerTold[] | null;
  exit?: number;
  ok?: boolean;
  page?: string | null;
};

/** Builds the payload and its text twin from the same values, so the two can never disagree. */
export function buildOutput(input: BuildInput): Output {
  const problems = input.problems ?? [];
  const exit = input.exit ?? exitForProblems(problems);
  const verdict = typeof input.verdict === "string" ? { text: input.verdict, behind: null, ahead: null } : { behind: null, ahead: null, ...input.verdict };
  const nexts = input.next ?? problems.flatMap((entry) => entry.next);
  const relayFacts = input.relay?.facts ?? [];
  const relayText = input.relay?.text?.trim() || "none needed";
  const series = input.subject?.series ?? null;
  const page = input.page === undefined ? pageLink(series) : input.page;
  const lines: string[] = [`${verdict.text} · exit ${exit}`];
  lines.push(...(input.body ?? []));
  for (const entry of problems) {
    lines.push(`${entry.tier.toUpperCase()} ${entry.code}${entry.ref ? ` · ${entry.ref}` : ""} · ${entry.message}`);
    if (entry.impact) lines.push(`    impact: ${entry.impact}`);
    if (entry.fix_by) lines.push(`    fix by ${entry.fix_by.ct} (${entry.fix_by.reason}) · fixer: ${entry.fixer}`);
    else if (entry.fixer !== "none") lines.push(`    fixer: ${entry.fixer} · resumes: ${entry.resumes}`);
    if (entry.fix) lines.push(`    fix: ${entry.fix.text}   (who: ${entry.fix.who} · ${entry.fix.fix_type}${entry.fix.lead_time ? ` · ${entry.fix.lead_time}` : ""})`);
    if (entry.claimed_by) lines.push(`    claimed by ${entry.claimed_by.by} until ${entry.claimed_by.until}`);
  }
  if (input.apply) {
    lines.push(`apply: ${input.apply.cmd}${input.apply.expires_at ? ` (token expires ${input.apply.expires_at.ct})` : ""}`);
  }
  if (nexts.length > 0) {
    lines.push(`next: ${fmtNext(nexts[0]!)}`);
    for (const entry of nexts.slice(1)) lines.push(`      ${fmtNext(entry)}`);
  }
  for (const fact of relayFacts) {
    if (!relayText.includes(fact.text)) lines.push(`fact: ${fact.text}`);
  }
  lines.push(`relay: ${relayText}`);
  return {
    contract: OUTPUT_CONTRACT,
    command: input.command,
    ok: input.ok ?? (exit !== EXIT.refused && exit !== EXIT.token_stale && exit !== EXIT.usage && exit !== EXIT.transient),
    exit,
    verdict,
    as_of: asOf(input.now),
    subject: { series, ref: input.subject?.ref ?? null, resolved_from: input.subject?.resolved_from ?? null },
    data: input.data ?? {},
    problems,
    next: nexts,
    apply: input.apply ?? null,
    relay: { text: relayText, facts: relayFacts },
    tyler_told: input.tyler_told ?? null,
    links: { page },
    text: lines.join("\n"),
  };
}

/** A refusal or usage error as a full output (ok:false), never a throw. */
export function refusal(command: string, now: Date, entry: Problem, subject?: Partial<Output["subject"]>, exit?: number): Output {
  return buildOutput({
    command,
    now,
    verdict: `${subject?.ref ?? subject?.series ?? command} · refused · ${entry.message}`,
    subject,
    problems: [entry],
    exit: exit ?? (entry.tier === "refuse" ? exitForProblems([entry]) : entry.tier === "transient" ? EXIT.transient : EXIT.usage),
    ok: false,
  });
}

export function usage(command: string, now: Date, message: string, fixText?: string): Output {
  return refusal(
    command,
    now,
    problem({ code: "usage.params", tier: "error", message, next: fixText ? [next(fixText, "the accepted form", "agent", "command")] : [] }),
    undefined,
    EXIT.usage,
  );
}

/** Plural-safe "R of P" with thousands separators. */
export function rOfP(received: number, planned: number): string {
  return `${received.toLocaleString("en-US")} of ${planned.toLocaleString("en-US")}`;
}

export function num(value: number): string {
  return value.toLocaleString("en-US");
}

/** Pads columns so a table body reads aligned in a terminal. */
export function table(rows: string[][]): string[] {
  const widths: number[] = [];
  for (const row of rows) row.forEach((cell, index) => (widths[index] = Math.max(widths[index] ?? 0, cell.length)));
  return rows.map((row) => row.map((cell, index) => (index === row.length - 1 ? cell : cell.padEnd(widths[index]!))).join("  ").trimEnd());
}

/** HR-21 guard: nothing this app renders may contain an address. Throws so a test catches it. */
export function assertNoAddress(text: string): void {
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+/.test(text)) {
    throw new Error("sequences render guard: output contains something shaped like an email address");
  }
}
