/**
 * @name Default Heartbeat
 * @description System heartbeat that fires on interval
 * @mode persistent
 * 
 * This hook fires based on time elapsed since last firing.
 * Timer tick events (1/minute) ensure it evaluates even in quiet periods.
 */

import { Hook, HookContext, HookResult } from '../types';

export const hook: Hook = {
  name: 'default-heartbeat',
  description: 'Periodic check-in with the system',
  mode: 'persistent',
  
  // ─────────────────────────────────────────────────────────────────────────
  // TRIGGERS: System timer events
  // ─────────────────────────────────────────────────────────────────────────
  triggers: {
    principal: {
      type: 'system'
    },
    event: {
      types: ['timer_tick']
    }
  },
  
  // Configuration
  config: {
    interval_ms: 30 * 60 * 1000,  // 30 minutes
    quiet_start: 23,  // 11 PM
    quiet_end: 8      // 8 AM
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // HANDLER: Time-based evaluation
  // ─────────────────────────────────────────────────────────────────────────
  handler: async (ctx: HookContext): Promise<HookResult> => {
    const { now, hook } = ctx;
    const { interval_ms, quiet_start, quiet_end } = hook.config;
    
    // Check quiet hours
    const hour = now.getHours();
    if (hour >= quiet_start || hour < quiet_end) {
      return { fire: false };
    }
    
    // Check interval
    const lastFired = hook.last_triggered || hook.created_at;
    const elapsed = now.getTime() - lastFired;
    
    if (elapsed < interval_ms) {
      return { fire: false };
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // FIRE: Heartbeat to default persona
    // Note: No agent specified - uses session's default persona from ACL
    // ─────────────────────────────────────────────────────────────────────────
    
    return {
      fire: true,
      context: {
        prompt: 'HEARTBEAT'
      }
    };
  }
};
