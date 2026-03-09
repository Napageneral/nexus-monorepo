import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import { getModelingData } from "../pipeline/read-model.js";
import { resolveGlowbotBenchmarkContext } from "./benchmark-context.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  const params = ctx.params as { model?: string; window?: string };
  const model = params?.model ?? "ad_spend_to_consults";
  const window = params?.window ?? "6m";
  const validWindow = window === "3m" || window === "6m" || window === "12m" ? window : "6m";

  return getModelingData(
    ctx.nex.runtime,
    { model, window: validWindow },
    resolveGlowbotBenchmarkContext(ctx),
  );
};
