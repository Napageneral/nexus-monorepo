/**
 * @name Casey Safety Check
 * @description One-shot hook that fires if Casey hasn't confirmed she's home safe
 * @mode one-shot
 * 
 * Created when Tyler says "remind me to check on Casey" - the agent sets a
 * future time and this hook monitors for her messages until then.
 */

export default async function(ctx: HookContext): Promise<HookResult> {
  const { event, cortex, llm, now, hook } = ctx;
  
  // Configuration (set when hook was created)
  const TRIGGER_TIME = new Date("2026-01-28T03:00:00-06:00");
  const CASEY_CONTACT = "casey-adams";
  
  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 1: Time check
  // ─────────────────────────────────────────────────────────────────────────
  
  // Not yet time to check
  if (now < TRIGGER_TIME) {
    return { fire: false };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 2: Query cortex for Casey's messages since hook creation
  // ─────────────────────────────────────────────────────────────────────────
  
  const caseyMessages = await cortex.query({
    channel: ['imessage', 'sms'],
    participant: CASEY_CONTACT,
    since: hook.created_at,
    direction: 'received'
  });
  
  // No messages at all from Casey
  if (caseyMessages.length === 0) {
    return {
      fire: true,
      routing: { 
        mode: 'persona', 
        agent_id: 'phone-caller' 
      },
      context: {
        prompt: `Casey hasn't texted at all since the safety check was set at ${new Date(hook.created_at).toLocaleString()}. It's now ${now.toLocaleString()}. Call Tyler to wake him up and check on her.`,
        extracted: {
          messages_found: 0,
          hours_since_check_set: (now.getTime() - hook.created_at) / (1000 * 60 * 60)
        }
      },
      disable_hook: true  // One-shot: disable after firing
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 3: LLM check - did she confirm she's home safe?
  // ─────────────────────────────────────────────────────────────────────────
  
  const safetyCheck = await llm.classify({
    prompt: `Review these messages from Casey. Did she explicitly or implicitly indicate that she arrived home safely, got home, is back, or similar?
    
    Look for phrases like:
    - "home" / "back" / "here" / "made it"
    - "going to bed" / "gonna sleep" (implies home)
    - Casual late-night texts from her phone (implies she's home and fine)
    
    Be generous - if she seems fine and texted late at night, she's probably home.`,
    messages: caseyMessages.map(m => ({
      content: m.content,
      timestamp: m.timestamp
    })),
    schema: {
      is_home_safe: 'boolean',
      confidence: 'high | medium | low',
      evidence: 'string'  // Quote or reasoning
    }
  });
  
  if (safetyCheck.is_home_safe) {
    // She's safe! Silently disable the hook
    return { 
      fire: false, 
      disable_hook: true 
    };
  }
  
  // Messages exist but no confirmation she's home
  return {
    fire: true,
    routing: { 
      mode: 'persona', 
      agent_id: 'phone-caller' 
    },
    context: {
      prompt: `Casey texted ${caseyMessages.length} times since the safety check was set, but hasn't confirmed she's home safe. Last message was: "${caseyMessages[caseyMessages.length - 1].content}". Call Tyler to wake him up.`,
      extracted: {
        messages_found: caseyMessages.length,
        last_message: caseyMessages[caseyMessages.length - 1].content,
        llm_analysis: safetyCheck
      }
    },
    disable_hook: true
  };
}
