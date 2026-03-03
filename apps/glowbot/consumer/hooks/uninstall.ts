import fs from "node:fs";
import path from "node:path";
import type { NexAppHookContext } from "../../../../nex/src/apps/context.js";

/**
 * GlowBot Uninstall Hook
 *
 * Called when the app is uninstalled.
 * Archives data and cleans up resources.
 */
export default async function onUninstall(ctx: NexAppHookContext): Promise<void> {
  console.log(`[GlowBot] Uninstalling app version ${ctx.app.version}...`);

  const dbPath = path.join(ctx.app.dataDir, "glowbot.db");
  const archivedDbPath = path.join(ctx.app.dataDir, `glowbot.db.archived.${Date.now()}`);

  try {
    // Archive database file if it exists
    if (fs.existsSync(dbPath)) {
      fs.renameSync(dbPath, archivedDbPath);
      console.log(`[GlowBot] Database archived to: ${archivedDbPath}`);
    } else {
      console.log("[GlowBot] No database file found to archive");
    }

    // TODO: Stop all adapter processes
    // When adapters are wired, we'll:
    // - Disconnect all active adapter connections
    // - Cancel any in-flight backfill operations
    // - Clean up adapter-specific resources
    console.log("[GlowBot] TODO: Stop all adapter processes (pending adapter integration)");

    // Log uninstall via audit
    try {
      ctx.nex.audit.log("glowbot.uninstall", {
        version: ctx.app.version,
        appId: ctx.app.id,
        dataArchived: fs.existsSync(archivedDbPath),
        archivedPath: archivedDbPath,
      });
    } catch (err) {
      // Expected to fail in Phase 1 stub
      console.log("[GlowBot] Audit log not available (Phase 1 stub)");
    }

    console.log("[GlowBot] Uninstall complete");
    console.log("[GlowBot] Note: Archived data can be found at:", archivedDbPath);
  } catch (error) {
    console.error("[GlowBot] Uninstall failed:", error);
    throw error;
  }
}
