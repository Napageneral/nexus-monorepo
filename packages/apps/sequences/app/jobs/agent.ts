import type { JobContext } from "../lib/types.js";

/** sequences.agent: inactive until P5 (the Nex claude-cli fence). It refuses every Run. */
export default async function sequencesAgent(ctx: JobContext) {
  return { contract_id: "sequences_agent_v1", run_id: ctx.run.id, refused: "refuse.not_engine_owned", why: "agent steps arrive with P5" };
}
