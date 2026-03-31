import type { NexAppMethodHandler } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { asOptionalNumber, asOptionalString } from "./_shared.js";
import { listBusinessOutcomes, withAttributionDb } from "../storage/store.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  const scopeId = asOptionalString(ctx.params.scope_id);
  const limit = asOptionalNumber(ctx.params.limit);
  return {
    scopeId,
    limit,
    outcomes: withAttributionDb(ctx.app.dataDir, (db) =>
      listBusinessOutcomes(db, { scopeId, limit: limit ?? 100 }),
    ),
  };
};
