/**
 * @name Flight Check-in Automation
 * @description Detects airline check-in emails and auto-checks in
 * @mode persistent
 * 
 * Hybrid pattern: deterministic trigger + LLM extraction + database dedup.
 * Only fires for owner's emails (ACL enforced).
 */

import Database from 'better-sqlite3';
import { Hook, HookContext, HookResult } from '../types';

export const hook: Hook = {
  name: 'flight-checkin',
  description: 'Auto check-in for flights',
  mode: 'persistent',
  
  // ─────────────────────────────────────────────────────────────────────────
  // TRIGGERS: Owner's email only
  // ACL already verified this is the owner - we filter to email channel
  // ─────────────────────────────────────────────────────────────────────────
  triggers: {
    principal: {
      type: 'owner'
    },
    event: {
      channels: ['email'],
      direction: 'received'
    }
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // HANDLER: Content analysis and dedup
  // ─────────────────────────────────────────────────────────────────────────
  handler: async (ctx: HookContext): Promise<HookResult> => {
    const { event, dbPath, llm } = ctx;
    
    // Quick keyword check before LLM
    const content = event.content.toLowerCase();
    const subject = (event.metadata?.subject || '').toLowerCase();
    
    const AIRLINE_KEYWORDS = ['check-in', 'checkin', 'check in', 'flight', 'boarding'];
    const AIRLINE_DOMAINS = ['@united.com', '@delta.com', '@aa.com', '@southwest.com', '@jetblue.com'];
    
    const hasKeyword = AIRLINE_KEYWORDS.some(kw => 
      content.includes(kw) || subject.includes(kw)
    );
    
    const fromAirline = AIRLINE_DOMAINS.some(domain => 
      (event.sender_id || '').includes(domain)
    );
    
    if (!hasKeyword && !fromAirline) {
      return { fire: false };
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // LLM extraction
    // ─────────────────────────────────────────────────────────────────────────
    
    const response = await llm(`Analyze this email. Is it a flight check-in notification (telling the user they can now check in for their flight)?

If yes, extract:
- Airline name
- Flight number
- Departure date/time
- Check-in URL (if present)

Important: This is about CHECK-IN notifications, not booking confirmations.

Email subject: ${event.metadata?.subject}
Email from: ${event.sender_id}
Email content: ${event.content.substring(0, 2000)}

Return JSON: {
  "is_checkin": true/false,
  "airline": "name or null",
  "flight_number": "number or null",
  "departure": "ISO datetime or null",
  "checkin_url": "URL or null",
  "confidence": "high/medium/low"
}`, { json: true });
    
    const analysis = JSON.parse(response);
    
    if (!analysis.is_checkin || analysis.confidence === 'low') {
      return { fire: false };
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // Dedup check (avoid duplicate check-ins)
    // ─────────────────────────────────────────────────────────────────────────
    
    if (analysis.flight_number) {
      const db = new Database(dbPath, { readonly: true });
      
      const recentHandled = db.prepare(`
        SELECT COUNT(*) as count
        FROM events e
        WHERE e.channel = 'agent'
          AND e.content LIKE ?
          AND e.timestamp > ?
      `).get(`%${analysis.flight_number}%`, Date.now() - 24 * 60 * 60 * 1000);
      
      db.close();
      
      if (recentHandled.count > 0) {
        return { fire: false };
      }
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // FIRE: Browser agent to check in
    // ─────────────────────────────────────────────────────────────────────────
    
    return {
      fire: true,
      agent: 'browser-agent',
      context: {
        prompt: `Flight check-in detected! Please check in for this flight:

Airline: ${analysis.airline}
Flight: ${analysis.flight_number}
Departure: ${analysis.departure}
${analysis.checkin_url ? `Check-in URL: ${analysis.checkin_url}` : ''}

Steps:
1. Go to the check-in URL (or airline website if no URL)
2. Complete the check-in process
3. Get the boarding pass
4. Text Tyler the confirmation and any seat assignment

If there are seat selection options, choose window seat if available.`
      }
    };
  }
};
