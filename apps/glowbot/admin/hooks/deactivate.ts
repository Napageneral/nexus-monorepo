import type { NexAppHookContext } from "../../../../nex/src/apps/context.js";

export default async function onDeactivate(ctx: NexAppHookContext): Promise<void> {
  console.log(`[GlowBot Admin] Deactivating app version ${ctx.app.version}...`);
  console.log("[GlowBot Admin] Deactivation complete");
}
