import type { NexAppMethodHandler } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { asOptionalNumber, asString } from "./_shared.js";
import { readSummary, withAttributionDb } from "../storage/store.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  const scopeId = asString(ctx.params.scope_id, "scope_id");
  return withAttributionDb(ctx.app.dataDir, (db) =>
    readSummary(db, scopeId, asOptionalNumber(ctx.params.days) ?? 30),
  );
};
