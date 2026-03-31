import type { NexAppMethodHandler } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { asOptionalString } from "./_shared.js";
import { listBindings, withAttributionDb } from "../storage/store.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  return {
    bindings: withAttributionDb(ctx.app.dataDir, (db) =>
      listBindings(db, { scopeId: asOptionalString(ctx.params.scope_id) }),
    ),
  };
};
