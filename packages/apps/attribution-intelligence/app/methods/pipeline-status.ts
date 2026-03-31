import type { NexAppMethodHandler } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { asOptionalString } from "./_shared.js";
import { readPipelineStatus, withAttributionDb } from "../storage/store.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  return {
    pipeline: withAttributionDb(ctx.app.dataDir, (db) =>
      readPipelineStatus(db, asOptionalString(ctx.params.scope_id)),
    ),
  };
};
