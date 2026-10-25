// One reference generated from the same tables the server uses (`seqctl help`): code playbooks,
// step-type cheat sheets, the sources catalog, the grammars, and each command's output schema.
import { PLANNED_SOURCE_ROUTES, RELEASED_SOURCE_ROUTES } from "./catalog.js";
import { EXIT } from "./output.js";
import { OUTPUT_SCHEMA, SEQUENCE_SCHEMA } from "./schemas.js";
import { PHASE_DATES, PHASE_OF_DO } from "./states.js";

export type Playbook = { meaning: string; exit: number; resumes: string; fixer: string; do: string[]; never: string[] };

export const PLAYBOOKS: Record<string, Playbook> = {
  "hold.source_stale": {
    meaning: "An ops sources route answered without its contract (as_of, sha256, count, rows) or with 503: the step that needs it waits.",
    exit: EXIT.held,
    resumes: "auto",
    fixer: "whoever owns the source (desk or agent)",
    do: ["seqctl check <series>   (each source's age and next use)", "seqctl explain src:<name>"],
    never: ["read the ops database directly", "count a missing source as 'nobody'"],
  },
  "refuse.not_engine_owned": {
    meaning: "The engine does not run this step: another owner does (the Mac or the review sender), or the step type arrives in a later phase.",
    exit: EXIT.refused,
    resumes: "never",
    fixer: "owner",
    do: ["seqctl explain <ref>   (prints the owner and its evidence)", "the owner's runbook (the Mac's morning_runner, the review sender's settings)"],
    never: ["run the Mac's step from the server this week"],
  },
  "refuse.ambiguous_ref": {
    meaning: "A short ref matched several steps. Refs are never guessed.",
    exit: EXIT.refused,
    resumes: "never",
    fixer: "agent",
    do: ["type the full ref, e.g. review-giveaway-2026-10/g3.draw_2"],
    never: ["pick one of the candidates for the person"],
  },
  "refuse.wildcard_required": { meaning: "This command acts on one ref; several instances need an explicit wildcard command (P2).", exit: EXIT.refused, resumes: "never", fixer: "agent", do: ["name one ref"], never: [] },
  "refuse.token_stale": {
    meaning: "The state moved since the preview: the plan token no longer matches what apply would do.",
    exit: EXIT.token_stale,
    resumes: "never",
    fixer: "agent",
    do: ["run the preview again and apply with its new pt_… token"],
    never: ["reuse an old token"],
  },
  "refuse.series_not_registered": { meaning: "A drawing push arrived before the series exists.", exit: EXIT.refused, resumes: "never", fixer: "agent", do: ["sequences_import.py --all (scope full) first"], never: [] },
  "refuse.address_in_bundle": { meaning: "The bundle carries an '@' or contact keys: ids, hashes and counts only (HR-21).", exit: EXIT.refused, resumes: "never", fixer: "agent", do: ["fix the client: delete contact on load, hash free entries in memory"], never: ["send the bundle by another path"] },
  "refuse.replan_needs_p2": { meaning: "The series file changed after registration; re-plans arrive with P2 (seqctl change).", exit: EXIT.refused, resumes: "never", fixer: "agent", do: ["leave the registered file as is until P2"], never: [] },
  "refuse.drawing_changed": { meaning: "A re-pushed drawing differs from the imported one in more than appended promotions.", exit: EXIT.refused, resumes: "never", fixer: "agent", do: ["seqctl explain <ref> and compare the receipts"], never: ["edit a receipt after its drawing"] },
  "refuse.dst_ambiguous_time": { meaning: "The time happens twice on 11/1 (01:00-01:59).", exit: EXIT.refused, resumes: "never", fixer: "agent", do: ["add CDT or CST"], never: [] },
  "check.field_kind_forbidden": { meaning: "No data schema carries a property named kind (NX-P17); the step type is `do`, a bundle's is `scope`, a note's is `note`.", exit: EXIT.file_errors, resumes: "never", fixer: "agent", do: ["rename the field"], never: [] },
  "check.yaml_bool_key": { meaning: "PyYAML (YAML 1.1) read a bare on/off/yes/no key as a boolean.", exit: EXIT.file_errors, resumes: "never", fixer: "agent", do: ["quote the key: 'on': lunair_cover"], never: [] },
  "check.copy_not_approved": { meaning: "PENDING: Casey's APPROVED entry for this message is not on main; only submit and arming wait.", exit: EXIT.ok, resumes: "never", fixer: "casey", do: ["Casey approves it in APPROVED, by PR (~1 day)"], never: ["send unapproved copy"] },
  "check.source_route_missing": { meaning: "PENDING: the named ops sources route ships with a later API train.", exit: EXIT.ok, resumes: "never", fixer: "agent", do: ["ops API PR plus the API train (~1 day)"], never: [] },
  A1: { meaning: "Late: an engine Run did not start, or an owner's evidence did not arrive, by due + grace (10 m; draws 15 m).", exit: EXIT.needs_agent, resumes: "auto", fixer: "agent, then the step's owner", do: ["seqctl explain <alert>", "seqctl told <alert> --note '<what you told Tyler>'"], never: ["run the owner's step yourself"] },
  A2: { meaning: "A sequences Run is quarantined, held, failed or dead-lettered, or a Run's claim was refused (a requeued or duplicate Run).", exit: EXIT.needs_agent, resumes: "on_resume", fixer: "agent (operator controls)", do: ["read the Run: nexus runtime call jobs.runs.get --params '{\"id\":\"<run>\"}'", "never requeue a sequences Run: the handler refuses it"], never: ["jobs.requeue", "jobs.invoke by hand (NX-P8)"] },
  A4: { meaning: "Short of target after settle, or the shadow drawing did not reproduce the Mac's.", exit: EXIT.needs_agent, resumes: "auto", fixer: "agent", do: ["seqctl explain <ref>", "seqctl audit --step <ref>"], never: ["resend without Tyler's yes"] },
  A9: { meaning: "The audience is above its approved band.", exit: EXIT.needs_tyler, resumes: "on_resume", fixer: "tyler", do: ["seqctl explain <ref>"], never: [] },
  A11: { meaning: "An expected Mac drawing is not imported by 09:30 on its morning (this week only).", exit: EXIT.needs_agent, resumes: "auto", fixer: "agent", do: ["on the Mac: python3 -I scripts/sequences_import.py --drawing <night>-<n> --push, then --apply <pt_…>"], never: ["draw on the server this week"] },
  A13: { meaning: "The tick heartbeat was older than 3 minutes; the off-host dead-man pages on it.", exit: EXIT.needs_agent, resumes: "auto", fixer: "agent", do: ["seqctl check engine", "site-ctl nex last-scheduled-run (on the site, read-only)"], never: ["jobs invoke the tick by hand (NX-P8)"] },
};

export function helpTopic(topic: string): { title: string; lines: string[]; data: Record<string, unknown> } | null {
  const key = topic.trim();
  if (key === "" || key === "index") {
    return {
      title: "seqctl help",
      lines: [
        "topics: <code> · <do> · sources · refs · times · phases · output <command> · codes",
        `P1b verbs: brief, timeline, explain, audit --step, check, watch (polls events), help, take, told`,
        `everything else arrives in P2 (${PHASE_DATES.P2})`,
      ],
      data: { topics: ["codes", "sources", "refs", "times", "phases", "output"], codes: Object.keys(PLAYBOOKS) },
    };
  }
  if (key === "codes") return { title: "codes", lines: Object.entries(PLAYBOOKS).map(([code, book]) => `${code.padEnd(30)} exit ${book.exit} · ${book.meaning}`), data: { codes: PLAYBOOKS } };
  const book = PLAYBOOKS[key];
  if (book) {
    return {
      title: `${key} · exit ${book.exit} · resumes: ${book.resumes} · fixer: ${book.fixer}`,
      lines: [book.meaning, ...book.do.map((line) => `do     ${line}`), ...book.never.map((line) => `never  ${line}`)],
      data: { code: key, ...book },
    };
  }
  const defs = SEQUENCE_SCHEMA.$defs as Record<string, Record<string, unknown>>;
  const def = defs[`do_${key}`];
  if (def) {
    const properties = Object.keys((def.properties as Record<string, unknown>) ?? {});
    return {
      title: `do: ${key} · ${PHASE_OF_DO[key] ?? "P5"} (${PHASE_OF_DO[key] === "P1b" ? "live now" : `engine-run from ${PHASE_OF_DO[key] ?? "P5"}`})`,
      lines: [String(def.description ?? ""), `required: ${((def.required as string[]) ?? []).join(", ")}`, `fields: ${properties.join(", ")}`, `outputs: ${((def["x-outputs"] as string[]) ?? []).join(", ") || "none"}`],
      data: { do: key, schema: def },
    };
  }
  if (key === "sources") {
    return {
      title: "ops sources routes (https://ops.moonsleep.co/api/sequences/sources/<name>)",
      lines: [
        ...Object.entries(RELEASED_SOURCE_ROUTES).map(([name, route]) => `${name.padEnd(34)} P1b  ?${route.params.join("&") || "-"}  ${route.what}`),
        ...Object.entries(PLANNED_SOURCE_ROUTES).map(([name, phase]) => `${name.padEnd(34)} ${phase}`),
        "every answer: {contract: sequences_sources_v1, as_of, sha256, count, rows}; hashes and counts only",
      ],
      data: { released: RELEASED_SOURCE_ROUTES, planned: PLANNED_SOURCE_ROUTES },
    };
  }
  if (key === "refs") return { title: "refs", lines: ["<series>/<instance>.<step>[/<item>.<childstep>]", "a short <instance>.<step> resolves only when unique; otherwise refuse.ambiguous_ref lists the candidates", "several instances need an explicit wildcard (g*.codes), P2"], data: {} };
  if (key === "times") {
    return {
      title: "times (in the sequence's IANA zone, America/Chicago)",
      lines: ["'night+N HH:MM[:SS]' e.g. night+3 23:59:59", "'YYYY-MM-DD HH:MM [CDT|CST]' (11/1 01:00-01:59 needs the suffix)", "'<step>.first_post + 24h', '<step>.delivered_at(<person>)'", "'<instant> + N days HH:MM:SS' counted in wall dates, safe across 11/1"],
      data: {},
    };
  }
  if (key === "phases") return { title: "phases", lines: Object.entries(PHASE_DATES).map(([phase, date]) => `${phase}  ${date}`), data: { phase_of_do: PHASE_OF_DO, dates: PHASE_DATES } };
  if (key.startsWith("output")) return { title: "output contract (sequences_output_v1), the same keys on every command", lines: ["data: the command's own payload; the rest is shared", "next[].fix_type is the ax draft's next[].kind (NX-P17)"], data: { schema: OUTPUT_SCHEMA } };
  return null;
}
