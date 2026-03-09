import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import { getPipelineStatus } from "../pipeline/read-model.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  return getPipelineStatus(ctx.nex.runtime);
};
