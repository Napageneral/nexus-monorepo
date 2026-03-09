import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import type { GlowbotIntegrationsConnectApikeyResponse } from "../../shared/types.js";
import { getConnectMethodKind } from "./helpers.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  const params = ctx.params as {
    adapterId: string;
    connectionProfileId: string;
    fields: Record<string, string>;
  };
  const kind = getConnectMethodKind(ctx.app.packageDir, params.adapterId, params.connectionProfileId);
  if (kind !== "api-key") {
    throw new Error(`Connection profile ${params.connectionProfileId} is not an API key profile`);
  }

  try {
    const result = await ctx.nex.adapters.connect({
      adapter: params.adapterId,
      config: {
        connectionProfileId: params.connectionProfileId,
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
