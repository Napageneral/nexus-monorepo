/**
 * @name Default Heartbeat
 * @description System heartbeat that fires on interval (replaces upstream heartbeat)
 * @mode persistent
 * 
 * This hook fires based on time elapsed since last firing.
 * Timer tick events (1/minute) ensure it evaluates even in quiet periods.
 */

export default async function(ctx: HookContext): Promise<HookResult> {
  const { now, hook } = ctx;
  
  // ─────────────────────────────────────────────────────────────────────────
  // Configuration
  // ─────────────────────────────────────────────────────────────────────────
  
  const INTERVAL_MS = 30 * 60 * 1000;  // 30 minutes
  
  // Quiet hours (don't fire heartbeats late at night)
  const QUIET_START = 23;  // 11 PM
  const QUIET_END = 8;     // 8 AM
  
  // ─────────────────────────────────────────────────────────────────────────
  // Time-based evaluation
  // ─────────────────────────────────────────────────────────────────────────
  
  // Check quiet hours
  const hour = now.getHours();
  if (hour >= QUIET_START || hour < QUIET_END) {
    return { fire: false };
  }
  
  // Check interval
  const lastFired = hook.last_triggered || hook.created_at;
  const elapsed = now.getTime() - lastFired;
  
  if (elapsed < INTERVAL_MS) {
    return { fire: false };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Fire heartbeat
  // ─────────────────────────────────────────────────────────────────────────
  
  return {
    fire: true,
    routing: { 
      mode: 'persona'
    },
    context: {
      prompt: 'HEARTBEAT'
    }
  };
}
