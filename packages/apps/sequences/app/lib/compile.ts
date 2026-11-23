// compileDefinition: a PyYAML-normalized sequence file -> {normalized, definition_sha256, problems}.
// compileSeries: a series file against its registered definition -> {normalized, series sha, problems}.
// Only the P1b semantic checks run (ax q15). Tiers: ERROR refuses registration, PENDING blocks only
// submit and arming (copy with Casey, a route not yet released), WARN is advice.
import { sourceRouteStatus, PLANNED_SOURCE_ROUTES } from "./catalog.js";
import { problem, type Problem } from "./output.js";
import { SEQUENCE_SCHEMA, SERIES_SCHEMA } from "./schemas.js";
import { definitionSha, jcsSha256, SHA256_RE } from "./sha.js";
import { PHASE_DATES, PHASE_OF_DO, RELEASE_PHASE, type Owner } from "./states.js";
import { DEFAULT_TZ, TimeError, checkDate, evalTimeExpr, parseTimeExpr, parseWindow, type TimeExpr, type TimeScope } from "./time.js";
import { findBooleanKeys, findKindFields, findSql, validateSchema, type SchemaError } from "./validate.js";

type Json = Record<string, unknown>;

export type Message = {
  template: string;
  sha256: string;
  campaign_name?: string;
  flow?: string;
  metric: string;
  consent: string;
  says?: Record<string, string>;
  late?: string;
  promises?: Array<{ says?: string; step: string; by: string }>;
  states?: Array<{ says?: string; needs: string }>;
  fills?: string[];
};

export type Step = Json & {
  id: string;
  do: string;
  after: string[];
  after_any?: string[];
  late: { grace: string; then: string; after_that?: string };
  at?: string;
  not_before?: string;
  not_after?: string;
  window?: string;
  message?: string;
  exclude?: string[];
  closes?: string;
};

export type Definition = {
  sequence: string;
  revision?: number;
  title?: string;
  timezone: string;
  program?: string;
  needs?: { rules_page?: { url: string; content_sha256?: string }; entry_window_utc?: [string, string]; last_night?: string; prize_scope?: string };
  params: Record<string, string>;
  sources: Record<string, { from: string; max_age?: string; warn_before_due?: string; scope?: string }>;
  exclude_sets: Record<string, string[]>;
  messages: Record<string, Message>;
  defaults: { owner: Owner; send: Json & { window: string; settle_gate: string }; late: { grace: string; then: string } };
  steps: Step[];
};

export type CompileResult<T> = { normalized: T; sha256: string; problems: Problem[]; ok: boolean };

const SAMPLE_NIGHT = "2026-01-14"; // a date far from any clock change, for relative-time checks
const PLACEHOLDER_RE = /^<.*>$/;

function err(code: string, message: string, path: string, file?: string, fixText?: string, fixWho = "agent"): Problem {
  return problem({ code, tier: "error", message, path, ...(file ? { file } : {}), ...(fixText ? { fix: { text: fixText, fix_type: "edit", who: fixWho, lead_time: null, safe: false } } : {}) });
}
function pending(code: string, message: string, path: string, file: string | undefined, fixText: string, who: string, leadTime: string | null): Problem {
  return problem({ code, tier: "pending", message, path, ...(file ? { file } : {}), fixer: who === "casey" ? "casey" : who === "tyler" ? "tyler" : "agent", fix: { text: fixText, fix_type: who === "casey" ? "edit" : "code_release", who, lead_time: leadTime, safe: false } });
}
function warn(code: string, message: string, path: string, file?: string): Problem {
  return problem({ code, tier: "warn", message, path, ...(file ? { file } : {}) });
}

function schemaProblems(errors: SchemaError[], file?: string): Problem[] {
  return errors.map((error) => err("check.schema", `${error.path}: ${error.message}`, error.path, file));
}

function hygieneProblems(body: unknown, file?: string): Problem[] {
  return [
    ...findBooleanKeys(body).map((path) =>
      err("check.yaml_bool_key", `${path}: a bare on/off/yes/no key was read as a boolean by YAML 1.1`, path, file, "quote the key ('on': …, 'off': …)"),
    ),
    ...findKindFields(body).map((path) => err("check.field_kind_forbidden", `${path}: no field may be named kind (NX-P17); the step-type field is do`, path, file, "rename the field")),
  ];
}

const asArray = (value: unknown): string[] => (value === undefined ? [] : Array.isArray(value) ? value.map(String) : [String(value)]);
const stepOf = (text: string) => text.trim().split(/[\s.(]/)[0]!;

/** Every step a step depends on: explicit after/after_any plus the steps its fields read from. */
export function dependencies(step: Step): { explicit: string[]; implicit: string[]; settled: string[] } {
  const explicit = step.after.map(stepOf);
  const settled = step.after.filter((entry) => /\ssettled$/.test(entry)).map(stepOf);
  const implicit = new Set<string>(asArray(step.after_any).map(stepOf));
  const refField = (value: unknown) => {
    if (typeof value === "string" && /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(value)) implicit.add(stepOf(value));
  };
  const audience = step.audience;
  if (typeof audience === "string") refField(audience);
  else if (Array.isArray(audience)) audience.forEach(refField);
  else if (audience && typeof audience === "object" && typeof (audience as Json).members_of === "string") implicit.add(String((audience as Json).members_of));
  refField(step.each);
  for (const value of Object.values((step.fills as Json | undefined) ?? {})) refField(value);
  const entrants = step.entrants as Json | undefined;
  if (entrants) {
    if (typeof entrants.members_of === "string") implicit.add(entrants.members_of);
    for (const name of asArray(entrants.free_entries)) implicit.add(name);
  }
  if (typeof step.from_members_of === "string") implicit.add(step.from_members_of);
  // A time that reads another step's event ("night_ask.first_post + 24h", "desk_row.closes").
  for (const field of ["not_before", "not_after", "at", "deadline"]) {
    const value = step[field];
    if (typeof value === "string" && /^[a-z][a-z0-9_]*\.[a-z_]+/.test(value.trim())) implicit.add(stepOf(value));
  }
  for (const name of explicit) implicit.delete(name);
  return { explicit, implicit: [...implicit], settled };
}

function normalizeDefinition(body: Json): Definition {
  const defaults = (body.defaults as Json | undefined) ?? {};
  const late = { grace: "10m", then: "hold", ...((defaults.late as Json | undefined) ?? {}) } as Definition["defaults"]["late"];
  const send = { window: "09:00-21:00", settle_gate: "30m", ...((defaults.send as Json | undefined) ?? {}) } as Definition["defaults"]["send"];
  const steps = ((body.steps as Json[]) ?? []).map((raw) => {
    const step: Json = { ...raw, after: asArray(raw.after), late: { ...late, ...((raw.late as Json | undefined) ?? {}) } };
    if (raw.exclude !== undefined) step.exclude = asArray(raw.exclude);
    if (raw.do === "send_flow_event" && raw.window === undefined) step.window = send.window;
    return step as Step;
  });
  return {
    ...(body as unknown as Definition),
    timezone: typeof body.timezone === "string" ? body.timezone : DEFAULT_TZ,
    params: (body.params as Record<string, string> | undefined) ?? {},
    sources: (body.sources as Definition["sources"] | undefined) ?? {},
    exclude_sets: (body.exclude_sets as Definition["exclude_sets"] | undefined) ?? {},
    messages: (body.messages as Definition["messages"] | undefined) ?? {},
    defaults: { owner: ((defaults.owner as Owner | undefined) ?? "engine"), send, late },
    steps,
  };
}

function sampleScope(def: Definition): TimeScope {
  const dates: Record<string, string> = {};
  for (const [name, type] of Object.entries(def.params)) if (type === "date") dates[name] = SAMPLE_NIGHT;
  return { tz: def.timezone, dates };
}

/** Every time expression in a step, with its JSON path. */
function stepTimes(step: Step, index: number): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  const base = `/steps/${index}`;
  for (const field of ["at", "not_before", "not_after", "closes", "ask_by", "deadline", "due"]) {
    if (typeof step[field] === "string") out.push({ path: `${base}/${field}`, text: step[field] as string });
  }
  asArray(step.between).forEach((text, i) => out.push({ path: `${base}/between/${i}`, text }));
  return out;
}

export function compileDefinition(body: unknown, file?: string): CompileResult<Definition> {
  const problems: Problem[] = hygieneProblems(body, file);
  const errors = validateSchema(SEQUENCE_SCHEMA, body);
  problems.push(...schemaProblems(errors, file));
  problems.push(...findSql(body).map((path) => err("check.sql_forbidden", `${path}: a definition never carries SQL; name an ops sources route`, path, file)));
  if (errors.length > 0 || !body || typeof body !== "object") {
    return { normalized: body as Definition, sha256: "", problems, ok: false };
  }
  const def = normalizeDefinition(body as Json);
  const byId = new Map<string, Step>();
  def.steps.forEach((step, index) => {
    if (byId.has(step.id)) problems.push(err("check.duplicate_id", `step id '${step.id}' is used twice`, `/steps/${index}/id`, file));
    byId.set(step.id, step);
  });
  const known = (name: string) => byId.has(name) || name in def.params;
  const scope = sampleScope(def);
  const dateParams = Object.entries(def.params).filter(([, type]) => type === "date").map(([name]) => name);

  // Time expressions parse, and every step they name exists.
  const parsedAt = new Map<string, TimeExpr>();
  def.steps.forEach((step, index) => {
    for (const { path, text } of stepTimes(step, index)) {
      try {
        const expr = parseTimeExpr(text, dateParams);
        if ((expr.type === "ref" || expr.type === "ref_days") && !known(expr.step)) {
          problems.push(err("check.unknown_ref", `${path}: '${expr.step}' is not a step or param`, path, file));
        }
        if (path.endsWith("/at")) parsedAt.set(step.id, expr);
      } catch (error) {
        problems.push(err(error instanceof TimeError ? error.code : "check.time_format", `${path}: ${(error as Error).message}`, path, file));
      }
    }
    if (typeof step.window === "string") {
      try {
        parseWindow(step.window);
      } catch (error) {
        problems.push(err("check.time_format", `/steps/${index}/window: ${(error as Error).message}`, `/steps/${index}/window`, file));
      }
    }
  });

  // References and the dependency graph.
  const graph = new Map<string, string[]>();
  def.steps.forEach((step, index) => {
    const deps = dependencies(step);
    for (const name of [...deps.explicit, ...deps.implicit]) {
      if (!known(name)) problems.push(err("check.unknown_ref", `step '${step.id}' refers to '${name}', which is not a step or param`, `/steps/${index}`, file));
    }
    graph.set(step.id, [...deps.explicit, ...deps.implicit].filter((name) => byId.has(name)));
    if (step.message !== undefined && !(step.message in def.messages)) {
      // A spawned child (prize-claim) has no messages of its own: its parent's resolve them.
      if ((body as Json).messages === undefined) {
        problems.push(warn("check.messages_from_parent", `step '${step.id}' sends '${step.message}', resolved from the parent that spawns this sequence`, `/steps/${index}/message`, file));
      } else {
        problems.push(err("check.unknown_ref", `step '${step.id}' sends message '${step.message}', which is not in messages`, `/steps/${index}/message`, file));
      }
    }
    for (const name of step.exclude ?? []) {
      if (name !== "consent_only" && !(name in def.exclude_sets) && !(name in def.sources)) {
        problems.push(err("check.unknown_ref", `step '${step.id}' excludes '${name}', which is neither an exclude set nor a source`, `/steps/${index}/exclude`, file));
      }
    }
    if (step.do === "send_flow_event" && (step.exclude ?? []).length === 0) {
      problems.push(err("check.exclude_missing", `send step '${step.id}' declares no exclude (a set, or consent_only)`, `/steps/${index}`, file, "add exclude: <set> or exclude: consent_only"));
    }
    if (step.do === "send_flow_event") {
      const missing = ["target", "on_partial"].filter((field) => step[field] === undefined);
      if (missing.length > 0) problems.push(warn("check.send_incomplete", `send step '${step.id}' has no ${missing.join(" or ")} (an ERROR for engine-owned sends from P2)`, `/steps/${index}`, file));
    }
    if (step.do === "task" && asArray(step.guards).length > 0 && !step.verify) {
      problems.push(err("check.task_guards_send_unverified", `task '${step.id}' guards ${asArray(step.guards).join(", ")} but has no verify read`, `/steps/${index}`, file));
    }
    const expect = step.expect as Json | undefined;
    if (expect && expect.at_most !== undefined && expect.count !== undefined) {
      problems.push(err("check.schema", `step '${step.id}': expect takes {count, within} or {at_most}, not both`, `/steps/${index}/expect`, file));
    }
    if (expect && typeof expect.count === "string" && !(expect.count in def.params)) {
      problems.push(err("check.unknown_ref", `step '${step.id}': expect.count '${expect.count}' is not a param`, `/steps/${index}/expect/count`, file));
    }
    if (step.do === "agent" && !def.steps.some((other) => dependencies(other).explicit.includes(step.id) && ["approval", "assert", "wait_for"].includes(other.do))) {
      problems.push(warn("check.agent_output_unconsumed", `agent step '${step.id}' feeds no approval or deterministic gate`, `/steps/${index}`, file));
    }
  });
  const visiting = new Set<string>();
  const done = new Set<string>();
  const cycleAt = (id: string, trail: string[]): string[] | null => {
    if (done.has(id)) return null;
    if (visiting.has(id)) return [...trail.slice(trail.indexOf(id)), id];
    visiting.add(id);
    for (const dep of graph.get(id) ?? []) {
      const found = cycleAt(dep, [...trail, id]);
      if (found) return found;
    }
    visiting.delete(id);
    done.add(id);
    return null;
  };
  for (const id of graph.keys()) {
    const cycle = cycleAt(id, []);
    if (cycle) {
      problems.push(err("check.cycle", `steps depend on each other in a loop: ${cycle.join(" -> ")}`, "/steps", file));
      break;
    }
  }

  // Sources are named routes; exclude sets name sources.
  for (const [name, source] of Object.entries(def.sources)) {
    const status = sourceRouteStatus(source.from);
    if (status === "unknown") problems.push(err("check.source_unknown", `source '${name}' names route '${source.from}', which the ops sources API does not have`, `/sources/${name}/from`, file));
    if (status === "planned") {
      problems.push(pending("check.source_route_missing", `source '${name}' needs route '${source.from}', which arrives with ${PLANNED_SOURCE_ROUTES[source.from]}`, `/sources/${name}/from`, file, "ops API PR plus the API train with the exact-sha preflight", "agent + Codex", "~1 day"));
    }
  }
  for (const [name, members] of Object.entries(def.exclude_sets)) {
    for (const member of members) if (!(member in def.sources)) problems.push(err("check.unknown_ref", `exclude set '${name}' names '${member}', which is not a source`, `/exclude_sets/${name}`, file));
  }

  // Messages: late variants, says-windows, promises and stated facts.
  const stepsUsing = (message: string) => def.steps.filter((step) => step.message === message);
  const dependsOn = (from: string, target: string): boolean => {
    const seen = new Set<string>();
    const stack = [...(graph.get(from) ?? [])];
    while (stack.length > 0) {
      const next = stack.pop()!;
      if (next === target) return true;
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(...(graph.get(next) ?? []));
    }
    return false;
  };
  const instantOf = (stepId: string, seen = new Set<string>()): Date | null => {
    if (seen.has(stepId)) return null;
    seen.add(stepId);
    const expr = parsedAt.get(stepId);
    if (expr) {
      try {
        return evalTimeExpr(expr, scope);
      } catch {
        return null;
      }
    }
    const step = byId.get(stepId);
    if (!step) return null;
    const times = dependencies(step).explicit.map((dep) => instantOf(dep, seen));
    if (times.length === 0 || times.some((time) => time === null)) return null;
    return new Date(Math.max(...times.map((time) => time!.getTime())));
  };
  for (const [name, message] of Object.entries(def.messages)) {
    const path = `/messages/${name}`;
    if (message.late !== undefined && !(message.late in def.messages)) problems.push(err("check.unknown_ref", `message '${name}' names late variant '${message.late}', which is not a message`, `${path}/late`, file));
    for (const [phrase, window] of Object.entries(message.says ?? {})) {
      try {
        parseWindow(window);
      } catch (error) {
        problems.push(err("check.time_format", `${path}/says/${phrase}: ${(error as Error).message}`, `${path}/says`, file));
      }
    }
    if (message.says && Object.keys(message.says).length > 0 && !message.late) {
      for (const step of stepsUsing(name)) {
        const window = typeof step.window === "string" ? parseWindow(step.window) : null;
        const covered = window && Object.values(message.says).some((says) => {
          const allowed = parseWindow(says);
          return window.from >= allowed.from && window.to <= allowed.to;
        });
        if (!covered) {
          problems.push(err("check.says_window_uncovered", `step '${step.id}' can send '${name}' outside its time words (${Object.keys(message.says).join(", ")}) and the message has no late variant`, path, file, "narrow the step's window, or add a late: variant"));
        }
      }
    }
    for (const [index, promise] of (message.promises ?? []).entries()) {
      if (!byId.has(promise.step)) {
        problems.push(err("check.unknown_ref", `message '${name}' promises step '${promise.step}', which is not a step`, `${path}/promises/${index}`, file));
        continue;
      }
      let by: Date | null = null;
      try {
        by = evalTimeExpr(parseTimeExpr(promise.by, dateParams), scope);
      } catch (error) {
        problems.push(err("check.time_format", `${path}/promises/${index}/by: ${(error as Error).message}`, `${path}/promises/${index}/by`, file));
        continue;
      }
      const due = instantOf(promise.step);
      if (!by || !due) problems.push(warn("check.promise_unverifiable", `message '${name}': the promise on '${promise.step}' depends on a time not known until it happens`, `${path}/promises/${index}`, file));
      else if (due.getTime() > by.getTime()) {
        problems.push(err("check.promise_unbacked", `message '${name}' promises '${promise.step}' by ${promise.by}, but the plan has it later`, `${path}/promises/${index}`, file));
      }
    }
    for (const [index, stated] of (message.states ?? []).entries()) {
      if (!byId.has(stated.needs)) {
        problems.push(err("check.unknown_ref", `message '${name}' states a fact from '${stated.needs}', which is not a step`, `${path}/states/${index}`, file));
        continue;
      }
      for (const step of stepsUsing(name)) {
        if (!dependsOn(step.id, stated.needs)) {
          problems.push(err("check.states_unbacked", `step '${step.id}' sends '${name}', whose copy states '${stated.says ?? stated.needs}', but it does not wait for '${stated.needs}'`, `${path}/states/${index}`, file, `add ${stated.needs} to the step's after`));
        }
      }
    }
    if (!SHA256_RE.test(message.sha256) && message.sha256 !== "observed" && !PLACEHOLDER_RE.test(message.sha256)) {
      problems.push(err("check.copy_sha_mismatch", `message '${name}': sha256 must be 64 hex, 'observed' or a <placeholder>`, `${path}/sha256`, file));
    }
  }

  // Drawings close before they run; the entry window is ordered.
  def.steps.forEach((step, index) => {
    if (step.do !== "draw" || typeof step.closes !== "string") return;
    try {
      const closes = evalTimeExpr(parseTimeExpr(step.closes, dateParams), scope);
      const at = instantOf(step.id);
      if (closes && at && closes.getTime() >= at.getTime()) {
        problems.push(err("check.draw_closes_after_at", `draw '${step.id}' closes at or after it runs`, `/steps/${index}/closes`, file));
      }
    } catch {
      /* reported above */
    }
  });
  const window = def.needs?.entry_window_utc;
  if (window && new Date(window[0]).getTime() >= new Date(window[1]).getTime()) {
    problems.push(err("check.entry_window_outside", "needs.entry_window_utc closes before it opens", "/needs/entry_window_utc", file));
  }
  if (def.needs?.last_night) {
    try {
      checkDate(def.needs.last_night);
    } catch (error) {
      problems.push(err("check.time_format", `/needs/last_night: ${(error as Error).message}`, "/needs/last_night", file));
    }
  }
  const rulesSha = def.needs?.rules_page?.content_sha256;
  if (def.needs?.rules_page && (!rulesSha || !SHA256_RE.test(rulesSha))) {
    problems.push(pending("check.rules_terms_missing", "needs.rules_page.content_sha256 is not filled", "/needs/rules_page/content_sha256", file, "seqctl check --fill <file> writes it from the live rules page", "agent", "~1 min"));
  }

  const ok = !problems.some((entry) => entry.tier === "error");
  return { normalized: def, sha256: ok ? definitionSha(def) : "", problems, ok };
}

// ---- series ---------------------------------------------------------------------------------------

export type Series = {
  series: string;
  sequence: string;
  title?: string;
  instances: Array<Json & { id: string }>;
  owners: Record<Owner, string[]>;
  runbooks: Partial<Record<Owner, string>>;
  adopt?: string;
  replan: Record<string, { at?: string; ask_by?: string; not_before?: string; not_after?: string }>;
  approvals?: Json;
  modes: { shadow: string[]; observe_live: string[]; adopt_from_import: boolean };
  evidence?: Json;
  ask?: { text: string; by: string; at: string; via: string };
  decisions?: Json[];
  rules?: Json;
  slip?: Record<string, { slip: string }>;
  material?: Json;
  tasks?: Json[];
};

export function ownerOf(def: Definition, series: Series, stepId: string): Owner {
  for (const owner of ["engine", "review_sender", "mac", "task"] as const) if (series.owners[owner].includes(stepId)) return owner;
  return def.defaults.owner;
}

/** Is this step's do something the engine runs in this release? */
export function liveInRelease(doName: string): boolean {
  const order = ["P1b", "P2", "P3", "P4", "P5"];
  return order.indexOf(PHASE_OF_DO[doName] ?? "P5") <= order.indexOf(RELEASE_PHASE);
}

export function compileSeries(def: Definition, definitionRevision: number, body: unknown, file?: string): CompileResult<Series> {
  const problems: Problem[] = hygieneProblems(body, file);
  const errors = validateSchema(SERIES_SCHEMA, body);
  problems.push(...schemaProblems(errors, file));
  if (errors.length > 0 || !body || typeof body !== "object") return { normalized: body as Series, sha256: "", problems, ok: false };
  const raw = body as Json;
  const owners = { engine: [], review_sender: [], mac: [], task: [] } as Record<Owner, string[]>;
  const runbooks: Partial<Record<Owner, string>> = {};
  for (const [owner, value] of Object.entries((raw.owners as Json | undefined) ?? {})) {
    if (Array.isArray(value)) owners[owner as Owner] = value.map(String);
    else {
      owners[owner as Owner] = asArray((value as Json).steps);
      if (typeof (value as Json).runbook === "string") runbooks[owner as Owner] = (value as Json).runbook as string;
    }
  }
  const modesRaw = (raw.modes as Json | undefined) ?? {};
  const series: Series = {
    ...(raw as unknown as Series),
    owners,
    runbooks,
    replan: (raw.replan as Series["replan"] | undefined) ?? {},
    modes: { shadow: asArray(modesRaw.shadow), observe_live: asArray(modesRaw.observe_live), adopt_from_import: modesRaw.adopt_from_import === true },
  };
  const stepIds = new Set(def.steps.map((step) => step.id));
  const expectedRef = `${def.sequence}@${definitionRevision}`;
  if (series.sequence !== expectedRef) {
    problems.push(err("check.unknown_ref", `series runs '${series.sequence}', but the registered definition is ${expectedRef}`, "/sequence", file));
  }

  const ids = new Set<string>();
  series.instances.forEach((instance, index) => {
    if (ids.has(instance.id)) problems.push(err("check.duplicate_id", `instance id '${instance.id}' is used twice`, `/instances/${index}/id`, file));
    ids.add(instance.id);
    for (const [name, type] of Object.entries(def.params)) {
      const value = instance[name];
      const path = `/instances/${index}/${name}`;
      if (value === undefined) {
        if (!["entry_ref", "step_ref"].includes(type)) problems.push(err("check.schema", `instance '${instance.id}' has no ${name} (${type})`, path, file));
        continue;
      }
      if (type === "date") {
        try {
          checkDate(String(value));
        } catch (error) {
          problems.push(err("check.time_format", `${path}: ${(error as Error).message}`, path, file));
        }
      }
      if (type === "int" && !Number.isInteger(value)) problems.push(err("check.schema", `${path}: must be an integer`, path, file));
    }
    for (const key of Object.keys(instance)) {
      if (key !== "id" && !(key in def.params)) problems.push(err("check.schema", `instance '${instance.id}' sets '${key}', which the definition has no param for`, `/instances/${index}/${key}`, file));
    }
    const lastNight = def.needs?.last_night;
    if (lastNight && typeof instance.night === "string" && instance.night > lastNight) {
      problems.push(err("check.last_night_exceeded", `instance '${instance.id}' night ${instance.night} is after needs.last_night ${lastNight}`, `/instances/${index}/night`, file));
    }
  });

  const seen = new Map<string, Owner>();
  for (const [owner, steps] of Object.entries(owners) as Array<[Owner, string[]]>) {
    for (const stepId of steps) {
      if (!stepIds.has(stepId)) problems.push(err("check.unknown_ref", `owners.${owner} names '${stepId}', which is not a step`, `/owners/${owner}`, file));
      const before = seen.get(stepId);
      if (before) problems.push(err("check.owner_conflict", `step '${stepId}' has two owners (${before}, ${owner}): one execution owner per step (EM-4)`, `/owners/${owner}`, file));
      seen.set(stepId, owner);
    }
  }
  const checkInstanceRef = (ref: string, path: string): { instance: string; step: string } | null => {
    const [instance, step] = ref.split(".");
    if (!ids.has(instance!) || !stepIds.has(step!)) {
      problems.push(err("check.unknown_ref", `${path}: '${ref}' is not <instance>.<step> of this series`, path, file));
      return null;
    }
    return { instance: instance!, step: step! };
  };
  for (const ref of series.modes.shadow) {
    const found = checkInstanceRef(ref, "/modes/shadow");
    const step = found && def.steps.find((entry) => entry.id === found.step);
    if (step && (step.do !== "draw" || ownerOf(def, series, step.id) === "engine")) {
      problems.push(err("check.schema", `/modes/shadow: '${ref}' must be a draw another owner runs`, "/modes/shadow", file));
    }
  }
  for (const ref of series.modes.observe_live) {
    const found = checkInstanceRef(ref, "/modes/observe_live");
    if (found && ownerOf(def, series, found.step) === "engine") problems.push(err("check.schema", `/modes/observe_live: '${ref}' is engine-owned; only another owner's step is observed`, "/modes/observe_live", file));
  }
  for (const [stepId, change] of Object.entries(series.replan)) {
    if (!stepIds.has(stepId)) problems.push(err("check.unknown_ref", `replan names '${stepId}', which is not a step`, `/replan/${stepId}`, file));
    for (const [field, text] of Object.entries(change)) {
      try {
        const expr = parseTimeExpr(String(text));
        if (expr.type !== "absolute" && expr.type !== "iso") throw new TimeError("check.time_format", "a re-plan time is absolute, e.g. 2026-11-02 09:00");
        evalTimeExpr(expr, { tz: def.timezone, dates: {} });
      } catch (error) {
        problems.push(err(error instanceof TimeError ? error.code : "check.time_format", `/replan/${stepId}/${field}: ${(error as Error).message}`, `/replan/${stepId}/${field}`, file));
      }
    }
  }
  for (const stepId of Object.keys(series.slip ?? {})) {
    if (!stepIds.has(stepId)) problems.push(err("check.unknown_ref", `slip names '${stepId}', which is not a step`, `/slip/${stepId}`, file));
  }
  for (const [index, task] of (series.tasks ?? []).entries()) {
    if (asArray(task.guards).length > 0 && !task.verify) problems.push(err("check.task_guards_send_unverified", `task '${String(task.id)}' guards a send but has no verify read`, `/tasks/${index}`, file));
  }

  // Draw closes inside the entry window, per instance.
  const entryWindow = def.needs?.entry_window_utc;
  if (entryWindow) {
    const [opens, closes] = entryWindow.map((text) => new Date(text).getTime());
    for (const instance of series.instances) {
      const dates: Record<string, string> = {};
      for (const [name, type] of Object.entries(def.params)) if (type === "date" && typeof instance[name] === "string") dates[name] = instance[name] as string;
      for (const step of def.steps.filter((entry) => entry.do === "draw" && typeof entry.closes === "string")) {
        try {
          const close = evalTimeExpr(parseTimeExpr(step.closes!, Object.keys(dates)), { tz: def.timezone, dates });
          if (close && (close.getTime() < opens! || close.getTime() > closes!)) {
            problems.push(err("check.entry_window_outside", `${instance.id}.${step.id} closes outside needs.entry_window_utc`, `/instances`, file));
          }
        } catch {
          /* time errors are the definition's */
        }
      }
    }
  }

  // Copy: an ERROR only for messages an engine step sends in this release; PENDING for engine
  // steps whose type arrives later; observed messages carry their exact campaign name.
  const users = new Map<string, Step[]>();
  for (const step of def.steps) {
    if (!step.message) continue;
    let name: string | undefined = step.message;
    const chain = new Set<string>();
    while (name && !chain.has(name)) {
      chain.add(name);
      users.set(name, [...(users.get(name) ?? []), step]);
      name = def.messages[name]?.late;
    }
  }
  for (const [name, message] of Object.entries(def.messages)) {
    const path = `/messages/${name}/sha256`;
    const using = users.get(name) ?? [];
    const engineSteps = using.filter((step) => ownerOf(def, series, step.id) === "engine");
    const hex = SHA256_RE.test(message.sha256);
    if (using.length === 0 || engineSteps.length > 0) {
      if (hex) continue;
      if (message.sha256 === "observed" && engineSteps.length > 0) {
        problems.push(err("check.copy_observed_on_engine", `message '${name}' is sent by engine step ${engineSteps.map((step) => step.id).join(", ")}, so it needs Casey's approved sha, not 'observed'`, path, file));
        continue;
      }
      const live = engineSteps.find((step) => liveInRelease(step.do));
      if (live) {
        problems.push(err("check.sha_placeholder", `message '${name}' is sent by engine step '${live.id}' in this release and has no approved sha`, path, file, "seqctl check --fill once Casey's APPROVED entry is on main", "casey"));
      } else {
        const phase = PHASE_OF_DO[engineSteps[0]?.do ?? "send_flow_event"] ?? "P2";
        problems.push(pending("check.copy_not_approved", `message '${name}' needs Casey's APPROVED entry before ${phase} (${PHASE_DATES[phase] ?? "later"}) sends it`, path, file, "Casey approves it in APPROVED, by PR", "casey", "~1 day"));
      }
      continue;
    }
    if (!hex && message.sha256 !== "observed") {
      problems.push(warn("check.sha_placeholder", `message '${name}' is only sent by other owners; mark it sha256: observed`, path, file));
    }
    if (using.some((step) => ownerOf(def, series, step.id) === "mac") && !message.late && def.steps.some((step) => step.message === name) && !message.campaign_name) {
      problems.push(warn("check.observed_unnamed", `message '${name}' is sent by the Mac but carries no campaign_name, so its evidence cannot be matched by exact name`, `/messages/${name}`, file));
    }
  }

  const ok = !problems.some((entry) => entry.tier === "error");
  return { normalized: series, sha256: ok ? jcsSha256(series) : "", problems, ok };
}
