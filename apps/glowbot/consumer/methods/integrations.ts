import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import type { GlowbotIntegrationsResponse } from "../../shared/types.js";
import { mapAdapterEntry } from "./helpers.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  let adapters: GlowbotIntegrationsResponse["adapters"] = [];

  try {
    const connections = await ctx.nex.adapters.list();
    adapters = connections.map((conn) =>
      mapAdapterEntry({
        adapter: conn.platform,
        name: conn.platform,
        status: conn.status,
        authMethod: null,
        lastSync: null,
        error: null,
        metadata: conn as unknown as Record<string, unknown>,
      }),
    );
  } catch {
    // Adapter SDK not yet available — return empty list.
    // Once the runtime ships the adapter SDK this will resolve automatically.
  }

  return { adapters } satisfies GlowbotIntegrationsResponse;
};
