import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import { triggerPipelineRun } from "../pipeline/store.js";
import { initStoreForContext } from "./store-init.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  initStoreForContext(ctx);
  return triggerPipelineRun();
};
