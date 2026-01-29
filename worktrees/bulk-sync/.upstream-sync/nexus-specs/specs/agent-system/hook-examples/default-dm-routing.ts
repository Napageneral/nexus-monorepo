/**
 * @name Default DM Routing
 * @description Routes all direct messages to default persona (catch-all)
 * @mode persistent
 * 
 * This is the simplest possible hook - pure passthrough.
 * It ensures every DM gets handled by the default agent.
 * 
 * More specific hooks (like work-whatsapp-routing) fire in parallel.
 * The broker handles deduplication if the same event triggers multiple agents.
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
  
  // Only messaging channels (not webhooks, timers, etc.)
  const MESSAGING_CHANNELS = ['discord', 'telegram', 'whatsapp', 'imessage', 'sms'];
  if (!MESSAGING_CHANNELS.includes(event.channel)) {
    return { fire: false };
  }
  
  // Fire default persona with thread context
  return {
    fire: true,
    routing: { 
      mode: 'session',  // Use session for conversation continuity
      // No agent_id specified = use default persona
    },
    context: {
      include_thread: true
    }
  };
}
