import type { NexAppMethodHandler } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { asOptionalNumber, asString } from "./_shared.js";
import { readFunnel, withAttributionDb } from "../storage/store.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  return withAttributionDb(ctx.app.dataDir, (db) =>
    readFunnel(db, asString(ctx.params.scope_id, "scope_id"), asOptionalNumber(ctx.params.days) ?? 30),
  );
};
