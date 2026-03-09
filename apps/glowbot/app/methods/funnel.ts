import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import { getFunnelData } from "../pipeline/read-model.js";
import { resolveGlowbotBenchmarkContext } from "./benchmark-context.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  const period = (ctx.params as { period?: string })?.period ?? "30d";
  const validPeriod = period === "7d" || period === "30d" || period === "90d" ? period : "30d";

  return getFunnelData(ctx.nex.runtime, validPeriod, resolveGlowbotBenchmarkContext(ctx));
};
