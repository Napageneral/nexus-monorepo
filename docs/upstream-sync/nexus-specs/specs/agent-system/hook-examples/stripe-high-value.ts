/**
 * @name Stripe High-Value Payment
 * @description Send personalized thank-you for payments over $100
 * @mode persistent
 * 
 * Filters webhook events from Stripe and fires for high-value payments.
 * Pure deterministic - no LLM, no database queries.
 */

import { Hook, HookContext, HookResult } from '../types';

export const hook: Hook = {
  name: 'stripe-high-value',
  description: 'Thank high-value Stripe customers',
  mode: 'persistent',
  
  // ─────────────────────────────────────────────────────────────────────────
  // TRIGGERS: Stripe webhook events only
  // ACL already verified the webhook source - we just filter event type
  // ─────────────────────────────────────────────────────────────────────────
  triggers: {
    principal: {
      type: 'webhook',
      source: 'stripe'  // Matches ACL-verified webhook source
    },
    event: {
      metadata: {
        event_type: 'payment_intent.succeeded'
      }
    }
  },
  
  // Configuration
  config: {
    threshold_cents: 10000  // $100
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // HANDLER: Check amount and fire email agent
  // ─────────────────────────────────────────────────────────────────────────
  handler: async (ctx: HookContext): Promise<HookResult> => {
    const { event, hook } = ctx;
    const { threshold_cents } = hook.config;
    
    const amountCents = event.metadata?.amount || 0;
    
    if (amountCents <= threshold_cents) {
      return { fire: false };
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // FIRE: Email agent with context
    // ─────────────────────────────────────────────────────────────────────────
    
    const amountDollars = (amountCents / 100).toFixed(2);
    const customerEmail = event.metadata?.customer_email;
    const customerName = event.metadata?.customer_name || 'Valued Customer';
    const productName = event.metadata?.product_name || 'your purchase';
    
    return {
      fire: true,
      agent: 'email-agent',
      context: {
        prompt: `A high-value payment of $${amountDollars} was just received from ${customerName} (${customerEmail}) for ${productName}.

Send them a personalized thank-you email. Be warm and genuine, not corporate. Mention the specific product if known.`
      }
    };
  }
};
