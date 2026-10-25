// The P1b methods. Every read and write returns the one output contract (lib/output.ts) with its
// text twin; refusals and bad params come back as ok:false inside the payload. Reads never write;
// the writes are the import, the definition register, take and told (coordination and evidence,
// no customer or provider effect), and the admin-only runtime configure.
import { RESEND_MS, renderAlert } from "../lib/alerts.js";
import { compileDefinition, compileSeries, type Definition } from "../lib/compile.js";
import { CONFIGURE_CONFIRMATION, ConfigureRefusal, applyRuntimePlan, runtimePlan } from "../lib/configure.js";
import { helpTopic } from "../lib/help.js";
import { importBundle } from "../lib/import.js";
import { asArray, asString, isEnabled, listAll } from "../lib/nex.js";
import { EXIT, assertNoAddress, buildOutput, next, pageLink, problem, refusal, usage, type Output, type Problem } from "../lib/output.js";
import { alertProblem, countsByState, outcomeVector, renderBrief, renderGrid, renderStepRows, resultText, shortRef, stepState, type AlertView } from "../lib/render.js";
import { resolveRef } from "../lib/refs.js";
import { allRefs, definitionRevisions, listSeries, loadDefinition, loadDrawings, loadRuns, loadSeries, loadStepByRef, loadSteps, type SeriesRow, type StepRow } from "../lib/repo.js";
import { PHASE_DATES } from "../lib/states.js";
import { appendEvent, isoOrNull, jsonOf, requireStore, tx } from "../lib/store.js";
import { DEFAULT_TZ, addDays, formatCt, formatCtShort, utcToWall, wallToUtc } from "../lib/time.js";
import type { AppStore, MethodContext } from "../lib/types.js";
import { ACTOR_RE, ParamError, SERIES_ID_RE, allowOnly, flag, int, isoTime, oneOf, refuseAddresses, str, stringList } from "./params.js";

const APP_PHASE = "P1b";
let clock: () => Date = () => new Date();
/** Tests pin the clock; production reads the wall clock. */
export function setClockForTests(fn: (() => Date) | null): void {
  clock = fn ?? (() => new Date());
}

type Handler = (ctx: MethodContext) => Promise<unknown>;

/** Bad params and refusals become outputs; only infrastructure failures throw. */
function guarded(command: string, fn: (ctx: MethodContext, now: Date) => Promise<Output>): Handler {
  return async (ctx) => {
    const now = clock();
    try {
      refuseAddresses(ctx.params ?? {});
      const out = await fn({ ...ctx, params: ctx.params ?? {} }, now);
      assertNoAddress(JSON.stringify(out));
      return out;
    } catch (error) {
      if (error instanceof ParamError) return usage(command, now, error.message);
      if (error instanceof ConfigureRefusal) return refusal(command, now, problem({ code: error.code, tier: "refuse", message: error.message, fixer: "agent" }));
      throw error;
    }
  };
}

const actorOf = (ctx: MethodContext, required = false): string => {
  const by = str(ctx.params, "by", { pattern: ACTOR_RE, max: 90, required });
  return by ?? `entity:${ctx.user?.userId || "unknown"}`;
};

async function loadAlerts(q: AppStore, filter: { series?: string | null; states?: string[] } = {}): Promise<AlertView[]> {
  const rows = (
    await q.query(
      `SELECT a.*, l.holder AS lease_holder, l.until AS lease_until, l.eta AS lease_eta FROM alerts a
         LEFT JOIN item_leases l ON l.item_ref = a.id AND l.until > now()
        WHERE a.state = ANY($1::text[]) AND ($2::text IS NULL OR a.detail->>'series_id' = $2 OR a.detail->>'series_id' IS NULL)
        ORDER BY a.opened_at, a.id`,
      [filter.states ?? ["open", "taken", "told"], filter.series ?? null],
    )
  ).rows;
  return rows.map((row) => ({
    id: String(row.id),
    rule: String(row.rule),
    subject_ref: String(row.subject_ref),
    state: String(row.state),
    immediate: row.immediate === true,
    opened_at: isoOrNull(row.opened_at)!,
    last_delivered_at: isoOrNull(row.last_delivered_at),
    deliveries: Number(row.deliveries ?? 0),
    told_at: isoOrNull(row.told_at),
    told_by: (row.told_by as string | null) ?? null,
    detail: jsonOf(row.detail, {}),
    lease: row.lease_holder ? { holder: String(row.lease_holder), until: isoOrNull(row.lease_until)!, eta: isoOrNull(row.lease_eta) } : null,
  }));
}

async function pickSeries(q: AppStore, ctx: MethodContext, command: string, now: Date): Promise<{ series: SeriesRow[]; refused: Output | null; named: string | null }> {
  const named = str(ctx.params, "series", { pattern: SERIES_ID_RE, aliases: ["s"] }) ?? null;
  if (named) {
    const series = await loadSeries(q, named);
    if (!series) {
      return {
        series: [],
        named,
        refused: refusal(command, now, problem({ code: "check.unknown_ref", tier: "refuse", message: `no series '${named}' is registered (it arrives with the October import)`, fixer: "agent", next: [next("python3 -I scripts/sequences_import.py --all --push", "the import registers the series", "agent", "command", "~5 min")] }), { series: named }),
      };
    }
    return { series: [series], refused: null, named };
  }
  return { series: await listSeries(q, ["draft", "awaiting_ok", "observing", "active", "paused"]), refused: null, named: null };
}

// ---- sequences.health ---------------------------------------------------------------------------

export async function health(ctx: MethodContext) {
  const store = requireStore(ctx.app);
  const now = clock();
  const row = (await store.query("SELECT * FROM health WHERE id = 'singleton'")).rows[0] ?? {};
  const series = (await store.query<{ state: string; n: string }>("SELECT state, count(*) AS n FROM series GROUP BY state")).rows;
  const byState = Object.fromEntries(series.map((entry) => [entry.state, Number(entry.n)]));
  const alerts = await loadAlerts(store, { states: ["open", "taken", "told"] });
  const steps = (await store.query("SELECT state, step_do, work, result FROM step_instances s JOIN series r ON r.id = s.series_id WHERE r.state IN ('observing', 'active')")).rows;
  const dueTimes = steps.flatMap((step) => jsonOf<Array<{ due_at: string | null }>>(step.work, []).map((item) => item.due_at)).filter((time): time is string => Boolean(time) && Date.parse(time!) > now.getTime());
  const lastTick = isoOrNull(row.last_tick_at);
  const deliveries = alerts.filter((alert) => alert.immediate && alert.state === "open" && alert.deliveries > 0);
  return {
    contract_id: "sequences_health_v1",
    app_id: ctx.app.id,
    app_version: ctx.app.version,
    phase: APP_PHASE,
    schema: store.schema,
    as_of: now.toISOString(),
    last_tick_at: lastTick,
    last_tick_run_id: (row.last_tick_run_id as string | null) ?? null,
    tick_age_s: lastTick ? Math.round((now.getTime() - Date.parse(lastTick)) / 1000) : null,
    // BIGINT arrives as text from the store; the app decides how to read it.
    ticks: Number(row.ticks ?? 0),
    probe: {
      last_slot: (row.last_probe_slot as string | null) ?? null,
      ops_reach_at: isoOrNull(row.last_ops_reach_at),
      ops_reach_ok: (row.last_ops_reach_ok as boolean | null) ?? null,
      drand_reach_ok: (row.last_drand_reach_ok as boolean | null) ?? null,
    },
    series: { observing: byState.observing ?? 0, active: byState.active ?? 0, paused: byState.paused ?? 0, total: series.reduce((sum, entry) => sum + Number(entry.n), 0) },
    overdue: alerts.filter((alert) => alert.rule === "A1" && alert.state !== "told").length,
    held: steps.filter((step) => step.state === "held").length,
    short: steps.filter((step) => step.state === "short").length,
    quarantined: alerts.filter((alert) => alert.rule === "A2" && alert.state !== "told").length,
    open_alerts: alerts.filter((alert) => alert.state === "open" || alert.state === "taken").length,
    next_due_at: dueTimes.sort()[0] ?? null,
    alert_delivery: String(row.alert_delivery ?? "deadman"),
    // The dead-man emails each delivery_key once (R2 state); a new round every 6 h until told.
    alerts_to_deliver: deliveries.map((alert) => ({
      id: alert.id,
      delivery_key: `${alert.id}#${alert.deliveries}`,
      rule: alert.rule,
      subject_ref: alert.subject_ref,
      opened_at: alert.opened_at,
      text: renderAlert({ id: alert.id, rule: alert.rule, subject_ref: alert.subject_ref, opened_at: alert.opened_at, detail: alert.detail }),
      next_round_after: alert.last_delivered_at ? new Date(Date.parse(alert.last_delivered_at) + RESEND_MS).toISOString() : null,
    })),
    provider_write_authority: false,
  };
}

// ---- sequences.runtime.configure (admin) --------------------------------------------------------

const runtimeConfigure = guarded("runtime.configure", async (ctx, now) => {
  allowOnly(ctx.params, ["mode", "target", "expected_plan_sha256", "confirmation", "by"]);
  const mode = oneOf(ctx.params, "mode", ["plan", "apply"] as const);
  const target = oneOf(ctx.params, "target", ["armed", "parked"] as const, "armed");
  const { plan, plan_sha256 } = runtimePlan(target);
  const applyCmd = `sequences.runtime.configure {"mode":"apply","target":"${target}","expected_plan_sha256":"${plan_sha256}","confirmation":"${CONFIGURE_CONFIRMATION}"}`;
  if (mode === "plan") {
    return buildOutput({
      command: "runtime.configure",
      now,
      verdict: `sequences runtime · plan ${target} · ${plan.jobs.length} jobs, tick schedule ${plan.schedules[0]!.enabled ? "enabled" : "disabled"} · plan_sha256 ${plan_sha256.slice(0, 16)}`,
      body: [...plan.jobs.map((job) => `${job.name.padEnd(18)} ${job.status.padEnd(8)} ${job.lane_id.padEnd(10)} ${job.profile} ${job.timeout_ms} ms  ${job.allowlist.join(", ")}`), `schedule sequences.tick '0 * * * * *' UTC enabled=${plan.schedules[0]!.enabled}`],
      data: { state: "planned", plan, plan_sha256 },
      apply: { token: plan_sha256, expires_at: null, cmd: applyCmd, effect_sha: plan_sha256 },
      relay: { text: `The Sequences tick would be ${target === "armed" ? "switched on (every minute)" : "switched off"}; the plan's fingerprint is ${plan_sha256.slice(0, 12)}. It sends nothing and holds no provider authority.` },
      exit: EXIT.ok,
    });
  }
  const expected = str(ctx.params, "expected_plan_sha256", { pattern: /^[0-9a-f]{64}$/, required: true });
  if (expected !== plan_sha256) {
    return refusal("runtime.configure", now, problem({ code: "refuse.token_stale", tier: "refuse", message: "expected_plan_sha256 does not match the exact runtime plan; plan again", fixer: "agent" }));
  }
  if (str(ctx.params, "confirmation", { required: true }) !== CONFIGURE_CONFIRMATION) {
    return refusal("runtime.configure", now, problem({ code: "refuse.token_required", tier: "refuse", message: `confirmation must be the literal ${CONFIGURE_CONFIRMATION}`, fixer: "agent" }));
  }
  const applied = await applyRuntimePlan(ctx.nex, target);
  const store = requireStore(ctx.app);
  const jobs = await listAll((params) => ctx.nex.jobs.list(params), "jobs");
  for (const job of jobs.filter((entry) => asString(entry.name).startsWith("sequences."))) {
    await store.query(
      `INSERT INTO runtime_jobs (name, job_id, revision_id, status, updated_at) VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (name) DO UPDATE SET job_id = EXCLUDED.job_id, status = EXCLUDED.status, revision_id = EXCLUDED.revision_id,
         updated_at = CASE WHEN runtime_jobs.revision_id IS DISTINCT FROM EXCLUDED.revision_id THEN now() ELSE runtime_jobs.updated_at END`,
      [asString(job.name), asString(job.id), asString(job.default_revision_id) || null, asString(job.status)],
    );
  }
  await appendEvent(store, { actor: actorOf(ctx), event: "runtime.configured", detail: { target, plan_sha256, schedule: applied.readback.schedule } });
  return buildOutput({
    command: "runtime.configure",
    now,
    verdict: `sequences runtime · ${target} · readback exact`,
    body: [`schedule sequences.tick enabled=${String((applied.readback.schedule as Record<string, unknown>).enabled)} next ${String((applied.readback.schedule as Record<string, unknown>).next_run_at ?? "-")}`],
    data: { state: "applied", plan: applied.plan, plan_sha256, readback: applied.readback },
    relay: { text: target === "armed" ? "The Sequences tick is on; watch one natural tick before anything else (NX-P8)." : "The Sequences tick is off." },
    exit: EXIT.ok,
  });
});

// ---- definitions --------------------------------------------------------------------------------

const definitionsRegister = guarded("definitions.register", async (ctx, now) => {
  allowOnly(ctx.params, ["definition", "yaml_sha256", "source_commit", "mode", "by"]);
  const mode = oneOf(ctx.params, "mode", ["check", "apply"] as const, "check");
  const yamlSha = str(ctx.params, "yaml_sha256", { pattern: /^[0-9a-f]{64}$/, required: true })!;
  const commit = str(ctx.params, "source_commit", { pattern: /^[0-9a-f]{7,40}$/, required: true })!;
  const compiled = compileDefinition(ctx.params.definition, "definition");
  const subject = { series: null, ref: compiled.ok ? `${compiled.normalized.sequence}` : null };
  if (!compiled.ok) {
    return buildOutput({ command: "definitions.register", now, verdict: `definition · ${compiled.problems.filter((entry) => entry.tier === "error").length} errors · not registered`, subject, problems: compiled.problems, data: { registered: false }, exit: EXIT.file_errors, ok: false });
  }
  const store = requireStore(ctx.app);
  const name = compiled.normalized.sequence;
  const revisions = await definitionRevisions(store, name);
  const same = revisions.find((entry) => entry.definition_sha256 === compiled.sha256);
  const revision = same?.revision ?? Math.max(0, ...revisions.map((entry) => entry.revision)) + 1;
  if (mode === "apply" && !same) {
    await tx(store, async (q) => {
      await q.query("INSERT INTO definitions (name, revision, definition_sha256, body, yaml_sha256, source_commit, registered_by) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)", [name, revision, compiled.sha256, JSON.stringify(compiled.normalized), yamlSha, commit, actorOf(ctx)]);
      await appendEvent(q, { actor: actorOf(ctx), event: "definition.registered", detail: { name, revision, definition_sha256: compiled.sha256 } });
    });
  }
  return buildOutput({
    command: "definitions.register",
    now,
    verdict: `${name}@${revision} · ${same ? "already registered" : mode === "apply" ? "registered" : "would register"} · definition_sha256 ${compiled.sha256.slice(0, 16)}`,
    subject,
    problems: compiled.problems,
    data: { name, revision, definition_sha256: compiled.sha256, new: !same, registered: mode === "apply" || Boolean(same) },
    exit: EXIT.ok,
  });
});

const definitionsGet = guarded("definitions.get", async (ctx, now) => {
  allowOnly(ctx.params, ["name", "revision", "by"]);
  const name = str(ctx.params, "name", { pattern: /^[a-z][a-z0-9-]{1,62}$/, required: true })!;
  const store = requireStore(ctx.app);
  const revisions = await definitionRevisions(store, name);
  if (revisions.length === 0) return refusal("definitions.get", now, problem({ code: "check.unknown_ref", tier: "refuse", message: `no definition named ${name}`, fixer: "agent" }));
  const wanted = ctx.params.revision === undefined ? revisions[revisions.length - 1]!.revision : int(ctx.params, "revision", { min: 1, max: 10_000, fallback: 1 });
  const found = await loadDefinition(store, name, wanted);
  if (!found) return refusal("definitions.get", now, problem({ code: "check.unknown_ref", tier: "refuse", message: `${name} has no revision ${wanted}`, fixer: "agent" }));
  return buildOutput({
    command: "definitions.get",
    now,
    verdict: `${name}@${found.revision} · ${found.body.steps.length} steps · definition_sha256 ${found.definition_sha256.slice(0, 16)}`,
    body: revisions.map((entry) => `rev ${entry.revision}  ${entry.definition_sha256.slice(0, 16)}  ${formatCtShort(entry.registered_at)}  ${entry.source_commit}`),
    data: { name, revision: found.revision, definition_sha256: found.definition_sha256, body: found.body, revisions },
  });
});

// ---- sequences.series.import --------------------------------------------------------------------

const seriesImport = guarded("series.import", async (ctx, now) => {
  allowOnly(ctx.params, ["bundle", "mode", "preview_token", "by"]);
  const mode = oneOf(ctx.params, "mode", ["preview", "apply"] as const, "preview");
  const token = str(ctx.params, "preview_token", { pattern: /^pt_[0-9a-f]{32}$/ });
  const actor = actorOf(ctx);
  const report = await importBundle(requireStore(ctx.app), ctx.params.bundle, { mode, preview_token: token, actor, now });
  const data = report.data;
  const validation = data.validation as { drawings?: Array<{ night: string; drawing_no: number; pass: boolean; checks: Array<{ id: string; status: string; detail: string }> }>; ledger?: { status: string; detail: string } } | undefined;
  const body: string[] = [];
  for (const drawing of validation?.drawings ?? []) {
    body.push(`${drawing.night} drawing ${drawing.drawing_no}  ${drawing.checks.map((check) => `${check.id} ${check.status}`).join(" · ")}`);
  }
  if (validation?.ledger) body.push(`ledger  V7 ${validation.ledger.status} · ${validation.ledger.detail}`);
  if (data.counts) body.push(`counts  ${Object.entries(data.counts as Record<string, number>).map(([key, value]) => `${key} ${value}`).join(" · ")}`);
  if (data.bundle_sha256) body.push(`bundle_sha256 ${String(data.bundle_sha256)}`);
  const series = String(data.series ?? (ctx.params.bundle as Record<string, unknown> | undefined)?.series ?? "") || null;
  const replayed = data.replayed === true;
  const verdictText = replayed
    ? `${series} · import already applied · the first result follows`
    : mode === "preview"
      ? `${series} · import preview · ${report.ok ? "every check passes" : `${report.problems.length} problems: apply refused`}`
      : `${series} · import ${report.ok ? "applied" : "refused"}`;
  return buildOutput({
    command: "series.import",
    now,
    verdict: verdictText,
    subject: { series },
    body,
    data,
    problems: report.problems,
    apply: mode === "preview" && report.token ? { token: report.token, expires_at: null, cmd: `python3 -I scripts/sequences_import.py … --apply ${report.token}`, effect_sha: String(report.bundle_sha256) } : null,
    relay: report.ok && mode === "apply" && !replayed ? { text: `The October evidence is on the server: ${String((data.counts as Record<string, number>)?.drawings ?? 0)} drawings replay exactly and the series is being observed.` } : null,
    exit: report.ok ? EXIT.ok : report.problems.some((entry) => entry.code === "refuse.token_stale") ? EXIT.token_stale : report.problems.some((entry) => entry.tier === "refuse") ? EXIT.refused : EXIT.file_errors,
    ok: report.ok,
  });
});

// ---- sequences.brief.get ------------------------------------------------------------------------

function yesterdayFive(now: Date): string {
  const today = utcToWall(now, DEFAULT_TZ).date;
  return wallToUtc(addDays(today, -1), "17:00:00", DEFAULT_TZ).toISOString();
}
function endOfTomorrow(now: Date): string {
  const today = utcToWall(now, DEFAULT_TZ).date;
  return wallToUtc(addDays(today, 1), "23:59:59", DEFAULT_TZ).toISOString();
}

async function loadRelays(q: AppStore, since: string) {
  return (await q.query("SELECT at, by, refs, note, asked FROM relays WHERE at >= $1 ORDER BY at", [since])).rows.map((row) => ({ at: isoOrNull(row.at)!, by: String(row.by), refs: (row.refs as string[]) ?? [], note: String(row.note), asked: (row.asked as string | null) ?? null }));
}

const briefGet = guarded("brief.get", async (ctx, now) => {
  allowOnly(ctx.params, ["series", "s", "since", "needs", "digest", "by", "json"]);
  const store = requireStore(ctx.app);
  const picked = await pickSeries(store, ctx, "brief.get", now);
  if (picked.refused) return picked.refused;
  const by = str(ctx.params, "by", { pattern: ACTOR_RE, max: 90 });
  const sinceParam = str(ctx.params, "since", { max: 40 });
  let since = yesterdayFive(now);
  let sinceFrom = "17:00 CT yesterday";
  if (sinceParam && sinceParam !== "last-relay") {
    since = isoTime(ctx.params, "since")!;
    sinceFrom = "since given";
  } else if (by) {
    const last = (await store.query("SELECT max(at) AS at FROM relays WHERE by = $1", [by])).rows[0];
    if (last?.at) {
      since = isoOrNull(last.at)!;
      sinceFrom = `${by}'s last relay`;
    }
  }
  const needs = str(ctx.params, "needs", { pattern: /^(tyler|agent)$/ });
  if (flag(ctx.params, "digest")) {
    return refusal("brief.get", now, problem({ code: "refuse.not_engine_owned", tier: "refuse", message: `the 08:00 digest arrives with P2 (${PHASE_DATES.P2}); until then brief without --digest covers it`, fixer: "agent" }), { series: picked.named });
  }
  const steps = new Map<string, StepRow[]>();
  for (const series of picked.series) steps.set(series.id, await loadSteps(store, series.id));
  const alerts = (await loadAlerts(store, { series: picked.named })).filter((alert) => !needs || (needs === "agent" ? alert.rule === "A2" || alert.rule === "A11" || alert.rule === "A13" : alert.rule === "A9"));
  const until = endOfTomorrow(now);
  const rendered = renderBrief({ series: picked.series, steps, alerts, relays: await loadRelays(store, since), since, until, now });
  if (picked.series.length === 0) {
    return buildOutput({ command: "brief.get", now, verdict: "BEHIND: no series registered yet · AHEAD: the October import", body: ["nothing to brief: import the October series first"], next: [next("python3 -I scripts/sequences_import.py --all --push", "registers and adopts the October series", "agent", "command", "~5 min")], relay: { text: "Nothing is on the Sequences engine yet." }, exit: EXIT.ok });
  }
  return buildOutput({
    command: "brief.get",
    now,
    verdict: rendered.verdict,
    subject: { series: picked.named ?? (picked.series.length === 1 ? picked.series[0]!.id : null) },
    body: [`(${formatCt(now)} · since ${formatCt(since)}, ${sinceFrom})`, ...rendered.body],
    data: rendered.data,
    problems: rendered.problems,
    relay: { text: rendered.relay, facts: rendered.facts },
    tyler_told: rendered.problems.map((entry) => entry.tyler_told).filter((entry): entry is NonNullable<typeof entry> => entry !== null),
  });
});

// ---- sequences.timeline.get ---------------------------------------------------------------------

const timelineGet = guarded("timeline.get", async (ctx, now) => {
  allowOnly(ctx.params, ["series", "s", "instance", "from", "to", "owner", "json", "by"]);
  const store = requireStore(ctx.app);
  const raw = str(ctx.params, "series", { pattern: /^[a-z0-9][a-z0-9-]{1,62}(\/[a-z][a-z0-9_]{0,30})?$/, aliases: ["s"] });
  const [seriesId, fromPath] = raw ? raw.split("/") : [undefined, undefined];
  const instance = str(ctx.params, "instance", { pattern: /^[a-z][a-z0-9_]{0,30}$/ }) ?? fromPath;
  const owner = str(ctx.params, "owner", { pattern: /^(engine|mac|review_sender|task)$/ });
  const from = isoTime(ctx.params, "from");
  const to = isoTime(ctx.params, "to");
  const all = seriesId ? [await loadSeries(store, seriesId)].filter((entry): entry is SeriesRow => Boolean(entry)) : await listSeries(store, ["observing", "active", "paused", "awaiting_ok", "draft"]);
  if (seriesId && all.length === 0) return refusal("timeline.get", now, problem({ code: "check.unknown_ref", tier: "refuse", message: `no series '${seriesId}'`, fixer: "agent" }), { series: seriesId });
  if (all.length === 0) return buildOutput({ command: "timeline.get", now, verdict: "no series registered yet", exit: EXIT.ok });
  const series = all[0]!;
  let steps = await loadSteps(store, series.id);
  if (!instance) {
    const grid = renderGrid(series, steps);
    return buildOutput({
      command: "timeline.get",
      now,
      verdict: `${series.id} · ${series.state} · ${series.plan.instances.length} groups · ${countsByState(steps)}`,
      subject: { series: series.id },
      body: [...grid.body, "claims close 23:59:59 CT on the day shown · clocks go back Sun 11/1 02:00"],
      data: { series: series.id, state: series.state, groups: grid.rows, counts: Object.fromEntries(steps.reduce((map, step) => map.set(step.state, (map.get(step.state) ?? 0) + 1), new Map<string, number>())) },
      next: [next(`seqctl timeline ${series.id}/${series.plan.instances[0]?.id ?? "g1"}`, "the step rows of one group", "agent")],
      relay: { text: `${series.id}: ${countsByState(steps)}.` },
      exit: EXIT.ok,
    });
  }
  steps = steps.filter((step) => step.instance_id === instance);
  if (steps.length === 0) return refusal("timeline.get", now, problem({ code: "check.unknown_ref", tier: "refuse", message: `${series.id} has no instance '${instance}'`, fixer: "agent" }), { series: series.id });
  if (owner) steps = steps.filter((step) => step.owner === owner);
  if (from) steps = steps.filter((step) => !step.due_at || step.due_at >= from);
  if (to) steps = steps.filter((step) => !step.due_at || step.due_at <= to);
  const night = String(series.plan.instances.find((entry) => entry.id === instance)?.params.night ?? "");
  return buildOutput({
    command: "timeline.get",
    now,
    verdict: `${series.id}/${instance} · night ${night} · ${steps.length} steps · ${countsByState(steps)}`,
    subject: { series: series.id, ref: `${series.id}/${instance}` },
    body: renderStepRows(steps),
    data: { series: series.id, instance, steps: steps.map((step) => ({ ref: step.ref, due_at: step.due_at, owner: step.owner, mode: step.mode, state: step.state, because: step.waiting_because, result: resultText(step) })) },
    next: steps.filter((step) => step.result.verdict === "short" || step.state === "short").map((step) => next(`seqctl explain ${step.ref}`, "short", "agent")),
    exit: EXIT.ok,
  });
});

// ---- sequences.explain --------------------------------------------------------------------------

async function explainStep(store: AppStore, step: StepRow, now: Date, resolvedFrom: string | null): Promise<Output> {
  const runs = await loadRuns(store, [step.id]);
  const alerts = (await loadAlerts(store, { states: ["open", "taken", "told", "resolved"] })).filter((alert) => alert.detail.ref === step.ref || alert.subject_ref.startsWith(step.ref));
  const snapshots = (await store.query("SELECT source, phase, as_of, sha256, count FROM source_snapshots WHERE step_instance_id = $1 ORDER BY as_of", [step.id])).rows;
  const campaigns = (await store.query("SELECT campaign_id, campaign_id_prefix, name, status, sent_at, list_exact, received, trust, source FROM provider_campaigns WHERE step_instance_id = $1 ORDER BY sent_at NULLS LAST", [step.id])).rows;
  const decisions = (await store.query<{ n: string }>("SELECT count(*) AS n FROM send_decisions WHERE step_instance_id = $1", [step.id])).rows[0];
  const deps = step.depends_on.length > 0 ? (await store.query("SELECT ref, state FROM step_instances WHERE ref = ANY($1::text[]) ORDER BY ref", [step.depends_on])).rows : [];
  const body: string[] = [];
  body.push(`WHAT      ${step.do} · owner ${step.owner} · mode ${step.mode}${step.due_at ? ` · due ${formatCt(step.due_at)}` : ""}${step.not_after ? ` · not after ${formatCt(step.not_after)}` : ""}`);
  body.push(`WHY       ${stepState(step)}${step.result.verdict ? ` · verdict ${String(step.result.verdict)}` : ""}`);
  if (deps.length > 0) body.push(`CHAIN     ${deps.map((dep) => `${shortRef(String(dep.ref))} ${String(dep.state)}`).join(" · ")}`);
  const evidence: string[] = [];
  if (step.result.summary) evidence.push(String(step.result.summary));
  for (const snapshot of snapshots) evidence.push(`${String(snapshot.source)} ${String(snapshot.phase ?? "")} as of ${formatCtShort(isoOrNull(snapshot.as_of)!)} sha ${String(snapshot.sha256).slice(0, 12)} count ${String(snapshot.count)}`);
  for (const campaign of campaigns) evidence.push(`campaign ${String(campaign.campaign_id ?? `${String(campaign.campaign_id_prefix ?? "")}…`)} ${String(campaign.status ?? "")} received ${campaign.received ?? "?"} (${String(campaign.trust)}, ${String(campaign.source)})`);
  if (Number(decisions?.n ?? 0) > 0) evidence.push(`${String(decisions!.n)} people planned (campaign_only: on the list, can't confirm it reached them)`);
  for (const run of runs) evidence.push(`run ${run.phase} a${run.attempt_no} ${run.state}${run.nex_run_id ? ` ${run.nex_run_id}` : ""}`);
  if (step.result.shadow) {
    const shadow = step.result.shadow as { pass: boolean; mismatched: string[]; diffs: Array<{ entry_id: string; side: string; class: string }>; read: { phase: string; seconds_from_commit: number } };
    evidence.push(`shadow ${shadow.pass ? "match" : "MISMATCH"} on the ${shadow.read?.phase} read (${shadow.read?.seconds_from_commit} s from the Mac's commit)${shadow.mismatched?.length ? ` · differs in ${shadow.mismatched.join(", ")}` : ""}`);
    for (const diff of (shadow.diffs ?? []).slice(0, 10)) evidence.push(`  ${diff.entry_id} ${diff.side} · ${diff.class}`);
  }
  evidence.forEach((line, index) => body.push(`${index === 0 ? "EVIDENCE" : "        "}  ${line}`));
  const waiting = step.state === "waiting";
  body.push(`IF NOTHING CHANGES  ${waiting ? `it waits for ${step.waiting_because}` : step.mode === "observe" || step.mode === "adopted" ? "the engine keeps observing; it never runs the owner's step" : step.mode === "shadow" ? "the compare runs when the Mac's drawing is imported" : "it runs at its due time"}`);
  const problems = alerts.filter((alert) => alert.state !== "resolved").map((alert) => alertProblem(alert, step));
  if (alerts.length > 0) body.push(`TOLD TYLER  ${alerts.map((alert) => `${alert.id} ${alert.state}${alert.told_by ? ` by ${alert.told_by}` : alert.last_delivered_at ? ` (delivered ${formatCtShort(alert.last_delivered_at)})` : ""}`).join(" · ")}`);
  const relayText = problems.length === 0 ? `${shortRef(step.ref)} is ${step.state}${resultText(step) ? `: ${resultText(step)}` : ""}.` : `${shortRef(step.ref)}: ${String(alerts[0]!.detail.message ?? "")}.`;
  return buildOutput({
    command: "explain",
    now,
    verdict: `${step.ref} · ${stepState(step)} · ${resultText(step) || step.do}`,
    subject: { series: step.series_id, ref: step.ref, resolved_from: resolvedFrom },
    body,
    data: { step: { ...step }, runs, snapshots: snapshots.map((row) => ({ source: row.source, phase: row.phase, as_of: isoOrNull(row.as_of), sha256: row.sha256, count: row.count })), campaigns, alerts: alerts.map((alert) => ({ id: alert.id, state: alert.state, rule: alert.rule })) },
    problems,
    relay: { text: relayText },
  });
}

const explain = guarded("explain", async (ctx, now) => {
  allowOnly(ctx.params, ["ref", "target", "follow", "no_follow", "json", "by"]);
  const target = str(ctx.params, "ref", { required: true, aliases: ["target"], max: 200, pattern: /^[A-Za-z0-9_.:\/#*-]+$/ })!;
  const store = requireStore(ctx.app);
  if (/^A\d{1,2}-\d{4,}$/.test(target)) {
    const alert = (await loadAlerts(store, { states: ["open", "taken", "told", "resolved"] })).find((entry) => entry.id === target);
    if (!alert) return refusal("explain", now, problem({ code: "check.unknown_ref", tier: "refuse", message: `no alert ${target}`, fixer: "agent" }));
    const ref = typeof alert.detail.ref === "string" ? alert.detail.ref : null;
    const step = ref ? await loadStepByRef(store, ref) : null;
    const inner = step ? await explainStep(store, step, now, null) : null;
    return buildOutput({
      command: "explain",
      now,
      verdict: `${alert.id} · ${alert.state} · ${String(alert.detail.message ?? alert.rule)}`,
      subject: { series: (alert.detail.series_id as string | null) ?? null, ref: alert.id },
      body: [`ROOT      ${alert.subject_ref}`, `WHAT      ${alert.rule} opened ${formatCt(alert.opened_at)} · ${alert.deliveries} delivery rounds${alert.last_delivered_at ? `, last ${formatCt(alert.last_delivered_at)}` : ""}`, ...(inner ? inner.text.split("\n").slice(1, -1) : [])],
      data: { alert, step: inner?.data.step ?? null },
      problems: alert.state === "resolved" ? [] : [alertProblem(alert, step ?? undefined)],
      relay: { text: alert.state === "resolved" ? `${alert.id} is resolved.` : `${alert.id}: ${String(alert.detail.message ?? "")}.` },
    });
  }
  if (target.startsWith("msg:") || target.startsWith("src:")) {
    const [prefix, name] = [target.slice(0, 3), target.slice(4)];
    const series = await listSeries(store, ["observing", "active", "paused"]);
    const lines: string[] = [];
    const data: Record<string, unknown> = {};
    for (const entry of series) {
      const def = await loadDefinition(store, entry.definition_name, entry.definition_revision);
      if (!def) continue;
      if (prefix === "msg") {
        const message = (def.body as Definition).messages[name];
        if (!message) continue;
        const users = def.body.steps.filter((step) => step.message === name).map((step) => step.id);
        lines.push(`${entry.id} · ${name} · template ${message.template} · sha256 ${message.sha256.slice(0, 16)} · ${message.consent}${message.campaign_name ? ` · campaign '${message.campaign_name}'` : ""}`, `used by ${users.join(", ") || "a spawned sequence"}${message.late ? ` · late variant ${message.late}` : ""}`);
        data[entry.id] = { message, used_by: users };
      } else {
        const rows = (await store.query("SELECT phase, as_of, sha256, local_sha256, count, fetched_by FROM source_snapshots WHERE source = $1 ORDER BY as_of DESC LIMIT 20", [name])).rows;
        lines.push(...rows.map((row) => `${formatCtShort(isoOrNull(row.as_of)!)} ${String(row.phase ?? "")} sha ${String(row.sha256).slice(0, 12)}${row.sha256 === row.local_sha256 ? "" : " (local sha differs)"} count ${String(row.count)}`));
        data.snapshots = rows;
        break;
      }
    }
    return buildOutput({ command: "explain", now, verdict: `${target} · ${lines.length > 0 ? "found" : "nothing recorded"}`, subject: { ref: target }, body: lines.length > 0 ? lines : [`no record of ${target} in the registered series`], data });
  }
  if (/^(inc_|ar_|capture$)/.test(target)) {
    return refusal("explain", now, problem({ code: "refuse.not_engine_owned", tier: "refuse", message: `${target.startsWith("ar_") ? "approvals" : target.startsWith("inc_") ? "incidents" : "the mailbox capture"} arrive with ${target.startsWith("capture") ? "P3" : "P2"}`, fixer: "agent" }));
  }
  const known = await allRefs(store);
  const resolved = resolveRef(target, known);
  if (!resolved.ok) {
    return refusal("explain", now, problem({ code: resolved.code, tier: "refuse", message: resolved.message, fixer: "agent", next: resolved.candidates.slice(0, 10).map((candidate) => next(`seqctl explain ${candidate}`, "one of the candidates", "agent")) }), { ref: target });
  }
  return explainStep(store, (await loadStepByRef(store, resolved.ref))!, now, resolved.resolved_from);
});

// ---- sequences.audit.query (step view; the person view is P4) -----------------------------------

const auditQuery = guarded("audit.query", async (ctx, now) => {
  allowOnly(ctx.params, ["ref", "step", "against", "actions", "missing", "json", "email", "entry", "hash", "customer", "month", "since", "until", "by"]);
  if (["email", "entry", "hash", "customer"].some((key) => ctx.params[key] !== undefined)) {
    return refusal("audit.query", now, problem({ code: "refuse.not_engine_owned", tier: "refuse", message: "the person view (all programs, by person) arrives with P4 (about 11/18); until then: seqctl audit --step <ref>", fixer: "agent" }));
  }
  const target = str(ctx.params, "step", { required: true, aliases: ["ref"], max: 200, pattern: /^[A-Za-z0-9_.\/-]+$/ })!;
  const against = str(ctx.params, "against", { pattern: /^(winners|team)$/ });
  const store = requireStore(ctx.app);
  const resolved = resolveRef(target, await allRefs(store));
  if (!resolved.ok) return refusal("audit.query", now, problem({ code: resolved.code, tier: "refuse", message: resolved.message, fixer: "agent" }), { ref: target });
  const step = (await loadStepByRef(store, resolved.ref))!;
  const series = await loadSeries(store, step.series_id);
  const planned = Number((await store.query<{ n: string }>("SELECT count(*) AS n FROM send_decisions WHERE step_instance_id = $1", [step.id])).rows[0]?.n ?? 0);
  const kinds = (await store.query<{ delivery_receipt_kind: string; n: string }>("SELECT delivery_receipt_kind, count(*) AS n FROM send_decisions WHERE step_instance_id = $1 GROUP BY 1", [step.id])).rows;
  const received = typeof step.result.received === "number" ? (step.result.received as number) : null;
  const body = [`OUTCOME   ${planned > 0 ? outcomeVector({ received, planned, receiptKind: kinds[0]?.delivery_receipt_kind ?? "none" }) : resultText(step) || "no send rows for this step"}`];
  const data: Record<string, unknown> = { ref: step.ref, planned, received, receipt_kinds: Object.fromEntries(kinds.map((row) => [row.delivery_receipt_kind, Number(row.n)])) };
  if (against === "winners" && series?.prize_scope) {
    const overlap = Number((await store.query<{ n: string }>("SELECT count(*) AS n FROM send_decisions d JOIN winners w ON w.recipient_hash = d.recipient_hash AND w.prize_scope = $2 WHERE d.step_instance_id = $1", [step.id, series.prize_scope])).rows[0]?.n ?? 0);
    body.push(`AGAINST   winners ledger: ${overlap} of ${planned} planned are winners in ${series.prize_scope}`);
    data.against = { set: "winners", overlap };
  } else if (against === "team") {
    body.push("AGAINST   team: the team hashes ride the import bundle; overlap by step arrives with P2's team route");
  }
  if (flag(ctx.params, "actions")) {
    const events = (await store.query("SELECT id, at, actor, event FROM step_events WHERE step_instance_id = $1 ORDER BY id", [step.id])).rows;
    body.push(...events.map((event) => `ACTION    ${formatCtShort(isoOrNull(event.at)!)} ${String(event.event)} by ${String(event.actor)}`));
    data.actions = events;
  }
  if (flag(ctx.params, "missing")) body.push("MISSING   per-person receipts arrive with engine sends (P2); imported Mac notes are campaign_only");
  body.push(`COVERAGE  read: send decisions and campaigns imported for this step (${formatCt(now)}) · not read: Klaviyo per-person receipts (P2), desk replies (P4)`);
  return buildOutput({ command: "audit.query", now, verdict: `${step.ref} · ${planned > 0 ? `${planned} planned` : step.state}`, subject: { series: step.series_id, ref: step.ref, resolved_from: resolved.resolved_from }, body, data, exit: EXIT.ok });
});

// ---- sequences.check.run (live) and check.file (offline) -----------------------------------------

const checkRun = guarded("check.run", async (ctx, now) => {
  allowOnly(ctx.params, ["series", "s", "ref", "target", "json", "by"]);
  const store = requireStore(ctx.app);
  const target = str(ctx.params, "target", { pattern: /^(engine|capture)$/ });
  if (target === "capture") return refusal("check.run", now, problem({ code: "refuse.not_engine_owned", tier: "refuse", message: "the mailbox capture arrives with P3 (about 11/6)", fixer: "agent" }));
  const healthRow = (await store.query("SELECT * FROM health WHERE id = 'singleton'")).rows[0] ?? {};
  const lastTick = isoOrNull(healthRow.last_tick_at);
  const tickAge = lastTick ? Math.round((now.getTime() - Date.parse(lastTick)) / 1000) : null;
  const problems: Problem[] = [];
  const body: string[] = [];
  const jobs = await listAll((params) => ctx.nex.jobs.list(params), "jobs");
  const schedules = await listAll((params) => ctx.nex.schedules.list(params), "schedules");
  const ours = jobs.filter((job) => asString(job.name).startsWith("sequences."));
  const tick = schedules.find((schedule) => asString(schedule.name) === "sequences.tick");
  body.push(`ENGINE  tick ${lastTick ? `${formatCtShort(lastTick)} (${tickAge} s ago)` : "never"} · schedule ${tick ? (isEnabled(tick.enabled) ? "enabled" : "disabled") : "missing"} · jobs ${ours.map((job) => `${asString(job.name).slice(10)}:${asString(job.status)}`).join(" ")}`);
  body.push(`        probe ${healthRow.last_ops_reach_at ? `${formatCtShort(isoOrNull(healthRow.last_ops_reach_at)!)} ops ${healthRow.last_ops_reach_ok ? "ok" : "UNREACHABLE"} · drand ${healthRow.last_drand_reach_ok ? "ok" : "unreachable"}` : "not run yet"} · send switch off (P1b) · alert delivery ${String(healthRow.alert_delivery ?? "deadman")}`);
  if (tick && isEnabled(tick.enabled) && (tickAge === null || tickAge > 180)) problems.push(problem({ code: "A13", tier: "warn", message: `the tick is ${tickAge === null ? "not running" : `${tickAge} s old`} while armed`, fixer: "agent", next: [next("site-ctl nex last-scheduled-run (on the authority holder, read-only)", "the workers' scheduled-run evidence", "agent")] }));
  if (healthRow.last_ops_reach_ok === false) problems.push(problem({ code: "transient.ops_unreachable", tier: "warn", message: "the last probe could not reach the ops sources API from the worker (§8 R-3)", fixer: "agent", next: [next("seqctl explain src:health", "the probe's evidence", "agent")] }));
  const picked = target === "engine" ? { series: [], refused: null, named: null } : await pickSeries(store, ctx, "check.run", now);
  if (picked.refused) return picked.refused;
  for (const series of picked.series) {
    const sources = (await store.query("SELECT DISTINCT ON (source) source, as_of, count FROM source_snapshots WHERE step_instance_id IN (SELECT id FROM step_instances WHERE series_id = $1) ORDER BY source, as_of DESC", [series.id])).rows;
    body.push(`SERIES  ${series.id} · ${series.state}`);
    for (const source of sources) body.push(`        source ${String(source.source).padEnd(12)} as of ${formatCtShort(isoOrNull(source.as_of)!)} (${Math.round((now.getTime() - Date.parse(isoOrNull(source.as_of)!)) / 60_000)} min) count ${String(source.count)}`);
    const lastImport = (await store.query("SELECT applied_at, scope FROM import_bundles WHERE series_id = $1 ORDER BY applied_at DESC LIMIT 1", [series.id])).rows[0];
    body.push(`        executors · Mac evidence ${lastImport ? `last import ${formatCtShort(isoOrNull(lastImport.applied_at)!)} (${String(lastImport.scope)})` : "never imported"} · review sender observed through invitations`);
    const drawings = await loadDrawings(store, series.prize_scope ?? series.id, "adopted");
    const shadows = await loadDrawings(store, series.prize_scope ?? series.id, "shadow");
    body.push(`        drawings ${drawings.length} adopted (replay ${drawings.filter((drawing) => (drawing.replay as { pass?: boolean } | null)?.pass).length} of ${drawings.length} pass) · shadows ${shadows.filter((drawing) => (drawing.compare as { pass?: boolean } | null)?.pass).length} of ${shadows.length} match`);
  }
  return buildOutput({ command: "check.run", now, verdict: `${picked.named ?? "sequences"} · live check · ${problems.length === 0 ? "everything readable" : `${problems.length} to look at`}`, subject: { series: picked.named }, body, problems, data: { tick_age_s: tickAge, schedule_enabled: tick ? isEnabled(tick.enabled) : null, jobs: ours.map((job) => ({ name: job.name, status: job.status })) } });
});

const checkFile = guarded("check.file", async (ctx, now) => {
  allowOnly(ctx.params, ["files", "json", "by"]);
  const files = asArray(ctx.params.files);
  if (files.length === 0 || files.length > 20) throw new ParamError("files", "'files' must be 1-20 objects {path, body} (the PyYAML-parsed JSON)");
  const store = requireStore(ctx.app);
  const problems: Problem[] = [];
  const body: string[] = [];
  const definitions = new Map<string, { def: Definition; revision: number }>();
  for (const file of files) {
    const path = typeof file.path === "string" ? file.path : "file";
    if (file.body && typeof file.body === "object" && "sequence" in (file.body as object) && !("series" in (file.body as object))) {
      const result = compileDefinition(file.body, path);
      problems.push(...result.problems);
      if (result.ok) {
        const revisions = await definitionRevisions(store, result.normalized.sequence);
        const same = revisions.find((entry) => entry.definition_sha256 === result.sha256);
        const revision = same?.revision ?? Math.max(0, ...revisions.map((entry) => entry.revision)) + 1;
        definitions.set(`${result.normalized.sequence}@${revision}`, { def: result.normalized, revision });
        body.push(`${path}  ${result.normalized.sequence}@${revision}${same ? " (registered)" : " (new revision)"} · definition_sha256 ${result.sha256.slice(0, 16)}`);
      }
    }
  }
  for (const file of files) {
    const path = typeof file.path === "string" ? file.path : "file";
    if (!(file.body && typeof file.body === "object" && "series" in (file.body as object))) continue;
    const named = String((file.body as Record<string, unknown>).sequence ?? "");
    let target = definitions.get(named);
    if (!target) {
      const [name, rev] = named.split("@");
      const stored = name && rev ? await loadDefinition(store, name, Number(rev)) : null;
      if (stored) target = { def: stored.body, revision: stored.revision };
    }
    if (!target) {
      problems.push(problem({ code: "check.unknown_ref", tier: "error", message: `${path}: '${named}' is neither registered nor in this check`, file: path, path: "/sequence" }));
      continue;
    }
    const result = compileSeries(target.def, target.revision, file.body, path);
    problems.push(...result.problems);
    if (result.ok) body.push(`${path}  ${result.normalized.series} · ${result.normalized.instances.length} instances · series sha ${result.sha256.slice(0, 16)}`);
  }
  const errors = problems.filter((entry) => entry.tier === "error").length;
  const pendings = problems.filter((entry) => entry.tier === "pending").length;
  const warns = problems.filter((entry) => entry.tier === "warn").length;
  return buildOutput({
    command: "check.file",
    now,
    verdict: `${files.length} file${files.length === 1 ? "" : "s"} · ${errors} errors · ${pendings} pending · ${warns} warnings${errors === 0 ? (pendings > 0 ? " · simulate runs; submit waits on the pending" : " · ready") : ""}`,
    body,
    problems,
    data: { errors, pending: pendings, warnings: warns },
    exit: errors > 0 ? EXIT.file_errors : EXIT.ok,
    ok: errors === 0,
  });
});

// ---- help, page, events -------------------------------------------------------------------------

const helpGet = guarded("help.get", async (ctx, now) => {
  allowOnly(ctx.params, ["topic", "code", "json", "by"]);
  const topic = str(ctx.params, "topic", { aliases: ["code"], max: 80, pattern: /^[A-Za-z0-9_.:@ -]*$/ }) ?? "";
  const found = helpTopic(topic);
  if (!found) return refusal("help.get", now, problem({ code: "check.unknown_ref", tier: "refuse", message: `no help for '${topic}'`, fixer: "agent", next: [next("seqctl help", "the topic index", "agent")] }));
  return buildOutput({ command: "help.get", now, verdict: found.title, body: found.lines, data: found.data, exit: EXIT.ok });
});

const pageGet = guarded("page.get", async (ctx, now) => {
  allowOnly(ctx.params, ["series", "s", "by"]);
  const store = requireStore(ctx.app);
  const picked = await pickSeries(store, ctx, "page.get", now);
  if (picked.refused) return picked.refused;
  const series = picked.series[0];
  if (!series) return buildOutput({ command: "page.get", now, verdict: "not imported yet", data: { contract: "sequences_page_v1", series: null }, exit: EXIT.ok });
  const steps = await loadSteps(store, series.id);
  const alerts = await loadAlerts(store, { series: series.id });
  const drawings = await loadDrawings(store, series.prize_scope ?? series.id, "adopted");
  const shadows = await loadDrawings(store, series.prize_scope ?? series.id, "shadow");
  const open = alerts.filter((alert) => alert.state === "open" || alert.state === "taken");
  const days = [...new Set(steps.map((step) => step.due_at).filter((time): time is string => Boolean(time)).map((time) => utcToWall(time).date))].sort();
  const instances = series.plan.instances ?? [];
  const page = {
    contract: "sequences_page_v1",
    as_of: now.toISOString(),
    series: { id: series.id, state: series.state, definition: `${series.definition_name}@${series.definition_revision}`, plan_sha256: series.plan_sha256, prize_scope: series.prize_scope, created_at: series.created_at },
    answer_card: { text: open.length === 0 ? "Observing · nothing needs you" : `${open.length} open alert${open.length === 1 ? "" : "s"}`, alerts: open.map((alert) => ({ id: alert.id, rule: alert.rule, subject_ref: alert.subject_ref, message: String(alert.detail.message ?? ""), state: alert.state, opened_at: alert.opened_at })) },
    calendar: {
      days,
      groups: instances.map((instance) => ({
        instance: instance.id,
        night: instance.params.night ?? null,
        chips: steps.filter((step) => step.instance_id === instance.id && step.due_at).map((step) => ({ day: utcToWall(step.due_at!).date, ref: step.ref, step: step.step_id, owner: step.owner, state: step.state, label: `${formatCtShort(step.due_at!).slice(-5)} ${step.step_id}`, outlined: step.owner === "mac" || step.owner === "review_sender" })),
      })),
    },
    timelines: Object.fromEntries(instances.map((instance) => [instance.id, steps.filter((step) => step.instance_id === instance.id).map((step) => ({ ref: step.ref, due_at: step.due_at, due_ct: step.due_at ? formatCt(step.due_at) : null, step: step.step_id, owner: step.owner, mode: step.mode, state: step.state, state_text: stepState(step), result: resultText(step) }))])),
    drawings: drawings.map((drawing) => {
      const shadow = shadows.find((entry) => entry.night === drawing.night && entry.drawing_no === drawing.drawing_no);
      return {
        night: drawing.night,
        drawing_no: drawing.drawing_no,
        adopted: { entries: drawing.receipt.entry_ids.length, winners: drawing.receipt.winners.length, alternates: drawing.receipt.alternates.length, promoted: drawing.receipt.promoted.length, entry_list_sha256: drawing.receipt.commit.entry_list_sha256, drand_round: drawing.receipt.commit.drand_round, committed_at: drawing.committed_at, replay_pass: (drawing.replay as { pass?: boolean } | null)?.pass ?? null, beacon_check: drawing.beacon_check },
        shadow: shadow ? { pass: (shadow.compare as { pass?: boolean } | null)?.pass ?? null, entry_list_sha256: shadow.receipt.commit.entry_list_sha256, mismatched: (shadow.compare as { mismatched?: string[] } | null)?.mismatched ?? [], unexplained: (shadow.compare as { unexplained?: number } | null)?.unexplained ?? 0 } : null,
      };
    }),
    notes: steps.filter((step) => step.expected.note).map((step) => ({ ref: step.ref, note: step.expected.note, drawing_no: step.expected.drawing_no, state: step.state, verdict: step.result.verdict ?? null, received: step.result.received ?? null, planned: step.result.planned ?? null, receipt_kind: "campaign_only", label: "on the list, can't confirm it reached them" })),
    health: await health(ctx),
  };
  return buildOutput({ command: "page.get", now, verdict: `${series.id} · ${series.state} · ${page.answer_card.text}`, subject: { series: series.id }, data: page, page: pageLink(series.id), exit: EXIT.ok });
});

const eventsList = guarded("events.list", async (ctx, now) => {
  allowOnly(ctx.params, ["series", "s", "after", "limit", "json", "by"]);
  const store = requireStore(ctx.app);
  const series = str(ctx.params, "series", { pattern: SERIES_ID_RE, aliases: ["s"] }) ?? null;
  const after = int(ctx.params, "after", { min: 0, max: Number.MAX_SAFE_INTEGER, fallback: 0 });
  const limit = int(ctx.params, "limit", { min: 1, max: 500, fallback: 100 });
  const rows = (
    await store.query(
      `SELECT e.id, e.at, e.series_id, s.ref, e.actor, e.event, e.detail FROM step_events e LEFT JOIN step_instances s ON s.id = e.step_instance_id
        WHERE e.id > $1 AND ($2::text IS NULL OR e.series_id = $2) ORDER BY e.id LIMIT $3`,
      [after, series, limit],
    )
  ).rows.map((row) => ({ id: Number(row.id), at: isoOrNull(row.at), series_id: row.series_id ?? null, ref: row.ref ?? null, actor: String(row.actor), event: String(row.event), detail: jsonOf(row.detail, {}) }));
  const last = rows.length > 0 ? rows[rows.length - 1]!.id : after;
  return buildOutput({
    command: "events.list",
    now,
    verdict: `${rows.length} event${rows.length === 1 ? "" : "s"} after ${after}${series ? ` in ${series}` : ""}`,
    subject: { series },
    body: rows.map((row) => `${formatCtShort(row.at!)} ${row.event}${row.ref ? ` ${shortRef(String(row.ref))}` : ""} · ${row.actor}`),
    data: { events: rows, next_after: last },
    exit: EXIT.ok,
  });
});

// ---- items.take / items.told (tokenless coordination) -------------------------------------------

const ITEM_RE = /^(A\d{1,2}-\d{4,}|inc_[a-z0-9]{1,40}|[a-z0-9][a-z0-9-]{1,62}(\/[a-z][a-z0-9_]{0,30}\.[a-z][a-z0-9_]{0,62})?)$/;

const itemsTake = guarded("items.take", async (ctx, now) => {
  allowOnly(ctx.params, ["item", "by", "note", "eta", "release"]);
  const item = str(ctx.params, "item", { required: true, pattern: ITEM_RE, max: 200 })!;
  const by = str(ctx.params, "by", { required: true, pattern: ACTOR_RE, max: 90 })!;
  const note = str(ctx.params, "note", { required: true, max: 500 })!;
  const eta = isoTime(ctx.params, "eta");
  const release = flag(ctx.params, "release");
  const store = requireStore(ctx.app);
  const until = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const before = (await store.query("SELECT holder, until FROM item_leases WHERE item_ref = $1", [item])).rows[0];
  await tx(store, async (q) => {
    if (release) {
      await q.query("DELETE FROM item_leases WHERE item_ref = $1 AND holder = $2", [item, by]);
      await q.query("UPDATE alerts SET state = 'open' WHERE id = $1 AND state = 'taken'", [item]);
    } else {
      await q.query(
        "INSERT INTO item_leases (item_ref, holder, until, eta, note) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (item_ref) DO UPDATE SET holder = EXCLUDED.holder, until = EXCLUDED.until, eta = EXCLUDED.eta, note = EXCLUDED.note",
        [item, by, until, eta ?? null, note],
      );
      await q.query("UPDATE alerts SET state = 'taken' WHERE id = $1 AND state = 'open'", [item]);
    }
    await appendEvent(q, { actor: by, event: release ? "item.released" : "item.taken", detail: { item, note, eta: eta ?? null, until: release ? null : until } });
  });
  const earlier = before && before.holder !== by ? ` · last taken by ${String(before.holder)} until ${formatCt(isoOrNull(before.until)!)}` : "";
  return buildOutput({
    command: "items.take",
    now,
    verdict: release ? `released ${item} · by ${by}` : `took ${item} · by ${by} until ${formatCt(until)} (run again to renew)${earlier}`,
    subject: { ref: item },
    body: release ? [] : ["effect  re-sends to Tyler pause while the lease is live; a deadline within 60 minutes still reaches him"],
    data: { item, holder: release ? null : by, until: release ? null : until, eta: eta ?? null },
    exit: EXIT.ok,
  });
});

const itemsTold = guarded("items.told", async (ctx, now) => {
  allowOnly(ctx.params, ["items", "item", "refs", "by", "note", "asked"]);
  const items = stringList(ctx.params, "items", { pattern: ITEM_RE, max: 50, aliases: ["item", "refs"] });
  if (items.length === 0) throw new ParamError("items", "'items' names at least one alert, ref or series");
  const by = str(ctx.params, "by", { required: true, pattern: ACTOR_RE, max: 90 })!;
  const note = str(ctx.params, "note", { required: true, max: 1000 })!;
  const asked = str(ctx.params, "asked", { max: 500 });
  const store = requireStore(ctx.app);
  const stopped = await tx(store, async (q) => {
    await q.query("INSERT INTO relays (at, by, refs, note, asked) VALUES ($1, $2, $3::text[], $4, $5)", [now.toISOString(), by, items, note, asked ?? null]);
    const updated = await q.query<{ id: string }>(
      `UPDATE alerts SET state = 'told', told_at = $1, told_by = $2
        WHERE state IN ('open', 'taken') AND (id = ANY($3::text[]) OR detail->>'ref' = ANY($3::text[]) OR detail->>'series_id' = ANY($3::text[]))
        RETURNING id`,
      [now.toISOString(), by, items],
    );
    await appendEvent(q, { actor: by, event: "tyler.told", detail: { items, note, asked: asked ?? null, alerts: updated.rows.map((row) => row.id) } });
    return updated.rows.map((row) => row.id);
  });
  return buildOutput({
    command: "items.told",
    now,
    verdict: `recorded · Tyler told by ${by} ${formatCt(now)}`,
    body: [stopped.length > 0 ? `re-sends stopped for ${stopped.join(", ")} · each re-alerts him on its own on a new code` : "no open alert matched; the relay is recorded", "other sessions' brief shows this under TOLD TYLER · your brief window now starts here"],
    data: { items, by, at: now.toISOString(), stopped, asked: asked ?? null },
    exit: EXIT.ok,
  });
});

// The loader takes this default object as the method map; every key must be declared in
// app.nexus.json and start with "sequences.".
export default {
  "sequences.health": health,
  "sequences.runtime.configure": runtimeConfigure,
  "sequences.definitions.register": definitionsRegister,
  "sequences.definitions.get": definitionsGet,
  "sequences.series.import": seriesImport,
  "sequences.brief.get": briefGet,
  "sequences.timeline.get": timelineGet,
  "sequences.explain": explain,
  "sequences.audit.query": auditQuery,
  "sequences.check.run": checkRun,
  "sequences.check.file": checkFile,
  "sequences.help.get": helpGet,
  "sequences.page.get": pageGet,
  "sequences.events.list": eventsList,
  "sequences.items.take": itemsTake,
  "sequences.items.told": itemsTold,
};
