import { refuseTrigger } from "../lib/claim.js";
import { runObserve, runProbe } from "../lib/run-step.js";
import type { JobContext } from "../lib/types.js";

/**
 * sequences.step: one step phase. P1b runs the 30-minute system probe and the observe reads of the
 * review sender's night asks and follow-ups. It refuses any Run the tick did not admit
 * (trigger_source 'sequences'), which closes the jobs.requeue and schedules.trigger duplicates.
 */
export default async function sequencesStep(ctx: JobContext) {
  const refused = refuseTrigger(ctx, "sequences", "sequences_step_v1");
  if (refused) return refused;
  if (typeof ctx.input.probe === "string") return runProbe(ctx);
  return runObserve(ctx);
}
