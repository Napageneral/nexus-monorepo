import type { NexAppMethodHandler } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { asString } from "./_shared.js";
import { getBusinessOutcome, withAttributionDb } from "../storage/store.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  const outcomeId = asString(ctx.params.outcome_id, "outcome_id");
  return {
    outcomeId,
    outcome: withAttributionDb(ctx.app.dataDir, (db) => getBusinessOutcome(db, outcomeId)),
  };
};
