/**
 * @name Mom 2FA Helper
 * @description Automatically helps mom with 2FA codes
 * @mode persistent
 * 
 * When mom texts asking for help with a login code, this hook
 * fires an agent to check email and text her back the code.
 */

import { Hook, HookContext, HookResult } from '../types';

export const hook: Hook = {
  name: 'mom-2fa-helper',
  description: 'Automatically helps mom with 2FA codes',
  mode: 'persistent',
  
  // ─────────────────────────────────────────────────────────────────────────
  // TRIGGERS: When should this hook be invoked?
  // The hook system checks these BEFORE calling the handler.
  // ─────────────────────────────────────────────────────────────────────────
  triggers: {
    // Match against ACL-resolved principal
    principal: {
      name: 'Mom'  // Matches ctx.principal.name from ACL resolution
      // Could also use: relationship: 'family', entity_id: 'abc123'
    },
    // Match against event properties
    event: {
      channels: ['imessage', 'sms'],
      direction: 'received'
    }
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // HANDLER: Content analysis (we already know WHO sent it)
  // Only runs if triggers matched.
  // ─────────────────────────────────────────────────────────────────────────
  handler: async (ctx: HookContext): Promise<HookResult> => {
    const { event, llm, principal } = ctx;
    
    // Principal is already resolved by ACL - we know it's mom
    // Just analyze the CONTENT to decide if this is a 2FA request
    
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
    
    if (!result.is_2fa || result.confidence === 'low') {
      return { fire: false };
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // FIRE: Dispatch agent with context
    // ─────────────────────────────────────────────────────────────────────────
    
    return {
      fire: true,
      agent: 'browser-agent',
      context: {
        prompt: `${principal.name} needs help with a 2FA code for ${result.service || 'unknown service'}.

1. Check Tyler's email for recent verification codes from ${result.service || 'the service'}
2. Find the most recent code (usually 6 digits)
3. Text it back to ${principal.name}

Original message: "${event.content}"

Be helpful and friendly. If you can't find the code, text them back and let them know.`
      }
    };
  }
};
