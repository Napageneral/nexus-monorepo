import type { NexAppHookContext } from "../../../nex/src/apps/context.js";

export default async function onActivate(ctx: NexAppHookContext): Promise<void> {
  console.log(`[spike] Activating app "${ctx.app.id}" v${ctx.app.version}`);
  console.log(`[spike] Data directory: ${ctx.app.dataDir}`);
  console.log("[spike] Activation complete");
}
