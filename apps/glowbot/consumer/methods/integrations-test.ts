import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import type { GlowbotIntegrationsTestResponse } from "../../shared/types.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  const params = ctx.params as { adapterId: string };

  try {
    const result = await ctx.nex.adapters.test(params.adapterId);
    if (result.success) {
      return { ok: true } satisfies GlowbotIntegrationsTestResponse;
    }
    return {
      ok: false,
      error: result.message ?? "Adapter connection test failed",
    } satisfies GlowbotIntegrationsTestResponse;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Adapter connection test failed",
    } satisfies GlowbotIntegrationsTestResponse;
  }
};
