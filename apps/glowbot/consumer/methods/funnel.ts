import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import { getFunnelData } from "../pipeline/store.js";
import { initStoreForContext } from "./store-init.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  initStoreForContext(ctx);

  const period = (ctx.params as { period?: string })?.period ?? "30d";
  const validPeriod = period === "7d" || period === "30d" || period === "90d" ? period : "30d";

  return getFunnelData(validPeriod);
};
