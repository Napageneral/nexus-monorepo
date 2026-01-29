/**
 * @name Mom 2FA Helper
 * @description Automatically helps family members with 2FA codes
 * @mode persistent
 * 
 * When mom or dad texts asking for help with a login code, this hook
 * fires an agent to check email and text them back the code.
 */

import Database from 'better-sqlite3';

export default async function(ctx: HookContext): Promise<HookResult> {
  const { event, dbPath, llm } = ctx;
  
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
  
  // Skip if message is too short (unlikely to be a 2FA request)
  if (event.content.length < 10) {
    return { fire: false };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 2: Check if sender is family
  // ─────────────────────────────────────────────────────────────────────────
  
  const db = new Database(dbPath, { readonly: true });
  
  const sender = db.prepare(`
    SELECT p.canonical_name
    FROM event_participants ep
    JOIN person_contact_links pcl ON pcl.contact_id = ep.contact_id
    JOIN persons p ON p.id = pcl.person_id
    WHERE ep.event_id = ? AND ep.role = 'sender'
  `).get(event.id);
  
  db.close();
  
  const FAMILY = ['Mom', 'Dad'];
  if (!sender || !FAMILY.some(f => sender.canonical_name.includes(f))) {
    return { fire: false };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 3: LLM classification
  // ─────────────────────────────────────────────────────────────────────────
  
  const response = await llm(`Is this message asking for help with a verification code, login code, 2FA code, or authentication code?

Examples of YES:
- "Can you check your email for a code?"
- "I need the 6 digit code they sent"  
- "What's the Amazon verification code?"
- "Help me log in to Netflix"

Examples of NO:
- "How are you?"
- "Did you see that code in the movie?"
- "The dress code is casual"

Message: "${event.content}"

Return JSON: {"is_2fa": true/false, "service": "service name or null", "confidence": "high/medium/low"}`, { json: true });
  
  const result = JSON.parse(response);
  
  if (!result.is_2fa) {
    return { fire: false };
  }
  
  // Low confidence? Skip to avoid false positives
  if (result.confidence === 'low') {
    return { fire: false };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 4: Fire the helper agent
  // ─────────────────────────────────────────────────────────────────────────
  
  return {
    fire: true,
    routing: { 
      mode: 'persona', 
      agent_id: 'browser-agent'
    },
    context: {
      prompt: `${sender.canonical_name} needs help with a 2FA code for ${result.service || 'unknown service'}.

1. Check Tyler's email for recent verification codes from ${result.service || 'the service'}
2. Find the most recent code (usually 6 digits)
3. Text it back to ${sender.canonical_name}

Original message: "${event.content}"

Be helpful and friendly. If you can't find the code, text them back and let them know.`
    }
  };
}
