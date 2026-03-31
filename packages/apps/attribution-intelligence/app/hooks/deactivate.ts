import type { NexAppHookContext } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { disableAttributionRuntimeWork } from "./runtime-work.js";

export default async function onDeactivate(ctx: NexAppHookContext): Promise<void> {
  await disableAttributionRuntimeWork({
    runtime: ctx.nex,
  });
  console.log("[attribution] runtime work disabled");
}
