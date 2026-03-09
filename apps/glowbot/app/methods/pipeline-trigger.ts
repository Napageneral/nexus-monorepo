import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import { triggerPipelineRun } from "../pipeline/read-model.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  return triggerPipelineRun(ctx.nex.runtime);
};
