import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import type { GlowbotIntegrationsConnectApikeyResponse } from "../../shared/types.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  const params = ctx.params as { adapterId: string; fields: Record<string, string> };

  try {
    const result = await ctx.nex.adapters.connect({
      platform: params.adapterId,
      config: {
        authMethod: "api_key",
        fields: params.fields,
      },
    });

    if (result.status !== "connected") {
      return {
        status: "error",
        error: `Connection failed with status: ${result.status}`,
      } satisfies GlowbotIntegrationsConnectApikeyResponse;
    }

    return { status: "connected" } satisfies GlowbotIntegrationsConnectApikeyResponse;
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : "Failed to connect adapter",
    } satisfies GlowbotIntegrationsConnectApikeyResponse;
  }
};
