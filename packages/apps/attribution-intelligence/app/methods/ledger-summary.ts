import type { NexAppMethodHandler } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { asOptionalNumber, asString } from "./_shared.js";
import { readLedgerSummary, withAttributionDb } from "../storage/store.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  const scopeId = asString(ctx.params.scope_id, "scope_id");
  const days = asOptionalNumber(ctx.params.days);
  const payload = withAttributionDb(ctx.app.dataDir, (db) =>
    readLedgerSummary(db, {
      scopeId,
      days: days ?? 30,
    }),
  );
  return {
    scopeId,
    days: days ?? 30,
    current_window: payload.currentWindow,
    summary: payload.summary,
  };
};
