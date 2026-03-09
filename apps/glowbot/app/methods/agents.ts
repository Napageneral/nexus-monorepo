import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import { getAgentsData } from "../pipeline/read-model.js";
import { resolveGlowbotBenchmarkContext } from "./benchmark-context.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  return getAgentsData(ctx.nex.runtime, resolveGlowbotBenchmarkContext(ctx));
};
