import type { NexAppHookContext } from "../../../../nex/src/apps/context.js";

/**
 * GlowBot Activation Hook
 *
 * Called when the app becomes active after install or re-enable.
 * Starts background processes and reconnects to adapters.
 */
export default async function onActivate(ctx: NexAppHookContext): Promise<void> {
  console.log(`[GlowBot] Activating app version ${ctx.app.version}...`);

  try {
    // Log activation via audit
    try {
      ctx.nex.audit.log("glowbot.activate", {
        version: ctx.app.version,
        appId: ctx.app.id,
      });
    } catch (err) {
      // Expected to fail in Phase 1 stub
      console.log("[GlowBot] Audit log not available (Phase 1 stub)");
    }

    // TODO: Start pipeline scheduler
    // When the pipeline engine is wired, we'll:
    // - Initialize the scheduler from ctx.app.config.pipelineSchedule
    // - Start background job for periodic metric computation
    // - Register pipeline event handlers
    console.log("[GlowBot] TODO: Start pipeline scheduler (pending pipeline engine integration)");

    // TODO: Reconnect adapter monitors
    // When adapters are wired, we'll:
    // - Query active adapter connections via ctx.nex.adapters.list()
    // - Subscribe to adapter events via ctx.nex.adapters.onEvent()
    // - Initialize metric collectors for each adapter
    console.log("[GlowBot] TODO: Reconnect adapter monitors (pending adapter integration)");

    console.log("[GlowBot] Activation complete");
  } catch (error) {
    console.error("[GlowBot] Activation failed:", error);
    throw error;
  }
}
