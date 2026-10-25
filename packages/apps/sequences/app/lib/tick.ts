// sequences.tick, once a minute: heartbeat, the 30-minute probe, acceptance per series (each in its
// own try, HR-24), the alert rules, and a notify round when one is due. The tick holds no credential.
import { acceptSeries, admit, systemAdmission, type AcceptReport, type JobIds } from "./accept.js";
import { ACTIVE_RULES, RUN_STATE_A2_CODES, alertsDueDelivery, evaluateRunAlerts, evaluateStepAlerts, openAlert, releaseExpiredTakes, syncAlerts, type DesiredAlert, type StepView } from "./alerts.js";
import { asArray, asString, errorText, unwrapPayload } from "./nex.js";
import { listSeries, loadRuns, loadSteps, runtimeJobs } from "./repo.js";
import { appendEvent, isoOrNull, requireStore, tx } from "./store.js";
import type { JobContext } from "./types.js";

export const PROBE_EVERY_MINUTES = 30;
export const TICK_STALE_MS = 3 * 60 * 1000;
export const NOTIFY_SPACING_MS = 5 * 60 * 1000;
const A2_STATUSES = ["quarantined", "held", "failed", "dead_lettered"];
const A2_WINDOW_MS = 48 * 60 * 60 * 1000;

export async function runTick(ctx: JobContext): Promise<Record<string, unknown>> {
  const store = requireStore(ctx.app);
  const now = ctx.now ?? new Date();
  const summary: Record<string, unknown> = { contract_id: "sequences_tick_v1", run_id: ctx.run.id, trigger_source: ctx.run.trigger_source };

  // 1. Heartbeat; a gap longer than 3 minutes is recorded as A13 (the dead-man pages on the age).
  const beat = await tx(store, async (q) => {
    const before = (await q.query<{ last_tick_at: unknown }>("SELECT last_tick_at FROM health WHERE id = 'singleton' FOR UPDATE")).rows[0];
    const updated = await q.query<{ ticks: string }>(
      "UPDATE health SET last_tick_at = $2, last_tick_run_id = $1, ticks = ticks + 1 WHERE id = 'singleton' RETURNING ticks",
      [ctx.run.id, now.toISOString()],
    );
    if (updated.rowCount !== 1) throw new Error("sequences health row is missing (migration 0001 seeds it)");
    return { previous: isoOrNull(before?.last_tick_at), ticks: Number(updated.rows[0]!.ticks) };
  });
  summary.ticks = beat.ticks;
  if (beat.previous && now.getTime() - Date.parse(beat.previous) > TICK_STALE_MS) {
    const gapMinutes = Math.round((now.getTime() - Date.parse(beat.previous)) / 60_000);
    await openAlert(store, { rule: "A13", subject_ref: `engine.tick#${beat.previous}`, immediate: false, fix_by: null, detail: { code: "A13.tick_gap", message: `no tick for ${gapMinutes} min (last ${beat.previous})`, ref: null, series_id: null, gap_minutes: gapMinutes } }, now, "engine:tick");
    summary.tick_gap_minutes = gapMinutes;
  }

  const jobs: JobIds = await runtimeJobs(store);
  if (!jobs.get("sequences.step")) {
    summary.problem = "runtime_jobs is empty: the install hook has not recorded the job ids";
    return summary;
  }

  // 2. The system probe, once per 30-minute slot (its key makes a slot run once).
  const report: AcceptReport = { accepted: [], adopted: [], cancelled: [], pending: [], errors: [] };
  const probe = systemAdmission("probe", now, PROBE_EVERY_MINUTES);
  const health = (await store.query<{ last_probe_slot: string | null }>("SELECT last_probe_slot FROM health WHERE id = 'singleton'")).rows[0];
  const system = health?.last_probe_slot === probe.input.probe ? [] : [probe];

  // 3. Acceptance, one series at a time.
  const series = await listSeries(store, ["observing", "active"]);
  const imported = new Set(
    (await store.query<{ key: string }>("SELECT night::text || '#' || drawing_no AS key FROM drawings WHERE mode = 'adopted'")).rows.map((row) => row.key),
  );
  const evaluated: string[] = [];
  const perSeries: Record<string, unknown> = {};
  for (const entry of series) {
    try {
      const accepted = await acceptSeries(store, ctx.nex, jobs, entry, now, imported);
      perSeries[entry.id] = { accepted: accepted.accepted.length, adopted: accepted.adopted.length, cancelled: accepted.cancelled.length, errors: accepted.errors.length };
      report.errors.push(...accepted.errors);
      evaluated.push(entry.id);
    } catch (error) {
      perSeries[entry.id] = { error: errorText(error).slice(0, 200) };
    }
  }
  summary.series = perSeries;

  // 4-5. Alert rules over stored outputs, per series; A2 from the runtime's own Run states.
  const desired: DesiredAlert[] = [];
  const alerted: string[] = [];
  for (const entry of series.filter((row) => evaluated.includes(row.id))) {
    try {
      const steps = await loadSteps(store, entry.id);
      const runs = await loadRuns(store, steps.map((step) => step.id));
      const views: StepView[] = steps.map((step) => ({
        id: step.id,
        ref: step.ref,
        series_id: step.series_id,
        series_created_at: entry.created_at,
        step_id: step.step_id,
        owner: step.owner,
        mode: step.mode,
        state: step.state,
        due_at: step.due_at,
        expected: step.expected,
        result: step.result,
        work: step.work,
        runs: runs.filter((run) => run.step_instance_id === step.id).map((run) => ({ phase: run.phase, state: run.state })),
      }));
      desired.push(...evaluateStepAlerts(views, now, imported));
      alerted.push(entry.id);
    } catch (error) {
      perSeries[entry.id] = { ...(perSeries[entry.id] as object), alerts_error: errorText(error).slice(0, 200) };
    }
  }
  const runRows: Array<{ id: string; job_name: string; status: string; error?: string | null }> = [];
  let runsReadable = true;
  for (const [name, job] of jobs) {
    for (const status of A2_STATUSES) {
      try {
        const runs = asArray(unwrapPayload(await ctx.nex.jobs.runs.list({ job_definition_id: job.job_id, status, limit: 100 })).runs);
        for (const run of runs) {
          if (now.getTime() - Date.parse(asString(run.created_at)) > A2_WINDOW_MS) continue;
          runRows.push({ id: asString(run.id), job_name: name, status: asString(run.status) || status, error: asString(run.error) || null });
        }
      } catch {
        runsReadable = false;
      }
    }
  }
  const changes = await tx(store, async (q) => {
    await releaseExpiredTakes(q, now);
    const stepRules = ACTIVE_RULES.filter((rule) => rule !== "A2" && rule !== "A13");
    const fromSteps = await syncAlerts(q, desired, stepRules, now, "engine:tick", (row) => alerted.includes(String(row.detail.series_id)));
    // An unreadable runs list keeps the A2s it had (unknown is never "fixed").
    const fromRuns = runsReadable ? await syncAlerts(q, evaluateRunAlerts(runRows), ["A2"], now, "engine:tick", (row) => RUN_STATE_A2_CODES.has(String(row.detail.code))) : { opened: [], resolved: [], reopened: [] };
    // A13 from an earlier gap closes on the first fresh tick after it.
    await q.query("UPDATE alerts SET state = 'resolved', resolved_at = $1 WHERE rule = 'A13' AND state <> 'resolved' AND opened_at < $1", [now.toISOString()]);
    return { opened: [...fromSteps.opened, ...fromRuns.opened], resolved: [...fromSteps.resolved, ...fromRuns.resolved], reopened: [...fromSteps.reopened, ...fromRuns.reopened] };
  });
  summary.alerts = changes;

  // 6. A notify round when an alert is due one; the probe rides the same partial batch.
  // One notify Run at a time: a new one only if none was admitted in the last 5 minutes.
  const due = await alertsDueDelivery(store, now);
  const lastNotify = isoOrNull((await store.query("SELECT last_notify_at FROM health WHERE id = 'singleton'")).rows[0]?.last_notify_at);
  const notify = systemAdmission("notify", now, 1);
  if (due.length > 0 && (!lastNotify || now.getTime() - Date.parse(lastNotify) >= NOTIFY_SPACING_MS)) system.push(notify);
  if (system.length > 0) {
    await admit(store, ctx.nex, jobs, system, now, report);
    const admitted = new Set([...report.accepted, ...report.adopted]);
    if (system.includes(probe) && admitted.has(probe.key)) {
      await store.query("UPDATE health SET last_probe_slot = $1, last_probe_run_id = $2 WHERE id = 'singleton'", [probe.input.probe, ctx.run.id]);
    }
    if (system.includes(notify) && admitted.has(notify.key)) await store.query("UPDATE health SET last_notify_at = $1 WHERE id = 'singleton'", [now.toISOString()]);
  }
  summary.system = system.map((admission) => admission.key);
  if (report.errors.length > 0) {
    summary.errors = report.errors.slice(0, 10);
    await appendEvent(store, { actor: "engine:tick", event: "tick.errors", detail: { errors: report.errors.slice(0, 10) } });
  }
  return summary;
}
