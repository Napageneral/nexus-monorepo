import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import { callGlowbotHubOperation, getGlowbotHubHealth } from "./_proxy.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  const [hubHealth, diagnostics, benchmarkNetwork, productFlags] = await Promise.all([
    getGlowbotHubHealth(ctx),
    callGlowbotHubOperation<Record<string, unknown>>(ctx, "glowbotHub.diagnostics.summary", {}),
    callGlowbotHubOperation<Record<string, unknown>>(ctx, "glowbotHub.benchmarks.networkHealth", {}),
    callGlowbotHubOperation<Record<string, unknown>>(ctx, "glowbotHub.productFlags.list", {}),
  ]);

  return {
    hubHealth,
    diagnostics,
    benchmarkNetwork,
    productFlags,
  };
};
