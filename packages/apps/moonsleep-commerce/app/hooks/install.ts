import type { NexAppHookContext } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { ensureMoonSleepCommerceRuntimeWork } from "./runtime-work.js";

export default async function onInstall(ctx: NexAppHookContext): Promise<void> {
  await ensureMoonSleepCommerceRuntimeWork({ runtime: ctx.nex, appId: ctx.app.id });
}
