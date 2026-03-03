import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";

export const handle: NexAppMethodHandler = async (_ctx) => {
  // TODO: Implement aggregate benchmark data across clinic instances
  return { benchmarks: [] };
};
