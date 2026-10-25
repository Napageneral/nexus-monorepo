// What a sequences.step Run does in P1b: the 30-minute system probe (worker reach to the ops API
// and drand) and the observe reads of the review sender's night asks and follow-ups.
import { claimRun, finishRun, isFinalPhase } from "./claim.js";
import { judgeFollowup, judgeNight, parseInvitations } from "./observe.js";
import { loadSeries } from "./repo.js";
import { readDrand, readSource, resolveOpsAccess, type SourceDeps, type SourceRead } from "./sources.js";
import { shortId } from "./sha.js";
import { appendEvent, requireStore } from "./store.js";
import type { AppStore, JobContext } from "./types.js";

export class RetryableError extends Error {
  readonly retryable = true;
}

/** Hashes and counts only: the snapshot body is the route's rows, which carry no addresses. */
export async function saveSnapshot(q: AppStore, read: Extract<SourceRead, { ok: true }>, source: string, params: Record<string, string>, stepId: string | null, phase: string | null, by: string): Promise<string> {
  const id = shortId("src", source, JSON.stringify(params), read.answer.as_of, read.answer.sha256, phase ?? "");
  await q.query(
    `INSERT INTO source_snapshots (id, source, params, as_of, sha256, local_sha256, count, body, step_instance_id, phase, fetched_by)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8::jsonb, $9, $10, $11) ON CONFLICT (id) DO NOTHING`,
    [id, source, JSON.stringify(params), read.answer.as_of, read.answer.sha256, read.local_sha256, read.answer.count, JSON.stringify(read.answer.rows), stepId, phase, by],
  );
  return id;
}

export async function runProbe(ctx: JobContext, deps: SourceDeps = {}): Promise<Record<string, unknown>> {
  const store = requireStore(ctx.app);
  const access = await resolveOpsAccess(ctx.nex);
  const ops = await readSource("health", {}, access, { ...deps, abortSignal: ctx.abortSignal });
  const drand = await readDrand("info", deps);
  const now = ctx.now ?? new Date();
  await store.query(
    "UPDATE health SET last_ops_reach_at = $1, last_ops_reach_ok = $2, last_drand_reach_at = $1, last_drand_reach_ok = $3 WHERE id = 'singleton'",
    [now.toISOString(), ops.ok, drand.ok],
  );
  const detail = {
    slot: String(ctx.input.probe),
    ops: ops.ok ? { ok: true, as_of: ops.answer.as_of, attempts: ops.attempts } : { ok: false, code: ops.code, message: ops.message, attempts: ops.attempts },
    drand: drand.ok ? { ok: true } : { ok: false, message: drand.message },
  };
  await appendEvent(store, { actor: `job:${ctx.run.id}`, event: "probe", detail });
  return { contract_id: "sequences_probe_v1", run_id: ctx.run.id, ...detail };
}

/** An observe Run: read the night's invitation counts and judge them against the plan. */
export async function runObserve(ctx: JobContext, deps: SourceDeps = {}): Promise<Record<string, unknown>> {
  const store = requireStore(ctx.app);
  const claim = await claimRun(store, ctx);
  if (!claim.ok) return { contract_id: "sequences_step_v1", run_id: ctx.run.id, noop: claim.reason };
  const { step, run } = claim;
  const series = await loadSeries(store, step.series_id);
  if (!series || series.state === "paused" || series.state === "done") {
    await finishRun(store, ctx, claim, { result: { [`phase_${run.phase}`]: { skipped: `series ${series?.state ?? "missing"}` } }, event: "step.phase_skipped" });
    return { contract_id: "sequences_step_v1", run_id: ctx.run.id, skipped: `series ${series?.state ?? "missing"}` };
  }
  if (step.expected.observe !== "invitations") {
    await finishRun(store, ctx, claim, { result: { [`phase_${run.phase}`]: { refused: "refuse.not_engine_owned" } }, event: "step.phase_refused" });
    return { contract_id: "sequences_step_v1", run_id: ctx.run.id, refused: "refuse.not_engine_owned" };
  }
  const night = String(step.expected.night);
  const params = { night };
  const access = await resolveOpsAccess(ctx.nex);
  const read = await readSource("invitations", params, access, { ...deps, abortSignal: ctx.abortSignal });
  if (!read.ok && read.code !== "hold.source_stale") {
    // Transport or credential trouble: let the kernel retry with backoff until not_after.
    throw new RetryableError(`transient_dependency_failure: ${read.message}`);
  }
  const counts = read.ok ? parseInvitations(read.answer.rows, night) : null;
  const judged = step.expected.ledger === "night" ? judgeNight(step.expected, counts, run.phase) : judgeFollowup(counts, run.phase);
  const final = isFinalPhase(step, run.phase) || step.work.find((item) => item.phase === run.phase)?.supersedes_earlier === true;
  const state = final && judged.verdict !== "pending" ? (judged.verdict === "short" ? "short" : judged.verdict === "unknown" ? "observing" : "adopted") : undefined;
  await finishRun(store, ctx, claim, {
    state,
    result: {
      verdict: judged.verdict,
      summary: judged.summary,
      receipt_kind: "none",
      observed: judged.detail,
      read: read.ok ? { source: "invitations", as_of: read.answer.as_of, sha256: read.answer.sha256, sha_matches: read.sha_matches } : { source: "invitations", unreadable: read.message },
      [`phase_${run.phase}`]: { verdict: judged.verdict, at: (ctx.now ?? new Date()).toISOString() },
    },
    event: "step.observed",
    detail: { verdict: judged.verdict },
    also: async (q) => {
      if (read.ok) await saveSnapshot(q, read, "invitations", params, step.id, run.phase, `job:${ctx.run.id}`);
    },
  });
  return { contract_id: "sequences_step_v1", run_id: ctx.run.id, ref: step.ref, phase: run.phase, verdict: judged.verdict };
}
