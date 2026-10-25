import { requireStore } from "../lib/store.js";
import type { JobContext } from "../lib/types.js";

/**
 * sequences.tick: the one scheduled job. Skeleton body: record the tick in the app store in one
 * exclusive transaction. The real tick accepts due step Runs with jobs.invokeMany; add each runtime
 * method it calls to the job's runtime_method_allowlist (hooks/runtime-work.ts).
 */
export default async function sequencesTick(ctx: JobContext) {
  const store = requireStore(ctx.app);
  const result = await store.transaction((tx) =>
    tx.query<{ ticks: string }>(
      "UPDATE health SET last_tick_at = now(), last_tick_run_id = $1, ticks = ticks + 1 WHERE id = 'singleton' RETURNING ticks",
      [ctx.run.id],
    ),
  );
  if (result.rowCount !== 1) {
    throw new Error("sequences health row is missing (migration 0001 seeds it)");
  }
  return {
    contract_id: "sequences_tick_v1",
    run_id: ctx.run.id,
    trigger_source: ctx.run.trigger_source,
    ticks: Number(result.rows[0].ticks),
  };
}
