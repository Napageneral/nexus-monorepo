/**
 * @name Stripe High-Value Payment
 * @description Send personalized thank-you for payments over $100
 * @mode persistent
 * 
 * Filters webhook events from Stripe and fires for high-value payments.
 * Demonstrates webhook event handling pattern.
 */

export default async function(ctx: HookContext): Promise<HookResult> {
  const { event } = ctx;
  
  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 1: Filter to Stripe webhook events
  // ─────────────────────────────────────────────────────────────────────────
  
  // Only webhook adapter events
  if (event.source_adapter !== 'webhook') {
    return { fire: false };
  }
  
  // Only Stripe webhooks
  if (event.metadata?.webhook_source !== 'stripe') {
    return { fire: false };
  }
  
  // Only successful payments
  if (event.metadata?.event_type !== 'payment_intent.succeeded') {
    return { fire: false };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 2: Check payment amount
  // ─────────────────────────────────────────────────────────────────────────
  
  const amountCents = event.metadata?.amount || 0;
  const THRESHOLD_CENTS = 10000;  // $100
  
  if (amountCents <= THRESHOLD_CENTS) {
    return { fire: false };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 3: Fire email agent
  // ─────────────────────────────────────────────────────────────────────────
  
  const amountDollars = (amountCents / 100).toFixed(2);
  const customerEmail = event.metadata?.customer_email;
  const customerName = event.metadata?.customer_name || 'Valued Customer';
  const productName = event.metadata?.product_name || 'your purchase';
  
  return {
    fire: true,
    routing: { 
      mode: 'session',
      agent_id: 'email-agent'
    },
    context: {
      prompt: `A high-value payment of $${amountDollars} was just received from ${customerName} (${customerEmail}) for ${productName}.

Send them a personalized thank-you email. Be warm and genuine, not corporate. Mention the specific product if known.`,
      extracted: {
        amount_dollars: parseFloat(amountDollars),
        customer_name: customerName,
        customer_email: customerEmail,
        product_name: productName,
        stripe_payment_id: event.metadata?.payment_intent_id
      }
    }
  };
}
