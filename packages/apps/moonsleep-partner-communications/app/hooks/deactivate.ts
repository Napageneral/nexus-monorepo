import type { NexAppHookContext } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { disablePartnerDeskRuntimeWork } from "./runtime-work.js";

export default async function onDeactivate(ctx: NexAppHookContext): Promise<void> {
  await disablePartnerDeskRuntimeWork(ctx.nex);
}
