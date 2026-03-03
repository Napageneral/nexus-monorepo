import type { NexAppHookContext } from "../../../../nex/src/apps/context.js";

export default async function onInstall(ctx: NexAppHookContext): Promise<void> {
  console.log(`[GlowBot Admin] Installing app version ${ctx.app.version}...`);
  // TODO: Create admin SQLite schema for clinic tracking, credential vault
  console.log("[GlowBot Admin] Installation complete");
}
