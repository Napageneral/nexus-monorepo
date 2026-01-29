/**
 * @name Default DM Routing
 * @description Routes all direct messages to default persona (catch-all)
 * @mode persistent
 * 
 * This is the simplest possible hook - pure passthrough.
 * Ensures every DM gets handled. No LLM, no database.
 */

export default async function(ctx: HookContext): Promise<HookResult> {
  const { event } = ctx;
  
  // Only handle direct messages (not group chats)
  if (event.metadata?.is_group) {
    return { fire: false };
  }
  
  // Only incoming messages
  if (event.direction !== 'received') {
    return { fire: false };
  }
  
  // Only messaging channels
  const MESSAGING_CHANNELS = ['discord', 'telegram', 'whatsapp', 'imessage', 'sms'];
  if (!MESSAGING_CHANNELS.includes(event.channel)) {
    return { fire: false };
  }
  
  // Fire default persona with thread context
  return {
    fire: true,
    routing: { 
      mode: 'session'
      // No agent_id = use default persona
    },
    context: {
      include_thread: true
    }
  };
}
