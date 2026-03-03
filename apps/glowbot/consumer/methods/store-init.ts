import path from "node:path";
import type { NexAppMethodContext } from "../../../../nex/src/apps/context.js";

/**
 * Ensures the pipeline store points to the correct database for this app instance.
 * Must be called before any pipeline store function.
 *
 * Sets process.env.GLOWBOT_LEDGER_PATH so the store module picks up the right DB.
 */
export function initStoreForContext(ctx: NexAppMethodContext): void {
  const dbPath = path.join(ctx.app.dataDir, "glowbot.db");
  process.env.GLOWBOT_LEDGER_PATH = dbPath;
}
