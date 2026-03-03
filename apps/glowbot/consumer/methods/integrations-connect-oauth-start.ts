import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import type { GlowbotIntegrationsConnectOauthStartResponse } from "../../shared/types.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  const params = ctx.params as { adapterId: string };

  // OAuth start requires a redirect URL back from the adapter SDK.
  // The SDK's connect() will be extended to support OAuth flows — for now
  // we call connect with authMethod: "oauth2" and extract the redirect URL
  // from the response (the runtime will populate this when the SDK is ready).
  const result = await ctx.nex.adapters.connect({
    platform: params.adapterId,
    config: { authMethod: "oauth2" },
  });

  // The runtime will include a redirectUrl in the result for OAuth flows.
  const redirectUrl = (result as unknown as Record<string, unknown>).redirectUrl;
  if (typeof redirectUrl !== "string" || !redirectUrl) {
    throw new Error(`OAuth start for ${params.adapterId} did not return a redirect URL`);
  }

  return { redirectUrl } satisfies GlowbotIntegrationsConnectOauthStartResponse;
};
