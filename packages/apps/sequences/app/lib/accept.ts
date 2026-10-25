// Tick acceptance (build manual §2a jobs/tick.ts step 3): the tick is the only path that admits
// step Runs. Rules, each from the kernel's real behaviour:
//   - A step_runs row {run_key, state: accepting} is written BEFORE the invoke. A row found still
//     accepting is looked up first with jobs.runs.list {idempotency_key}; re-issuing the key from
//     another tick Run would get idempotency_key_payload_mismatch (the per-attempt token digest is
//     part of the fingerprint), so a re-issue is never the recovery path.
//   - step and notify Runs go through jobs.invokeMany {atomicity: 'partial'} (atomic fails the whole
//     batch on one mismatch); draw and send go one at a time with jobs.invoke and a
//     serialization_key, which invokeMany refuses.
//   - Every accept sends ids only, the stored available_at, trigger_source 'sequences' and an
//     explicit max_attempts (jobs.invoke defaults to 1).
//   - A rejected item is looked up by key; a cancelled Run, or a never-started one admitted under an
//     older job revision, is cancelled and re-issued as a<n+1>.
import type { WorkItem } from "./plan.js";
import { loadRuns, loadSteps, type SeriesRow, type StepRow, type StepRunRow } from "./repo.js";
import { asArray, asRecord, asString, errorText, unwrapPayload, type Row } from "./nex.js";
import { runKey } from "./refs.js";
import { sha256Hex } from "./sha.js";
import { appendEvent, tx } from "./store.js";
import type { AppStore, NexClient } from "./types.js";

export const HORIZON_MS = 18 * 60 * 60 * 1000;
export const MAX_ATTEMPT_KEYS = 5;
export const MAX_ATTEMPTS: Record<string, number> = {
  "sequences.step": 5,
  "sequences.draw": 5,
  "sequences.send": 3,
  "sequences.notify": 5,
  "sequences.agent": 2,
};
const BATCHED_JOBS = new Set(["sequences.step", "sequences.notify"]);
const NOT_STARTED = new Set(["pending", "queued", "delayed"]);

export type JobIds = Map<string, { job_id: string; revision_id: string | null; updated_at: string }>;

export type Admission = {
  key: string;
  job_name: string;
  input: Record<string, string>;
  available_at: string;
  serialization_key?: string;
  step_instance_id: string | null; // null for the system probe and notify Runs
  phase: string;
  attempt_no: number;
};

export type AcceptReport = {
  accepted: string[];
  adopted: string[];
  cancelled: string[];
  pending: string[];
  errors: Array<{ key: string; error: string }>;
};

const stamp = (now: Date) => now.toISOString().slice(0, 16).replace(/[-:T]/g, "");

/** The work items of one step the tick should admit now (ignores ones already admitted). */
export function admissible(step: StepRow, runs: readonly StepRunRow[], now: Date, importedDrawings: ReadonlySet<string>): Array<{ item: WorkItem; available_at: string; attempt_no: number; recover: StepRunRow | null }> {
  const out: Array<{ item: WorkItem; available_at: string; attempt_no: number; recover: StepRunRow | null }> = [];
  const due = step.work.filter((item) => item.due_at && Date.parse(item.due_at) <= now.getTime());
  const superseding = [...due].reverse().find((item) => item.supersedes_earlier);
  for (const item of step.work) {
    const mine = runs.filter((run) => run.step_instance_id === step.id && run.phase === item.phase);
    if (mine.some((run) => ["accepted", "claimed", "finished"].includes(run.state))) continue;
    const recovering = mine.find((run) => run.state === "accepting") ?? null;
    if (recovering) {
      out.push({ item, available_at: recovering.available_at ?? now.toISOString(), attempt_no: recovering.attempt_no, recover: recovering });
      continue;
    }
    const attempt = Math.max(0, ...mine.map((run) => run.attempt_no)) + 1;
    if (attempt > MAX_ATTEMPT_KEYS) continue;
    if (item.wait_for === "import") {
      const key = `${String(step.expected.night)}#${String(step.expected.drawing_no)}`;
      if (!importedDrawings.has(key)) continue;
      out.push({ item, available_at: now.toISOString(), attempt_no: attempt, recover: null });
      continue;
    }
    if (!item.due_at || Date.parse(item.due_at) > now.getTime() + HORIZON_MS) continue;
    // A later phase that is already due makes the earlier read pointless (a night imported late).
    if (superseding && item !== superseding && due.includes(item) && due.indexOf(item) < due.indexOf(superseding)) continue;
    out.push({ item, available_at: item.due_at, attempt_no: attempt, recover: null });
  }
  return out;
}

async function findRunByKey(nex: NexClient, jobId: string, key: string): Promise<Row | null> {
  const runs = asArray(unwrapPayload(await nex.jobs.runs.list({ idempotency_key: key, job_definition_id: jobId, limit: 5 })).runs);
  return runs[0] ?? null;
}

async function recordAccepted(store: AppStore, admission: Admission, run: Row, how: "accepted" | "adopted"): Promise<void> {
  if (!admission.step_instance_id) return;
  await tx(store, async (q) => {
    await q.query(
      "UPDATE step_runs SET state = 'accepted', nex_run_id = $2, job_revision_id = $3, accepted_at = now(), detail = detail || $4::jsonb WHERE run_key = $1 AND state = 'accepting'",
      [admission.key, asString(run.id), asString(run.job_revision_id) || null, JSON.stringify({ accepted_by: how })],
    );
    await q.query("UPDATE step_instances SET run_state = 'accepted', attempt_no = GREATEST(attempt_no, $2), updated_at = now() WHERE id = $1 AND run_state IN ('none', 'accepting', 'finished')", [admission.step_instance_id, admission.attempt_no]);
  });
}

async function markCancelled(store: AppStore, key: string, why: Record<string, unknown>): Promise<void> {
  await store.query("UPDATE step_runs SET state = 'cancelled', detail = detail || $2::jsonb WHERE run_key = $1 AND state IN ('accepting', 'accepted')", [key, JSON.stringify(why)]);
}

/**
 * Resolves one item the runtime would not admit, or one found still accepting: adopt the Run its
 * key already has, or cancel a dead or old-revision one so the next tick issues a<n+1>.
 */
async function settleByLookup(store: AppStore, nex: NexClient, jobs: JobIds, admission: Admission, errorCode: string | null, report: AcceptReport): Promise<"adopted" | "cancelled" | "missing"> {
  const job = jobs.get(admission.job_name)!;
  const run = await findRunByKey(nex, job.job_id, admission.key);
  if (!run) {
    if (errorCode) {
      await markCancelled(store, admission.key, { rejected: errorCode });
      report.cancelled.push(admission.key);
      return "cancelled";
    }
    return "missing";
  }
  const status = asString(run.status);
  const oldRevision = job.revision_id && asString(run.job_revision_id) && asString(run.job_revision_id) !== job.revision_id;
  if (status === "cancelled" || (NOT_STARTED.has(status) && !run.started_at && oldRevision)) {
    if (status !== "cancelled") await nex.jobs.cancel({ run_id: asString(run.id) });
    await markCancelled(store, admission.key, { run_id: asString(run.id), reason: status === "cancelled" ? "run_cancelled" : "old_job_revision" });
    report.cancelled.push(admission.key);
    return "cancelled";
  }
  await recordAccepted(store, admission, run, "adopted");
  report.adopted.push(admission.key);
  return "adopted";
}

/** Admits a list of Runs: batched ones in one partial invokeMany, serialized ones one at a time. */
export async function admit(store: AppStore, nex: NexClient, jobs: JobIds, admissions: readonly Admission[], now: Date, report: AcceptReport): Promise<void> {
  const batched = admissions.filter((admission) => BATCHED_JOBS.has(admission.job_name));
  const single = admissions.filter((admission) => !BATCHED_JOBS.has(admission.job_name));
  const item = (admission: Admission) => ({
    job_id: jobs.get(admission.job_name)!.job_id,
    input: admission.input,
    trigger_source: "sequences",
    available_at: admission.available_at,
    max_attempts: MAX_ATTEMPTS[admission.job_name] ?? 3,
    idempotency_key: admission.key,
  });
  if (batched.length > 0) {
    const batchKey = `seq:batch:${stamp(now)}:${sha256Hex(batched.map((admission) => admission.key).sort().join("\n")).slice(0, 12)}`;
    let outcomes: Row[] | null = null;
    try {
      outcomes = asArray(unwrapPayload(await nex.jobs.invokeMany({ items: batched.map(item), atomicity: "partial", batch_idempotency_key: batchKey })).outcomes);
    } catch (error) {
      // The whole call failed (transport, a batch-level mismatch): every row stays accepting and the
      // next tick looks each key up first.
      report.errors.push({ key: batchKey, error: errorText(error).slice(0, 200) });
    }
    if (outcomes) {
      for (const [position, admission] of batched.entries()) {
        const outcome = outcomes.find((entry) => Number(entry.item_position) === position) ?? outcomes[position];
        const verdict = asString(outcome?.outcome);
        if ((verdict === "accepted" || verdict === "replayed") && asString(outcome?.job_run_id)) {
          await recordAccepted(store, admission, { id: outcome!.job_run_id, job_revision_id: null }, "accepted");
          report.accepted.push(admission.key);
        } else {
          await settleByLookup(store, nex, jobs, admission, asString(outcome?.error_code) || "rejected", report);
        }
      }
    }
  }
  for (const admission of single) {
    try {
      const result = unwrapPayload(await nex.jobs.invoke({ ...item(admission), ...(admission.serialization_key ? { serialization_key: admission.serialization_key } : {}) }));
      const run = asRecord(result.run);
      if (!asString(run.id)) throw new Error("jobs.invoke returned no run");
      await recordAccepted(store, admission, run, "accepted");
      report.accepted.push(admission.key);
    } catch (error) {
      const settled = await settleByLookup(store, nex, jobs, admission, errorText(error).slice(0, 120), report).catch((lookupError) => {
        report.errors.push({ key: admission.key, error: errorText(lookupError).slice(0, 200) });
        return "missing" as const;
      });
      if (settled === "missing") report.errors.push({ key: admission.key, error: errorText(error).slice(0, 200) });
    }
  }
}

function serializationKeyFor(series: SeriesRow, step: StepRow, item: WorkItem): string | undefined {
  if (item.job === "sequences.draw") return `seq-draw:${series.prize_scope ?? series.id}`;
  return undefined;
}

/**
 * One series: recover rows left accepting, cancel old-revision delayed Runs, then admit what is due
 * within the 18 h horizon. Called inside its own try by the tick, so one series cannot stop another.
 */
export async function acceptSeries(store: AppStore, nex: NexClient, jobs: JobIds, series: SeriesRow, now: Date, importedDrawings: ReadonlySet<string>): Promise<AcceptReport> {
  const report: AcceptReport = { accepted: [], adopted: [], cancelled: [], pending: [], errors: [] };
  const steps = await loadSteps(store, series.id);
  const runs = await loadRuns(store, steps.map((step) => step.id));

  // Runs admitted before an upgrade: a never-started one from an older revision is re-issued.
  for (const run of runs.filter((entry) => entry.state === "accepted" && entry.nex_run_id)) {
    const job = jobs.get(run.job_name);
    if (!job?.revision_id || (run.accepted_at && Date.parse(run.accepted_at) >= Date.parse(job.updated_at))) continue;
    const live = asRecord(unwrapPayload(await nex.jobs.runs.get({ id: run.nex_run_id })).run);
    const status = asString(live.status);
    const stale = asString(live.job_revision_id) && asString(live.job_revision_id) !== job.revision_id && NOT_STARTED.has(status) && !live.started_at;
    if (status === "cancelled" || stale) {
      if (status !== "cancelled") await nex.jobs.cancel({ run_id: run.nex_run_id });
      await markCancelled(store, run.run_key, { run_id: run.nex_run_id, reason: status === "cancelled" ? "run_cancelled" : "old_job_revision" });
      report.cancelled.push(run.run_key);
      run.state = "cancelled";
    }
  }

  const admissions: Admission[] = [];
  for (const step of steps) {
    for (const candidate of admissible(step, runs, now, importedDrawings)) {
      if (!jobs.get(candidate.item.job)) {
        report.errors.push({ key: `${step.ref}#${candidate.item.phase}`, error: `job ${candidate.item.job} is not installed (runtime_jobs)` });
        continue;
      }
      const parts = step.ref.split("/")[1]!.split(".");
      const key = runKey(series.id, parts[0]!, parts[1]!, candidate.item.phase, candidate.attempt_no);
      const admission: Admission = {
        key,
        job_name: candidate.item.job,
        input: { step_instance_id: step.id, run_key: key },
        available_at: candidate.available_at,
        serialization_key: serializationKeyFor(series, step, candidate.item),
        step_instance_id: step.id,
        phase: candidate.item.phase,
        attempt_no: candidate.attempt_no,
      };
      if (candidate.recover) {
        // Lookup first: the Run may exist already (a crash between invoke and record).
        const settled = await settleByLookup(store, nex, jobs, admission, null, report);
        if (settled !== "missing") continue;
        admissions.push(admission); // no Run under this key: the same key is safe to send again
        continue;
      }
      const inserted = await store.query(
        "INSERT INTO step_runs (run_key, step_instance_id, phase, attempt_no, job_name, available_at, state) VALUES ($1, $2, $3, $4, $5, $6, 'accepting') ON CONFLICT (run_key) DO NOTHING",
        [key, step.id, candidate.item.phase, candidate.attempt_no, candidate.item.job, candidate.available_at],
      );
      if (inserted.rowCount !== 1) continue;
      await store.query("UPDATE step_instances SET run_state = 'accepting', updated_at = now() WHERE id = $1 AND run_state IN ('none', 'finished')", [step.id]);
      admissions.push(admission);
    }
  }
  await admit(store, nex, jobs, admissions, now, report);
  if (report.accepted.length + report.adopted.length + report.cancelled.length > 0) {
    await appendEvent(store, { series_id: series.id, actor: "engine:tick", event: "tick.accepted", detail: { accepted: report.accepted, adopted: report.adopted, cancelled: report.cancelled } });
  }
  return report;
}

/** The system Runs: the 30-minute probe and a notify round. Keys are per slot, so a slot runs once. */
export function systemAdmission(name: "probe" | "notify", now: Date, slotMinutes: number): Admission {
  const at = new Date(Math.floor(now.getTime() / (slotMinutes * 60_000)) * slotMinutes * 60_000);
  const slot = stamp(at);
  return {
    key: `seq:_system:${name}:${slot}`,
    job_name: name === "probe" ? "sequences.step" : "sequences.notify",
    input: { [name]: slot },
    available_at: now.toISOString(),
    step_instance_id: null,
    phase: name,
    attempt_no: 1,
  };
}
