/**
 * @name Casey Safety Check
 * @description One-shot hook that fires if Casey hasn't confirmed she's home safe
 * @mode one-shot
 * 
 * Created when Tyler says "remind me to check on Casey" - the agent sets a
 * future time and this hook monitors for her messages until then.
 */

import Database from 'better-sqlite3';
import { Hook, HookContext, HookResult } from '../types';

export const hook: Hook = {
  name: 'casey-safety-check',
  description: 'Check if Casey made it home safe',
  mode: 'one-shot',
  
  // ─────────────────────────────────────────────────────────────────────────
  // TRIGGERS: System timer events only
  // This hook doesn't care about incoming messages - it fires on time.
  // ─────────────────────────────────────────────────────────────────────────
  triggers: {
    principal: {
      type: 'system'  // Only timer ticks, not user messages
    },
    event: {
      types: ['timer_tick']
    }
  },
  
  // Configuration (set when hook was created)
  config: {
    trigger_time: "2026-01-28T03:00:00-06:00",
    target_person: "Casey"
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // HANDLER: Time-based check with database query
  // ─────────────────────────────────────────────────────────────────────────
  handler: async (ctx: HookContext): Promise<HookResult> => {
    const { dbPath, llm, now, hook } = ctx;
    
    const TRIGGER_TIME = new Date(hook.config.trigger_time);
    const TARGET = hook.config.target_person;
    
    // Not time yet
    if (now < TRIGGER_TIME) {
      return { fire: false };
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // Query Mnemonic for Casey's messages since hook creation
    // ─────────────────────────────────────────────────────────────────────────
    
    const db = new Database(dbPath, { readonly: true });
    
    const messages = db.prepare(`
      SELECT e.content, e.timestamp, f.value as emotion
      FROM events e
      JOIN event_participants ep ON ep.event_id = e.id
      JOIN person_contact_links pcl ON pcl.contact_id = ep.contact_id
      JOIN persons p ON p.id = pcl.person_id
      LEFT JOIN episode_events ee ON ee.event_id = e.id
      LEFT JOIN facets f ON f.episode_id = ee.episode_id AND f.facet_type = 'emotion'
      WHERE p.canonical_name LIKE ?
        AND e.channel IN ('imessage', 'sms')
        AND e.direction = 'received'
        AND e.timestamp > ?
      ORDER BY e.timestamp DESC
    `).all(`%${TARGET}%`, hook.created_at);
    
    db.close();
    
    // No messages at all
    if (messages.length === 0) {
      return {
        fire: true,
        agent: 'phone-caller',
        context: {
          prompt: `${TARGET} hasn't texted at all since the safety check was set at ${new Date(hook.created_at).toLocaleString()}. It's now ${now.toLocaleString()}. Call Tyler to wake him up and check on her.`
        },
        disable_hook: true
      };
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // LLM check - did she confirm she's home safe?
    // ─────────────────────────────────────────────────────────────────────────
    
    const messageList = messages
      .map(m => `- "${m.content}" (emotion: ${m.emotion || 'unknown'})`)
      .join('\n');
    
    const check = await llm(`Review these messages from ${TARGET}. Did she explicitly or implicitly indicate that she arrived home safely?

Look for phrases like:
- "home" / "back" / "here" / "made it"
- "going to bed" / "gonna sleep" (implies home)
- Casual late-night texts from her phone (implies she's home and fine)

Be generous - if she seems fine and texted late at night, she's probably home.

Messages:
${messageList}

Answer only "yes" or "no".`);
    
    if (check.trim().toLowerCase() === 'yes') {
      // She's safe! Silently disable the hook
      return { fire: false, disable_hook: true };
    }
    
    // Messages exist but no confirmation she's home
    return {
      fire: true,
      agent: 'phone-caller',
      context: {
        prompt: `${TARGET} texted ${messages.length} times since the safety check was set, but hasn't confirmed she's home safe. Last message was: "${messages[0].content}". Call Tyler to wake him up.`
      },
      disable_hook: true
    };
  }
};
