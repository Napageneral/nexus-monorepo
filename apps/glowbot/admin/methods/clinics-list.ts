import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";

export const handle: NexAppMethodHandler = async (_ctx) => {
  // TODO: Implement clinic listing via frontdoor API or admin data store
  return { clinics: [] };
};
