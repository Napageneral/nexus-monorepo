import type { NexAppMethodHandler } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { asOptionalNumber, asString } from "./_shared.js";
import { listAdFactsForScope, withAttributionDb } from "../storage/store.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  const scopeId = asString(ctx.params.scope_id, "scope_id");
  const limit = Math.max(1, asOptionalNumber(ctx.params.limit) ?? 50);
  const rows = withAttributionDb(ctx.app.dataDir, (db) => listAdFactsForScope(db, scopeId))
    .slice(-limit)
    .reverse();
  return {
    scopeId,
    limit,
    rows,
  };
};
