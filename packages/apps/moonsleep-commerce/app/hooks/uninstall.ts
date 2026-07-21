import type { NexAppHookContext } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { removeMoonSleepCommerceRuntimeWork } from "./runtime-work.js";

export default async function onUninstall(ctx: NexAppHookContext): Promise<void> {
  await removeMoonSleepCommerceRuntimeWork(ctx.nex);
}
