import type { NexAppHookContext } from "../../../../nex/src/apps/context.js";

export default async function onActivate(ctx: NexAppHookContext): Promise<void> {
  console.log(`[GlowBot Admin] Activating app version ${ctx.app.version}...`);
  console.log("[GlowBot Admin] Activation complete");
}
