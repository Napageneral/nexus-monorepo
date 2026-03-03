import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import { getModelingData } from "../pipeline/store.js";
import { initStoreForContext } from "./store-init.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  initStoreForContext(ctx);

  const params = ctx.params as { model?: string; window?: string };
  const model = params?.model ?? "ad_spend_to_consults";
  const window = params?.window ?? "6m";
  const validWindow = window === "3m" || window === "6m" || window === "12m" ? window : "6m";

  return getModelingData({ model, window: validWindow });
};
