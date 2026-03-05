import type { NexAppHookContext } from "../../../nex/src/apps/context.js";

export default async function onDeactivate(ctx: NexAppHookContext): Promise<void> {
  console.log(`[spike] Deactivating app for account ${ctx.account.accountId}`);
  console.log("[spike] Data preserved in:", ctx.app.dataDir);
  console.log("[spike] Deactivation complete");
}
