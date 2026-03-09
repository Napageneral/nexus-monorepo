import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import type { GlowbotIntegrationsBackfillResponse } from "../../shared/types.js";
import { resolveBackfillSince } from "./helpers.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  const params = ctx.params as {
    adapterId: string;
    connectionId: string;
    since?: string;
  };

  const since = resolveBackfillSince({
    packageDir: ctx.app.packageDir,
    adapterId: params.adapterId,
    since: params.since,
  });

  const result = await ctx.nex.adapters.backfill(params.connectionId, { since });
  return {
    status: "completed",
    since,
    recordsProcessed: result.recordsProcessed,
  } satisfies GlowbotIntegrationsBackfillResponse;
};
