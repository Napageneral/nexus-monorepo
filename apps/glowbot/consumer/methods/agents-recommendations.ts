import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import { getAgentsRecommendations } from "../pipeline/store.js";
import { initStoreForContext } from "./store-init.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  initStoreForContext(ctx);

  const params = ctx.params as { category?: string; limit?: number };
  return getAgentsRecommendations({
    category: params?.category,
    limit: params?.limit,
  });
};
