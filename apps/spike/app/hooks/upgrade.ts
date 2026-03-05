import type { NexAppHookContext } from "../../../nex/src/apps/context.js";

export default async function onUpgrade(ctx: NexAppHookContext): Promise<void> {
  console.log(`[spike] Upgrading app to version ${ctx.app.version}`);
  console.log(`[spike] Account: ${ctx.account.accountId}`);
  console.log(`[spike] Data directory: ${ctx.app.dataDir}`);

  // The Go engine handles its own schema migrations internally
  // This hook is primarily for logging and future extensibility

  console.log("[spike] Upgrade complete");
}
