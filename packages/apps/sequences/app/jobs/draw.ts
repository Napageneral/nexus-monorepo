import { refuseTrigger } from "../lib/claim.js";
import { runShadowDraw } from "../lib/run-draw.js";
import type { JobContext } from "../lib/types.js";

/**
 * sequences.draw: one drawing phase, serialized per prize scope (seq-draw:<prize_scope>). P1b is
 * shadow only: S0/S1 entries reads and the C compare against the Mac's imported drawing. A live
 * draw is refused with refuse.not_engine_owned until the P3 gate passes.
 */
export default async function sequencesDraw(ctx: JobContext) {
  const refused = refuseTrigger(ctx, "sequences", "sequences_draw_v1");
  if (refused) return refused;
  return runShadowDraw(ctx);
}
