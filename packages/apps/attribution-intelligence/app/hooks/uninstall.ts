import type { NexAppHookContext } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { removeAttributionRuntimeWork } from "./runtime-work.js";

export default async function onUninstall(ctx: NexAppHookContext): Promise<void> {
  await removeAttributionRuntimeWork({
    runtime: ctx.nex,
  });
  console.log("[attribution] runtime work removed");
}
