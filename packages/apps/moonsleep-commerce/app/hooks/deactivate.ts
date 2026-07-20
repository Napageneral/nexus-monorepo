import type { NexAppHookContext } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { disableMoonSleepCommerceRuntimeWork } from "./runtime-work.js";

export default async function onDeactivate(ctx: NexAppHookContext): Promise<void> {
  await disableMoonSleepCommerceRuntimeWork(ctx.nex);
}
