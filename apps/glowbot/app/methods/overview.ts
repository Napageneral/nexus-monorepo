import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import { getOverviewData } from "../pipeline/read-model.js";
import { resolveGlowbotBenchmarkContext } from "./benchmark-context.js";
import { loadManifestAdapters, mapRuntimeStatusToGlowbot } from "./helpers.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  const period = (ctx.params as { period?: string })?.period ?? "30d";
  const validPeriod = period === "7d" || period === "30d" || period === "90d" ? period : "30d";

  const data = await getOverviewData(
    ctx.nex.runtime,
    validPeriod,
    resolveGlowbotBenchmarkContext(ctx),
  );

  // Merge adapter status from nex runtime when available
  let adapterStatus = data.adapterStatus;
  try {
    const manifestAdapters = loadManifestAdapters(ctx.app.packageDir);
    const connections = await ctx.nex.adapters.list();
    adapterStatus = manifestAdapters.map((adapter) => {
      const match = connections.find((entry) => entry.adapter === adapter.id && entry.status === "connected");
      return {
        adapterId: adapter.id,
        name: adapter.name,
        connected: mapRuntimeStatusToGlowbot(match?.status ?? "disconnected") === "connected",
        lastSync: match?.lastSync ? new Date(match.lastSync).toISOString() : null,
        error: match?.error ?? null,
      };
    });
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
