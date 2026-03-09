import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import { getAgentsRecommendations } from "../pipeline/read-model.js";
import { resolveGlowbotBenchmarkContext } from "./benchmark-context.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  const params = ctx.params as { category?: string; limit?: number };
  return getAgentsRecommendations(ctx.nex.runtime, {
    category: params?.category,
    limit: params?.limit,
  }, resolveGlowbotBenchmarkContext(ctx));
};
