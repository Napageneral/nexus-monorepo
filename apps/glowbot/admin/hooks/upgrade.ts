import type { NexAppHookContext } from "../../../../nex/src/apps/context.js";

export default async function onUpgrade(ctx: NexAppHookContext): Promise<void> {
  console.log(`[GlowBot Admin] Upgrading app to version ${ctx.app.version}...`);
  console.log("[GlowBot Admin] Upgrade complete");
}
