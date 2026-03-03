import type { NexAppHookContext } from "../../../../nex/src/apps/context.js";

/**
 * GlowBot Deactivation Hook
 *
 * Called when the app is disabled/paused.
 * Stops background processes and flushes state.
 */
export default async function onDeactivate(ctx: NexAppHookContext): Promise<void> {
  console.log(`[GlowBot] Deactivating app version ${ctx.app.version}...`);

  try {
    // Log deactivation via audit
    try {
      ctx.nex.audit.log("glowbot.deactivate", {
        version: ctx.app.version,
        appId: ctx.app.id,
      });
    } catch (err) {
      // Expected to fail in Phase 1 stub
      console.log("[GlowBot] Audit log not available (Phase 1 stub)");
    }

    // TODO: Stop pipeline scheduler
    // When the pipeline engine is wired, we'll:
    // - Cancel any running pipeline jobs
    // - Unregister scheduled tasks
    // - Wait for in-flight operations to complete
    console.log("[GlowBot] TODO: Stop pipeline scheduler (pending pipeline engine integration)");

    // TODO: Flush pending state
    // When adapters are wired, we'll:
    // - Unsubscribe from adapter events
    // - Flush any buffered metrics to database
    // - Close adapter connections gracefully
    console.log("[GlowBot] TODO: Flush pending state (pending adapter integration)");

    console.log("[GlowBot] Deactivation complete");
  } catch (error) {
    console.error("[GlowBot] Deactivation failed:", error);
    throw error;
  }
}
