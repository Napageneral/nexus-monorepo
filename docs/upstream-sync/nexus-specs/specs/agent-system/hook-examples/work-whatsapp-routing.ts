/**
 * @name Work WhatsApp Routing
 * @description Routes messages from work contact to work persona
 * @mode persistent
 * 
 * Pure deterministic routing - no LLM calls, no database queries.
 * This is the fastest type of hook.
 */

export default async function(ctx: HookContext): Promise<HookResult> {
  const { event } = ctx;
  
  // ─────────────────────────────────────────────────────────────────────────
  // Pure deterministic matching - no external calls
  // ─────────────────────────────────────────────────────────────────────────
  
  // Channel check
  if (event.channel !== 'whatsapp') {
    return { fire: false };
  }
  
  // Direction check
  if (event.direction !== 'received') {
    return { fire: false };
  }
  
  // Sender check (work contact phone number)
  const WORK_CONTACT = '+15551234567';
  if (event.sender_id !== WORK_CONTACT) {
    return { fire: false };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Route to work agent with thread context
  // ─────────────────────────────────────────────────────────────────────────
  
  return {
    fire: true,
    routing: { 
      mode: 'session',
      target: `whatsapp:${WORK_CONTACT}`,
      agent_id: 'work'
    },
    context: {
      include_thread: true
    }
  };
}
