// The handler's claim and finish. A Run claims its step phase by compare-and-set on step_runs; no
// row updated means a no-op (and A2, unless the phase already finished). The outcome, the step's
// new state and its dependents' ready_at commit in ONE app-store transaction, never through a
// checkpoint `downstream` (only the tick admits Runs).
import { openAlert } from "./alerts.js";
import { loadRun, loadStep, updateStepResult, type StepRow, type StepRunRow } from "./repo.js";
import { appendEvent, tx } from "./store.js";
import type { AppStore, JobContext } from "./types.js";

export type Claim = { ok: true; run: StepRunRow; step: StepRow } | { ok: false; noop: true; reason: string; finished: boolean };

export function refuseTrigger(ctx: JobContext, expected: string, contract: string): Record<string, unknown> | null {
  if (ctx.run.trigger_source === expected) return null;
  // jobs.requeue sets 'requeue' and schedules.trigger / a hand invoke set others: never a duplicate path.
  return { contract_id: contract, run_id: ctx.run.id, refused: "refuse.trigger_source", trigger_source: ctx.run.trigger_source, expected };
}

export async function claimRun(store: AppStore, ctx: JobContext): Promise<Claim> {
  const runKey = String(ctx.input.run_key ?? "");
  const stepId = String(ctx.input.step_instance_id ?? "");
  if (!runKey || !stepId) return { ok: false, noop: true, reason: "input carries no run_key and step_instance_id", finished: false };
  return tx(store, async (q) => {
    const claimed = await q.query(
      `UPDATE step_runs SET state = 'claimed', nex_run_id = $2
        WHERE run_key = $1 AND step_instance_id = $3 AND state IN ('accepting', 'accepted', 'claimed') AND (nex_run_id IS NULL OR nex_run_id = $2)
        RETURNING run_key`,
      [runKey, ctx.run.id, stepId],
    );
    const run = await loadRun(q, runKey);
    if (claimed.rowCount !== 1 || !run) {
      const finished = run?.state === "finished";
      if (!finished) {
        await openAlert(
          q,
          { rule: "A2", subject_ref: `run:${ctx.run.id}`, immediate: true, fix_by: null, detail: { code: "A2.claim_refused", message: `Run ${ctx.run.id} could not claim ${runKey} (state ${run?.state ?? "missing"}, held by ${run?.nex_run_id ?? "none"})`, ref: null, series_id: null, run_key: runKey } },
          ctx.now ?? new Date(),
          `job:${ctx.run.id}`,
        );
      }
      return { ok: false as const, noop: true as const, reason: finished ? "already finished" : `claim refused (state ${run?.state ?? "missing"})`, finished };
    }
    await q.query("UPDATE step_instances SET run_state = 'claimed', nex_run_id = $2, updated_at = now() WHERE id = $1", [stepId, ctx.run.id]);
    const step = (await loadStep(q, stepId))!;
    return { ok: true as const, run, step };
  });
}

/** One transaction: the phase's outcome, the step's state and result, and the step event. */
export async function finishRun(
  store: AppStore,
  ctx: JobContext,
  claim: Extract<Claim, { ok: true }>,
  outcome: { state?: string; mode?: string; result: Record<string, unknown>; event: string; detail?: Record<string, unknown>; also?: (q: AppStore) => Promise<void> },
): Promise<void> {
  await tx(store, async (q) => {
    await q.query("UPDATE step_runs SET state = 'finished', finished_at = now(), detail = detail || $2::jsonb WHERE run_key = $1 AND nex_run_id = $3", [
      claim.run.run_key,
      JSON.stringify({ outcome: outcome.event }),
      ctx.run.id,
    ]);
    const current = (await loadStep(q, claim.step.id))!;
    await updateStepResult(q, claim.step.id, {
      run_state: "finished",
      result: { ...current.result, ...outcome.result },
      ...(outcome.state ? { state: outcome.state } : {}),
      ...(outcome.mode ? { mode: outcome.mode } : {}),
    });
    if (outcome.also) await outcome.also(q);
    await appendEvent(q, { series_id: claim.step.series_id, step_instance_id: claim.step.id, actor: `job:${ctx.run.id}`, event: outcome.event, detail: { ref: claim.step.ref, phase: claim.run.phase, ...(outcome.detail ?? {}) } });
  });
}

/** The phase that closes a step's observation: the last planned engine Run. */
export function isFinalPhase(step: StepRow, phase: string): boolean {
  const phases = step.work.map((item) => item.phase);
  return phases[phases.length - 1] === phase;
}
