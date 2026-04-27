import type { NexAppMethodHandler } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { asString } from "./_shared.js";
import { deleteBinding, withAttributionDb } from "../storage/store.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  return {
    binding: withAttributionDb(ctx.app.dataDir, (db) =>
      deleteBinding(db, asString(ctx.params.binding_id, "binding_id")),
    ),
  };
};
