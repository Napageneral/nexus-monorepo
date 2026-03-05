import type { NexAppHookContext } from "../../../nex/src/apps/context.js";
import { join } from "node:path";
import { rename } from "node:fs/promises";

export default async function onUninstall(ctx: NexAppHookContext): Promise<void> {
  console.log(`[spike] Uninstalling app for account ${ctx.account.accountId}`);

  // Archive data directory instead of deleting
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const archivePath = `${ctx.app.dataDir}.archive-${timestamp}`;

  try {
    await rename(ctx.app.dataDir, archivePath);
    console.log(`[spike] Data archived to: ${archivePath}`);
  } catch (error) {
    console.error("[spike] Failed to archive data:", error);
    console.log("[spike] Data remains at:", ctx.app.dataDir);
  }

  console.log("[spike] Uninstall complete");
}
