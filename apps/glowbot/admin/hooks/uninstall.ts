import type { NexAppHookContext } from "../../../../nex/src/apps/context.js";

export default async function onUninstall(ctx: NexAppHookContext): Promise<void> {
  console.log(`[GlowBot Admin] Uninstalling app version ${ctx.app.version}...`);
  console.log("[GlowBot Admin] Uninstall complete");
}
