import type { NexAppMethodHandler } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { asOptionalNumber } from "./_shared.js";
import { listScopes, withAttributionDb } from "../storage/store.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  return {
    scopes: withAttributionDb(ctx.app.dataDir, (db) => listScopes(db, asOptionalNumber(ctx.params.limit) ?? 50)),
  };
};
