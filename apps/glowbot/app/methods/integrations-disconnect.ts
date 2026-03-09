import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import type { GlowbotIntegrationsDisconnectResponse } from "../../shared/types.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  const params = ctx.params as { connectionId: string };

  await ctx.nex.adapters.disconnect(params.connectionId);
  return { status: "disconnected" } satisfies GlowbotIntegrationsDisconnectResponse;
};
