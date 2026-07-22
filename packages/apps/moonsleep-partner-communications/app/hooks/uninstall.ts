import type { NexAppHookContext } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { removePartnerDeskRuntimeWork } from "./runtime-work.js";

export default async function onUninstall(ctx: NexAppHookContext): Promise<void> {
  await removePartnerDeskRuntimeWork(ctx.nex);
}
