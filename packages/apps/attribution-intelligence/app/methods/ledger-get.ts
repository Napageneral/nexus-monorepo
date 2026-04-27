import type { NexAppMethodHandler } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { asString } from "./_shared.js";
import { getLedgerOutcome, withAttributionDb } from "../storage/store.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  const scopeId = asString(ctx.params.scope_id, "scope_id");
  const outcomeId = asString(ctx.params.outcome_id, "outcome_id");
  return {
    scopeId,
    outcomeId,
    outcome: withAttributionDb(ctx.app.dataDir, (db) =>
      getLedgerOutcome(db, { scopeId, outcomeId }),
    ),
  };
};
