# Automations: OpenClaw vs Nexus

**Status:** COMPLETE  
**Last Updated:** 2026-02-04

---

## Summary

Automations are how an AI system acts *proactively* (on schedules) and *reactively* (on events) without explicit user prompting. OpenClaw and Nexus take fundamentally different approaches:

| Aspect | OpenClaw | Nexus |
|--------|----------|-------|
| **Proactive behavior** | Heartbeat + agent discretion | Explicit timer/cron triggers |
| **Reactive behavior** | ❌ None (except specialized hooks) | ✅ Pattern-matching on events |
| **Trigger model** | Agent runs, decides what to do | Declarative: specific triggers invoke specific behaviors |
| **Configuration** | Cron schedule + heartbeat interval | YAML triggers + TypeScript handlers |
| **First-class concept?** | No — heartbeat is a hack | Yes — Automations are a core system |

**The key insight:** OpenClaw has *proactive* behavior via heartbeats, but no *reactive* event system. Nexus makes both first-class.

---

## OpenClaw: Heartbeats and Agent Discretion

### The Heartbeat Model

OpenClaw's proactive behavior works through a **heartbeat system**: a periodic tick that invokes the agent with a `HEARTBEAT` message.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OPENCLAW HEARTBEAT MODEL                             │
│                                                                              │
│   Cron Scheduler                                                             │
│        │                                                                     │
│        │  Every N seconds/minutes                                            │
│        ▼                                                                     │
│   Send HEARTBEAT message to main session                                     │
│        │                                                                     │
│        ▼                                                                     │
│   Agent runs                                                                 │
│        │                                                                     │
│        ├── Agent decides: check email?                                       │
│        ├── Agent decides: check calendar?                                    │
│        ├── Agent decides: check mentions?                                    │
│        ├── Agent decides: reach out to user?                                 │
│        │                                                                     │
│        ▼                                                                     │
│   Agent outputs HEARTBEAT_OK (silent) or takes action                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### How It Works

1. **Cron schedules heartbeats** — Configurable interval (e.g., every 60 seconds)
2. **Agent receives `HEARTBEAT`** — A synthetic message injected into the main session
3. **Agent decides what to do** — Based on instructions in system prompt (SOUL.md, etc.)
4. **Agent can respond or stay silent** — `HEARTBEAT_OK` is stripped from output

### Configuration

```json
{
  "heartbeat": {
    "enabled": true,
    "intervalSeconds": 60,
    "sessionKey": "agent:atlas:main"
  }
}
```

### The Problem: Agent Discretion is Unreliable

The heartbeat model puts all decision-making on the agent:

```markdown
## Heartbeats (from SOUL.md)

When you receive a `HEARTBEAT` message, use it productively:

**Check (rotate through):**
- Emails, calendar, mentions, weather

**Reach out when:**
- Important email arrived
- Calendar event coming up (<2h)
- Something interesting found
```

**Problems:**
- Agent may forget to check things
- Agent may over-check (expensive)
- No guarantee of behavior — it's just suggestions
- Hard to audit what the agent actually did
- Can't express "when X happens, do Y" — only "periodically, consider doing things"

### No Reactive Events

OpenClaw has no general-purpose event system. When a new email arrives, the agent doesn't know until the next heartbeat when it happens to check.

**Specialized exceptions exist:**
- Gmail hooks can trigger on new mail (but this is a one-off implementation)
- Webhooks can invoke agents (but require custom code)

These are point solutions, not a unified reactive system.

---

## Nexus: First-Class Automations

### The Two Types

Nexus formalizes automations into two categories:

| Type | Trigger | Example |
|------|---------|---------|
| **Proactive** | Timer/cron | "Every morning at 8am, summarize today's calendar" |
| **Reactive** | Event pattern | "When Mom asks for a 2FA code, fetch it from email" |

Both use the same automation infrastructure — declarative triggers with TypeScript handlers.

### Automation Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        NEXUS AUTOMATION SYSTEM                               │
│                                                                              │
│   Events (messages, timers, webhooks, etc.)                                  │
│        │                                                                     │
│        │  All events flow through NEX pipeline                               │
│        ▼                                                                     │
│   IAM resolves identity/permissions                                          │
│        │                                                                     │
│        ▼                                                                     │
│   For each automation:                                                       │
│        │                                                                     │
│        ├─ Check trigger conditions (fast filter)                             │
│        │     └─ If triggers don't match → skip                               │
│        │                                                                     │
│        ├─ Run handler (TypeScript)                                           │
│        │     └─ Handler has access to LLM, ledgers, Cortex                   │
│        │                                                                     │
│        └─ Process result:                                                    │
│              ├─ fire: true → invoke agent with context                       │
│              ├─ fire: false, enrich → add context to normal flow             │
│              └─ fire: false → do nothing                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Proactive Automations (Scheduled)

Timer-triggered automations replace heartbeats with explicit behavior:

```typescript
// ~/nexus/state/automations/morning-briefing.ts
export const automation: Automation = {
  name: 'morning-briefing',
  description: 'Daily calendar and email summary',
  
  triggers: {
    event: {
      types: ['timer_tick'],
    },
  },
  
  config: {
    schedule: '0 8 * * *',  // 8am daily
  },
  
  async handler(ctx) {
    // This runs at 8am every day, not "whenever the agent feels like it"
    const events = await ctx.ledger.query(`
      SELECT * FROM calendar_events 
      WHERE date(start_time) = date('now')
    `);
    
    return {
      fire: true,
      context: {
        prompt: 'Summarize today\'s schedule and any important emails',
        data: { events }
      }
    };
  }
};
```

**Key difference from heartbeats:**
- Explicit schedule, not "every N seconds"
- Specific behavior, not "agent decides"
- Auditable — automation ran, produced this result
- No wasted tokens on "HEARTBEAT_OK"

### Reactive Automations (Event-Triggered)

This is the big gap in OpenClaw. Reactive automations trigger on specific event patterns:

```typescript
// ~/nexus/state/automations/mom-2fa-helper.ts
export const automation: Automation = {
  name: 'mom-2fa-helper',
  description: 'Help Mom with 2FA codes when she asks',
  
  triggers: {
    principal: {
      relationship: 'family',
      name: 'Mom',
    },
    event: {
      channels: ['imessage', 'sms'],
      types: ['message'],
    },
  },
  
  async handler(ctx) {
    // Check if this looks like a 2FA request
    const content = ctx.event.content?.text || '';
    
    const classification = await ctx.llm(`
      Is this message asking for help with a 2FA/verification code?
      Message: "${content}"
      Reply with just: YES or NO
    `);
    
    if (!classification.includes('YES')) {
      return { fire: false };
    }
    
    // Fetch recent 2FA emails
    const codes = await ctx.ledger.query(`
      SELECT subject, body, received_at 
      FROM emails 
      WHERE subject LIKE '%verification%' OR subject LIKE '%code%'
      ORDER BY received_at DESC
      LIMIT 5
    `);
    
    return {
      fire: true,
      context: {
        prompt: 'Mom needs help with a 2FA code. Here are recent verification emails - find the right one and help her.',
        data: { codes, original_message: content }
      }
    };
  }
};
```

**This is impossible in OpenClaw:** There's no way to say "when a specific person sends a specific type of message, run this logic." The heartbeat model only supports "periodically, check for things."

---

## Why Reactive Matters

### Real-World Use Cases

| Use Case | Type | OpenClaw | Nexus |
|----------|------|----------|-------|
| "Every morning, summarize my calendar" | Proactive | ⚠️ Heartbeat + agent discretion | ✅ Cron trigger |
| "When Mom asks for 2FA, fetch from email" | Reactive | ❌ Not possible | ✅ Message trigger |
| "When Casey texts 'home safe', cancel safety check" | Reactive | ❌ Not possible | ✅ Message trigger |
| "When I get a flight confirmation, set up check-in reminder" | Reactive | ❌ Not possible | ✅ Email trigger |
| "When Stripe webhook shows high-value payment, alert me" | Reactive | ⚠️ Custom webhook code | ✅ Webhook trigger |
| "Every hour, check if any project needs attention" | Proactive | ⚠️ Heartbeat | ✅ Timer trigger |

### The Pattern

**OpenClaw:** "The agent runs periodically and might notice things."

**Nexus:** "Specific triggers invoke specific behaviors."

This is a fundamental difference. Heartbeats are passive polling. Automations are active event handling.

---

## Automation Results

What an automation handler can return:

```typescript
interface AutomationResult {
  // Core decision
  fire: boolean;
  
  // If fire = true: invoke an agent
  agent?: string;               // Which agent (defaults to session's persona)
  context?: {
    prompt?: string;            // Instruction for the agent
    data?: any;                 // Extracted data to pass
  };
  
  // If fire = false: can still enrich the request
  enrich?: Record<string, any>; // Add to context for normal flow
  
  // Self-disable after this run
  disable?: boolean;
}
```

### Result Patterns

**Invoke a specific agent:**
```typescript
return {
  fire: true,
  agent: 'phone-caller',
  context: {
    prompt: 'Call Tyler to wake him up - Casey hasn\'t confirmed she\'s home safe'
  },
  disable: true  // One-time automation
};
```

**Enrich without invoking:**
```typescript
return {
  fire: false,
  enrich: {
    flight_info: { number: 'UA123', departure: '2026-02-05T10:00:00' }
  }
};
```

**Handle completely (no agent needed):**
```typescript
// Automation handles the reply directly
await sendReply(ctx.event.reply_to, '2FA code from Chase: 847291');
return { fire: false };
```

---

## Trigger Conditions

Fast-path filtering before handler runs:

```typescript
interface TriggerConditions {
  // Match against IAM-resolved principal
  principal?: {
    type?: PrincipalType | PrincipalType[];  // 'owner' | 'known' | 'unknown' | 'system'
    name?: string;
    relationship?: string;    // 'family' | 'partner' | 'work' | 'friend'
    entity_id?: string;
  };
  
  // Match against event properties
  event?: {
    channels?: string[];      // ['imessage', 'sms', 'discord']
    types?: string[];         // ['timer_tick', 'message', 'webhook']
    direction?: 'sent' | 'received';
  };
}
```

**Behavior:**
- If `triggers` defined → system checks them first (fast)
- If triggers don't match → handler never runs
- If triggers match (or not defined) → handler runs

This allows efficient filtering — most automations skip most events without any TypeScript execution.

---

## Declarative vs Imperative

### OpenClaw: Imperative (Agent Discretion)

```markdown
<!-- In SOUL.md or system prompt -->
When you receive a HEARTBEAT, check these things:
1. Look at emails from family members
2. If Mom is asking about 2FA, help her
3. Check calendar for upcoming events
4. Maybe reach out if it's been a while
```

**Problems:**
- Agent may not follow instructions
- No guarantee of timing
- Hard to debug — did the agent check?
- Expensive — runs full agent context every heartbeat

### Nexus: Declarative (Explicit Triggers)

```typescript
// mom-2fa-helper.ts
triggers: {
  principal: { relationship: 'family', name: 'Mom' },
  event: { channels: ['imessage'], types: ['message'] }
}

// morning-briefing.ts  
config: { schedule: '0 8 * * *' }
triggers: { event: { types: ['timer_tick'] } }
```

**Benefits:**
- Explicit behavior — triggers are code, not suggestions
- Efficient — handler only runs when triggers match
- Auditable — automation fired at this time with this result
- Composable — automations are independent units

---

## Circuit Breakers

Nexus monitors automation health:

```typescript
interface AutomationHealth {
  automation_id: string;
  
  // Rolling window stats (last 100 invocations)
  invocation_count: number;
  success_count: number;
  error_count: number;
  fire_count: number;
  
  // Performance
  avg_latency_ms: number;
  p95_latency_ms: number;
  
  // Circuit breaker
  consecutive_errors: number;
  circuit_state: 'closed' | 'open' | 'half-open';
}
```

**Circuit breaker rules:**
- 5 consecutive errors → circuit opens (automation paused)
- After 5 minutes → half-open (try one invocation)
- Success in half-open → circuit closes
- Failure in half-open → circuit stays open

OpenClaw has no equivalent — a broken heartbeat handler just keeps failing.

---

## Example Automations

### Proactive: Morning Briefing

```typescript
export const automation: Automation = {
  name: 'morning-briefing',
  description: 'Daily summary at 8am',
  
  triggers: {
    event: { types: ['timer_tick'] }
  },
  config: { schedule: '0 8 * * *' },
  
  async handler(ctx) {
    const calendar = await ctx.ledger.query('SELECT * FROM calendar_events WHERE ...');
    const emails = await ctx.ledger.query('SELECT * FROM emails WHERE is_unread = 1');
    
    return {
      fire: true,
      context: {
        prompt: 'Give Tyler his morning briefing',
        data: { calendar, emails }
      }
    };
  }
};
```

### Reactive: Casey Safety Check

```typescript
export const automation: Automation = {
  name: 'casey-safety-check',
  description: 'One-time check that Casey made it home',
  
  triggers: {
    principal: { name: 'Casey' },
    event: { channels: ['imessage', 'sms'], types: ['message'] }
  },
  
  async handler(ctx) {
    const content = ctx.event.content?.text?.toLowerCase() || '';
    
    // Cancel condition
    if (content.includes('home') || content.includes('safe')) {
      return { fire: false, disable: true };  // She's safe, disable automation
    }
    
    // Time check - if it's past deadline and she hasn't confirmed
    if (ctx.now > ctx.automation.config.deadline) {
      return {
        fire: true,
        agent: 'phone-caller',
        context: { prompt: 'Call Tyler - Casey hasn\'t confirmed she\'s home safe' },
        disable: true
      };
    }
    
    return { fire: false };  // Not yet deadline, keep waiting
  }
};
```

### Reactive: Flight Check-In

```typescript
export const automation: Automation = {
  name: 'flight-checkin',
  description: 'Automatically check in for flights',
  
  triggers: {
    event: { channels: ['email'], types: ['message'] }
  },
  
  async handler(ctx) {
    const isFlightConfirmation = await ctx.llm(`
      Is this email a flight booking confirmation?
      Subject: ${ctx.event.content?.subject}
      Reply: YES or NO
    `);
    
    if (!isFlightConfirmation.includes('YES')) {
      return { fire: false };
    }
    
    const flightDetails = await ctx.llm(`
      Extract: airline, flight number, departure date/time
      Email: ${ctx.event.content?.body}
      Reply as JSON.
    `, { json: true });
    
    // Schedule a check-in automation for T-24h
    await scheduleAutomation('flight-checkin-execute', {
      flight: JSON.parse(flightDetails),
      trigger_at: subtractHours(flightDetails.departure, 24)
    });
    
    return { fire: false };  // Don't invoke agent now, just scheduled
  }
};
```

---

## Migration from Heartbeats

### Porting Heartbeat Logic

If your OpenClaw agent has heartbeat instructions like:

```markdown
On HEARTBEAT:
- Check emails from family
- Look at calendar for next 2 hours
- Check weather if morning
```

Split into explicit automations:

```typescript
// family-email-watcher.ts
triggers: { event: { types: ['email'], channels: ['gmail'] } }
// Runs on each email, checks if from family

// calendar-reminder.ts  
config: { schedule: '*/30 * * * *' }  // Every 30 min
// Checks for events in next 2 hours

// morning-weather.ts
config: { schedule: '0 7 * * *' }  // 7am daily
// Weather briefing
```

### Benefits of Migration

| Heartbeat | Automations |
|-----------|-------------|
| Agent runs every tick | Only relevant events trigger |
| Agent decides what to check | Explicit per-automation logic |
| HEARTBEAT_OK wastes tokens | No-ops are free (handler returns early) |
| Hard to audit | Full trace of each automation |
| One big blob of instructions | Composable, independent units |

---

## Related Documents

| Document | Purpose |
|----------|---------|
| `../runtime/nex/automations/AUTOMATION_SYSTEM.md` | Full automation specification |
| `../runtime/nex/PLUGINS.md` | NEX plugin system (automations use one hook) |
| `../runtime/nex/NEX.md` | Pipeline architecture |
| `ARCHITECTURAL_PHILOSOPHY.md` | High-level design differences |
| `EVENT_ORCHESTRATION.md` | How events flow through each system |

---

*Nexus bets that explicit triggers beat agent discretion. "When X happens, do Y" is more reliable than "periodically, consider whether to do things."*
