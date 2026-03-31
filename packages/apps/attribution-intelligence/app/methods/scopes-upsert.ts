import type { NexAppMethodHandler } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { asOptionalString, asString } from "./_shared.js";
import { upsertScope, withAttributionDb } from "../storage/store.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  return {
    scope: withAttributionDb(ctx.app.dataDir, (db) =>
      upsertScope(db, {
        scopeId: asString(ctx.params.scope_id, "scope_id"),
        label: asString(ctx.params.label, "label"),
        description: asOptionalString(ctx.params.description),
      }),
    ),
  };
};
