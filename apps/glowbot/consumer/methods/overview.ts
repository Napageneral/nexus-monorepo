import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import { getOverviewData } from "../pipeline/store.js";
import { initStoreForContext } from "./store-init.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  initStoreForContext(ctx);

  const period = (ctx.params as { period?: string })?.period ?? "30d";
  const validPeriod = period === "7d" || period === "30d" || period === "90d" ? period : "30d";

  const data = getOverviewData(validPeriod);

  // Merge adapter status from nex runtime when available
  let adapterStatus = data.adapterStatus;
  try {
    const adapters = await ctx.nex.adapters.list();
    adapterStatus = adapters.map((a: { id: string; name: string; status: string; lastSync?: number; error?: string | null }) => ({
      adapterId: a.id,
      name: a.name,
      connected: a.status === "connected",
      lastSync: a.lastSync ? new Date(a.lastSync).toISOString() : null,
      error: a.error ?? null,
    }));
  } catch {
    // Adapter SDK not ready yet — use pipeline-derived status
  }

  return {
    heroStat: data.heroStat,
    topActions: data.topActions,
    adapterStatus,
    pipelineStatus: data.pipelineStatus,
  };
};
