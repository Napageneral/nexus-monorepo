/**
 * @name Flight Check-in Automation
 * @description Detects airline check-in emails and auto-checks in
 * @mode persistent
 * 
 * Hybrid pattern: deterministic pre-filter + LLM extraction.
 * Demonstrates scheduled+conditional combination.
 */

export default async function(ctx: HookContext): Promise<HookResult> {
  const { event, llm, cortex } = ctx;
  
  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 1: Deterministic pre-filter (fast, no LLM cost)
  // ─────────────────────────────────────────────────────────────────────────
  
  // Only email events
  if (event.channel !== 'email') {
    return { fire: false };
  }
  
  // Only incoming
  if (event.direction !== 'received') {
    return { fire: false };
  }
  
  // Quick keyword check before LLM (avoid LLM calls for unrelated emails)
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
  // PHASE 2: LLM extraction
  // ─────────────────────────────────────────────────────────────────────────
  
  const analysis = await llm.extract({
    prompt: `Analyze this email. Is it a flight check-in notification (telling the user they can now check in for their flight)?

If yes, extract:
- Airline name
- Flight number
- Departure date/time
- Check-in deadline (if mentioned)
- Check-in URL (if present)

Important: This is about CHECK-IN notifications, not booking confirmations or other flight emails.`,
    content: event.content,
    metadata: {
      subject: event.metadata?.subject,
      from: event.sender_id
    },
    schema: {
      is_checkin_notification: 'boolean',
      airline: 'string | null',
      flight_number: 'string | null',
      departure_time: 'string | null',  // ISO 8601
      checkin_deadline: 'string | null',
      checkin_url: 'string | null',
      confidence: 'high | medium | low'
    }
  });
  
  if (!analysis.is_checkin_notification) {
    return { fire: false };
  }
  
  if (analysis.confidence === 'low') {
    return { fire: false };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 3: Check if already handled (avoid duplicate check-ins)
  // ─────────────────────────────────────────────────────────────────────────
  
  // Look for recent agent responses about this flight
  if (analysis.flight_number) {
    const recentResponses = await cortex.query({
      channel: 'agent',
      content_contains: analysis.flight_number,
      since: Date.now() - (24 * 60 * 60 * 1000),  // Last 24 hours
      direction: 'sent'
    });
    
    if (recentResponses.length > 0) {
      // Already handled this flight
      return { fire: false };
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 4: Fire browser agent to check in
  // ─────────────────────────────────────────────────────────────────────────
  
  return {
    fire: true,
    routing: { 
      mode: 'persona',
      agent_id: 'browser-agent'
    },
    context: {
      prompt: `Flight check-in detected! Please check in for this flight:

Airline: ${analysis.airline}
Flight: ${analysis.flight_number}
Departure: ${analysis.departure_time}
${analysis.checkin_url ? `Check-in URL: ${analysis.checkin_url}` : ''}

Steps:
1. Go to the check-in URL (or airline website if no URL)
2. Complete the check-in process
3. Get the boarding pass
4. Text Tyler the confirmation and any seat assignment

If there are seat selection options, choose window seat if available.`,
      extracted: analysis
    }
  };
}
