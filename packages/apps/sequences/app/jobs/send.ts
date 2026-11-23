import type { JobContext } from "../lib/types.js";

/**
 * sequences.send: one shard of a send step. P1b refuses every Run: no engine customer send exists
 * before P2, and nothing here holds a provider credential. The Run completes (it is not an error to
 * retry), and the refusal is its output.
 */
export default async function sequencesSend(ctx: JobContext) {
  return {
    contract_id: "sequences_send_v1",
    run_id: ctx.run.id,
    refused: "refuse.not_engine_owned",
    why: "engine sends arrive with P2 (Fri 10/30), after the series go and the send switch",
    provider_write_authority: false,
  };
}
