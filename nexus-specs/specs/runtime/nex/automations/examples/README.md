# Automation Examples

This folder contains example automations for the Nexus automation system. Automations work alongside the Access Control Layer (ACL) to determine WHAT content to react to and HOW to respond.

**See also:** 
- `../AUTOMATION_SYSTEM.md` for the full automation specification
- `../../../iam/` for the Access Control Layer that handles WHO has access

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EVENT FLOW                                         │
│                                                                              │
│  Event Sources (Adapters)                                                   │
│  ─────────────────────────                                                  │
│  iMessage, Gmail, Discord, Telegram, WhatsApp, Webhooks, Timers, etc.      │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    CORTEX (Event Layer)                            │   │
│  │                                                                      │   │
│  │  • Normalizes all events into unified schema                        │   │
│  │  • Stores in Events Ledger (permanent)                              │   │
│  │  • Runs background analysis (emotion, entities, topics)             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    ACCESS CONTROL LAYER (ACL)                        │   │
│  │                                                                      │   │
│  │  • Resolves WHO sent the event (identity resolution)                │   │
│  │  • Determines PERMISSIONS (what they can access)                    │   │
│  │  • Assigns SESSION (which persona, which thread)                    │   │
│  │  • Blocks unauthorized events (deny effect)                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                    Event + Principal + Permissions + Session                 │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    HOOK EVALUATION                                   │   │
│  │                                                                      │   │
│  │  • Checks each hook's TRIGGERS against resolved context             │   │
│  │  • Invokes matching hook handlers                                   │   │
│  │  • Handlers analyze CONTENT and decide whether to fire             │   │
│  │  • Returns { fire, agent, context }                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    AGENT BROKER                                      │   │
│  │                                                                      │   │
│  │  • Receives fired hooks with agent and context                      │   │
│  │  • Assembles full context (thread history, system prompt)           │   │
│  │  • Manages queues (steer, followup, collect, debounce)             │   │
│  │  • Executes agent and delivers response                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ACL vs Hooks: Division of Responsibility

| Concern | Handled By | How |
|---------|------------|-----|
| **WHO** is this? | ACL | Identity resolution via entities table |
| **Can they access?** | ACL | Policy evaluation → allow/deny |
| **What permissions?** | ACL | Policy → tools, credentials, data access |
| **Which session?** | ACL | Policy → persona + session key |
| **WHAT content?** | Hooks | Triggers + handler content analysis |
| **HOW to respond?** | Hooks | Handler returns agent + context |

**Key insight:** Hooks don't need to check WHO anymore. The ACL already resolved identity and attached it to the context. Hooks focus purely on WHAT content matches and HOW to respond.

---

## Hook Structure

Every hook has three parts:

```typescript
import { Hook, HookContext, HookResult } from './types';

export const hook: Hook = {
  name: 'example-hook',
  description: 'What this hook does',
  mode: 'persistent',  // or 'one-shot'
  
  // 1. TRIGGERS: When should this hook be invoked?
  //    Checked by hook system BEFORE calling handler.
  triggers: {
    principal: {
      name: 'Mom'  // Only invoke for messages from Mom
    },
    event: {
      channels: ['imessage', 'sms'],
      direction: 'received'
    }
  },
  
  // 2. CONFIG: Optional hook-specific settings
  config: {
    threshold: 100
  },
  
  // 3. HANDLER: Content analysis (only runs if triggers match)
  handler: async (ctx: HookContext): Promise<HookResult> => {
    // We already know WHO (ctx.principal) - just analyze WHAT
    const { event, llm, principal } = ctx;
    
    const result = await llm(`Is this a 2FA request? "${event.content}"`);
    
    if (result !== 'yes') {
      return { fire: false };
    }
    
    return {
      fire: true,
      agent: 'browser-agent',
      context: {
        prompt: `Help ${principal.name} with their 2FA code...`
      }
    };
  }
};
```

---

## Trigger Conditions

Triggers are **declarative** - the hook system evaluates them before invoking your handler.

### Principal Triggers (match ACL-resolved identity)

```typescript
triggers: {
  principal: {
    // Match by type
    type: 'owner',              // owner, known, unknown, system, webhook, agent
    type: ['owner', 'known'],   // Multiple types (OR)
    
    // Match by name
    name: 'Mom',                // Exact match on resolved name
    
    // Match by relationship
    relationship: 'family',     // family, partner, work, friend
    
    // Match specific entity
    entity_id: 'person_abc123',
    
    // Match webhook source
    source: 'stripe'            // For webhook principals
  }
}
```

### Event Triggers (match event properties)

```typescript
triggers: {
  event: {
    // Match channels
    channels: ['imessage', 'sms'],
    
    // Match event types
    types: ['timer_tick'],      // For scheduled hooks
    
    // Match direction
    direction: 'received',
    
    // Match metadata fields
    metadata: {
      event_type: 'payment_intent.succeeded',
      webhook_source: 'stripe'
    }
  }
}
```

### Combining Triggers

All specified conditions must match (AND):

```typescript
// Only fires for: Mom + iMessage/SMS + received
triggers: {
  principal: { name: 'Mom' },
  event: { channels: ['imessage', 'sms'], direction: 'received' }
}
```

---

## Hook Context

When triggers match, your handler receives a `HookContext`:

```typescript
interface HookContext {
  // The event being evaluated
  event: CortexEvent;
  
  // ACL-resolved identity and permissions (already validated)
  principal: Principal;       // { type, name, relationship, entity_id }
  permissions: Permissions;   // { tools, credentials, data_access, personas }
  session: Session;           // { session_key, persona, thread_id }
  
  // Database access
  dbPath: string;             // Path to Cortex SQLite database
  
  // Semantic search
  search(query, opts);        // Embeddings handled internally
  
  // LLM call
  llm(prompt, opts);          // Always gemini-3-flash-preview
  
  // Current time
  now: Date;
  
  // This hook's metadata
  hook: HookMetadata;         // { id, name, created_at, last_triggered, config }
}
```

### Using the Principal

The principal is already resolved - no database queries needed:

```typescript
handler: async (ctx: HookContext): Promise<HookResult> => {
  const { principal } = ctx;
  
  // Already know who this is
  console.log(principal.name);         // "Mom"
  console.log(principal.relationship); // "family"
  console.log(principal.type);         // "known"
  
  // Use in prompts
  return {
    fire: true,
    agent: 'helper',
    context: {
      prompt: `Help ${principal.name} with their request...`
    }
  };
}
```

---

## Hook Result

```typescript
interface HookResult {
  fire: boolean;           // Required: should this trigger an agent?
  
  agent?: string;          // Which agent (defaults to session's persona)
  
  context?: {
    prompt?: string;       // Custom instruction for the agent
    extracted?: any;       // Data to pass to agent
    include_thread?: boolean;
  };
  
  disable_hook?: boolean;  // Self-disable after this run (for one-shot)
}
```

**Note:** No more `routing` field. Session/persona are resolved by ACL. Hooks just specify which agent and what context.

---

## Hook Patterns

### Pattern 1: Content Classification (LLM)

Use LLM to understand intent. Most common pattern.

```typescript
handler: async (ctx: HookContext): Promise<HookResult> => {
  const { event, llm, principal } = ctx;
  
  const result = await llm(`Is this a 2FA request? Answer yes/no.
Message: "${event.content}"`);
  
  if (result.trim().toLowerCase() !== 'yes') {
    return { fire: false };
  }
  
  return {
    fire: true,
    agent: 'browser-agent',
    context: { prompt: `Help ${principal.name} with 2FA...` }
  };
}
```

### Pattern 2: Scheduled Check (Timer)

Fire based on time elapsed. Uses system timer events.

```typescript
triggers: {
  principal: { type: 'system' },
  event: { types: ['timer_tick'] }
},

handler: async (ctx: HookContext): Promise<HookResult> => {
  const { now, hook } = ctx;
  
  const interval = hook.config.interval_ms;
  const lastFired = hook.last_triggered || hook.created_at;
  
  if (now.getTime() - lastFired < interval) {
    return { fire: false };
  }
  
  return { fire: true, context: { prompt: 'HEARTBEAT' } };
}
```

### Pattern 3: Database Query

Query Cortex for additional context.

```typescript
handler: async (ctx: HookContext): Promise<HookResult> => {
  const { dbPath, hook } = ctx;
  
  const db = new Database(dbPath, { readonly: true });
  
  const messages = db.prepare(`
    SELECT content FROM events
    WHERE timestamp > ?
  `).all(hook.created_at);
  
  db.close();
  
  // Use messages for decision...
}
```

### Pattern 4: Webhook Filtering

Filter webhook events by metadata.

```typescript
triggers: {
  principal: { type: 'webhook', source: 'stripe' },
  event: { metadata: { event_type: 'payment_intent.succeeded' } }
},

handler: async (ctx: HookContext): Promise<HookResult> => {
  const { event } = ctx;
  
  const amount = event.metadata?.amount || 0;
  
  if (amount < 10000) {
    return { fire: false };
  }
  
  return {
    fire: true,
    agent: 'email-agent',
    context: { prompt: 'Send thank-you email...' }
  };
}
```

---

## Examples

| File | Triggers | Pattern |
|------|----------|---------|
| `mom-2fa-helper.ts` | Mom + iMessage/SMS | LLM classification |
| `casey-safety-check.ts` | System timer | Timer + DB + LLM |
| `heartbeat.ts` | System timer | Timer-based |
| `stripe-high-value.ts` | Stripe webhook | Webhook filtering |
| `flight-checkin.ts` | Owner + email | LLM + DB dedup |

---

## What Moved to ACL

These patterns are now handled by ACL policies, not hooks:

| Old Hook Pattern | Now ACL Policy |
|-----------------|----------------|
| Check if sender is owner | `principal.type === 'owner'` policy |
| Check if sender is family | `principal.relationship === 'family'` policy |
| Route work messages to work persona | Work channel policy |
| Block unknown senders | Unknown principal deny policy |
| Rate limiting | Policy `rate_limit` field |

**Example ACL policy (replaces routing hooks):**

```yaml
# This replaces default-dm-routing.ts and work-whatsapp-routing.ts
policies:
  - name: owner-full-access
    principals: [owner]
    effect: allow
    permissions:
      tools: ["*"]
      data_access: full
    session:
      persona: atlas
      pattern: "${persona}:dm:owner"
```

---

## Tips

1. **Trust the ACL** - Principal is already resolved, don't re-query
2. **Use triggers** - Let the hook system filter for you
3. **Focus on content** - Hooks analyze WHAT, not WHO
4. **Keep handlers simple** - Complex routing is ACL's job
5. **One hook, one job** - Multiple hooks can fire; keep them focused

---

## Type Definitions

See `types.ts` for full interface definitions:
- `Hook` - Complete hook structure
- `TriggerConditions` - Trigger specification
- `HookContext` - What handlers receive
- `HookResult` - What handlers return
- `Principal`, `Permissions`, `Session` - ACL-resolved values
