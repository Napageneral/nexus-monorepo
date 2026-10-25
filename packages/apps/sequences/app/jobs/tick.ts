import { refuseTrigger } from "../lib/claim.js";
import { runTick } from "../lib/tick.js";
import type { JobContext } from "../lib/types.js";

/**
 * sequences.tick: the one scheduled job ('0 * * * * *' UTC, created disabled; armed only by
 * sequences.runtime.configure). It refuses any Run its schedule did not start. Every runtime method
 * it calls is in its runtime_method_allowlist (hooks/runtime-work.ts).
 */
export default async function sequencesTick(ctx: JobContext) {
  const refused = refuseTrigger(ctx, "schedule", "sequences_tick_v1");
  if (refused) return refused;
  return runTick(ctx);
}
