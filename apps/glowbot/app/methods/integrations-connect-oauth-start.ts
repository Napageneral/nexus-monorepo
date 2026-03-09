import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import type { GlowbotIntegrationsConnectOauthStartResponse } from "../../shared/types.js";
import { getConnectMethodKind } from "./helpers.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  const params = ctx.params as { adapterId: string; connectionProfileId: string };
  const kind = getConnectMethodKind(ctx.app.packageDir, params.adapterId, params.connectionProfileId);
  if (kind !== "oauth2") {
    throw new Error(`Connection profile ${params.connectionProfileId} is not an OAuth profile`);
  }

  const result = await ctx.nex.adapters.connect({
    adapter: params.adapterId,
    config: {
      connectionProfileId: params.connectionProfileId,
    },
  });

  // The runtime will include a redirectUrl in the result for OAuth flows.
  const redirectUrl = (result as unknown as Record<string, unknown>).redirectUrl;
  if (typeof redirectUrl !== "string" || !redirectUrl) {
    throw new Error(`OAuth start for ${params.adapterId} did not return a redirect URL`);
  }

  return { redirectUrl } satisfies GlowbotIntegrationsConnectOauthStartResponse;
};
