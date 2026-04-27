import type { NexAppMethodHandler } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { asOptionalString, asString } from "./_shared.js";
import { getBusinessOutcome, withAttributionDb } from "../storage/store.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  const outcomeId = asString(ctx.params.outcome_id, "outcome_id");
  const scopeId = asOptionalString(ctx.params.scope_id);
  return {
    scopeId,
    outcomeId,
    outcome: withAttributionDb(ctx.app.dataDir, (db) => getBusinessOutcome(db, outcomeId, scopeId)),
  };
};
