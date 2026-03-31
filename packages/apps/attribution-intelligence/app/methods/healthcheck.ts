import type { NexAppMethodHandler } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { readHealthcheck, withAttributionDb } from "../storage/store.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  return {
    status: "ok",
    app: {
      id: ctx.app.id,
      version: ctx.app.version,
    },
    storage: withAttributionDb(ctx.app.dataDir, (db) => readHealthcheck(db)),
  };
};
