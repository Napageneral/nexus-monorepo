/**
 * @name Mom 2FA Helper
 * @description Automatically helps family members with 2FA codes
 * @mode persistent
 * 
 * When mom or dad texts asking for help with a login code, this hook
 * fires an agent to check email and text them back the code.
 */

export default async function(ctx: HookContext): Promise<HookResult> {
  const { event, llm } = ctx;
  
  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 1: Fast exits (no LLM cost for non-matching events)
  // ─────────────────────────────────────────────────────────────────────────
  
  // Only iMessage/SMS
  if (!['imessage', 'sms'].includes(event.channel)) {
    return { fire: false };
  }
  
  // Only incoming messages
  if (event.direction !== 'received') {
    return { fire: false };
  }
  
  // Only from family
  const FAMILY_CONTACTS = ['mom', 'dad', 'sister'];
  if (!FAMILY_CONTACTS.includes(event.sender_id)) {
    return { fire: false };
  }
  
  // Skip if message is too short (unlikely to be a 2FA request)
  if (event.content.length < 10) {
    return { fire: false };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 2: LLM classification
  // ─────────────────────────────────────────────────────────────────────────
  
  const analysis = await llm.extract({
    prompt: `Is this message asking for help with a verification code, login code, 2FA code, or authentication code?
    
    Examples of YES:
    - "Can you check your email for a code?"
    - "I need the 6 digit code they sent"  
    - "What's the Amazon verification code?"
    - "Help me log in to Netflix"
    
    Examples of NO:
    - "How are you?"
    - "Did you see that code in the movie?"
    - "The dress code is casual"
    
    If yes, extract the service name if mentioned.`,
    content: event.content,
    schema: {
      is_2fa_request: 'boolean',
      confidence: 'high | medium | low',
      service_name: 'string | null',
      urgency: 'low | medium | high'
    }
  });
  
  if (!analysis.is_2fa_request) {
    return { fire: false };
  }
  
  // Low confidence? Skip to avoid false positives
  if (analysis.confidence === 'low') {
    return { fire: false };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 3: Fire the helper agent
  // ─────────────────────────────────────────────────────────────────────────
  
  const senderName = event.metadata?.sender_name || event.sender_id;
  const serviceName = analysis.service_name || 'the requested service';
  
  return {
    fire: true,
    routing: { 
      mode: 'persona', 
      agent_id: 'browser-agent'  // Agent with email + browser access
    },
    context: {
      prompt: `${senderName} needs help with a 2FA code for ${serviceName}.

1. Check Tyler's email for recent verification codes from ${serviceName}
2. Find the most recent code (usually 6 digits)
3. Text it back to ${senderName} at the number they texted from

Original message: "${event.content}"

Be helpful and friendly. If you can't find the code, text them back and let them know.`,
      extracted: {
        sender: senderName,
        sender_id: event.sender_id,
        service: analysis.service_name,
        original_message: event.content,
        urgency: analysis.urgency
      },
      include_thread: false  // No need for thread history
    }
  };
}
