# Automation System

**Status:** DESIGN COMPLETE  
**Last Updated:** 2026-02-04  
**Related:** ../PLUGINS.md, ../NEX.md

---

## Overview

Automations are the most important type of **hook** in the NEX pipeline. They are user/agent-created scripts that evaluate incoming events and decide whether to invoke an agent, enrich context, or take some other action. Automations are how NEX handles both **reactive** and **proactive** event processing.

**Key insight:** Hooks are the general extensibility mechanism for the NEX pipeline — scripts that run at various pipeline stages. Automations are a specific, first-class type of hook that runs at the `runAutomations` stage, handling event-driven agent invocation.

### Hook → Automation Hierarchy

```
Pipeline Hooks (general mechanism — scripts at any pipeline stage)
├── Stage hooks: afterReceiveEvent, afterResolveIdentity, etc.
│   (for logging, metrics, custom routing, etc.)
│
└── Automations (run at runAutomations stage — the primary hook type)
    ├── Event-triggered (reactive: incoming message matches criteria → invoke agent)
    ├── Timer-triggered (proactive: clock adapter emits tick → check conditions → maybe act)
    └── One-shot (fire once, self-disable after execution)
```

See `../../hooks/HOOK_SERVICE.md` for the general hook mechanism that automations build on.

---

## Terminology

| Term | Definition |
|------|------------|
| **Hooks** | General extensibility mechanism — scripts that run at NEX pipeline stages |
| **Automations** | Primary hook type — evaluate events at `runAutomations` and decide agent invocation |
| **External Events** | Messages from platforms (iMessage, Discord, etc.) normalized and stored in Events Ledger |
| **Proactive Events** | Timer/clock adapter emits periodic events; automations evaluate and may trigger agents |
| **Bus Events** | Internal real-time pub/sub for UI streaming, file watchers, etc. |

---

## Creation Flow (Agent Experience)

1. **Agent writes a script** to `~/nexus/state/automations/`
2. **Agent runs CLI command** to register it: `nexus automation register <filename>`
3. **System validates** the script and activates it

```bash
# Example
nexus automation register casey-safety-check.ts
# ✅ Registered automation: casey-safety-check
#    Triggers: system events (timer_tick)
#    Status: active
```

---

## Automation Schema

```typescript
interface Automation {
  name: string;
  description: string;
  
  // Optional: fast-path filtering
  // If present, system checks these BEFORE running handler
  // If absent, handler runs for every event
  triggers?: TriggerConditions;
  
  // Optional: automation-specific configuration
  config?: Record<string, any>;
  
  // The handler function
  handler: (ctx: AutomationContext) => Promise<AutomationResult>;
}
```

### Trigger Conditions (Optional)

Triggers enable fast filtering without running the handler:

```typescript
interface TriggerConditions {
  // Match against IAM-resolved principal
  principal?: {
    type?: PrincipalType | PrincipalType[];  // 'owner' | 'known' | 'unknown' | 'system' | 'webhook' | 'agent'
    name?: string;              // Match by resolved name
    relationship?: string;      // 'family' | 'partner' | 'work' | 'friend'
    entity_id?: string;         // Match specific entity
  };
  
  // Match against event properties
  event?: {
    channels?: string[];        // ['imessage', 'sms', 'discord']
    types?: string[];           // ['timer_tick', 'message']
    direction?: 'sent' | 'received';
  };
}
```

**Behavior:**
- If `triggers` defined → system checks them first (fast)
- If triggers don't match → handler never runs
- If triggers match (or not defined) → handler runs

---

## Automation Context

What the handler receives:

```typescript
interface AutomationContext {
  // The event being evaluated
  event: NexusEvent;
  
  // Already resolved by IAM layer
  principal: Principal;         // WHO sent this
  permissions: Permissions;     // What they can do
  session: Session;             // Current session context
  
  // This automation's info
  automation: {
    id: string;
    name: string;
    created_at: number;
    last_triggered?: number;
    config: Record<string, any>;
  };
  
  // Services
  ledger: LedgerClient;         // Query ledgers
  cortex: CortexClient;         // Semantic search
  llm: LLMService;              // Call LLM
  
  // Utilities
  now: Date;
  log: Logger;
}
```

### Service Interfaces

```typescript
interface LedgerClient {
  query<T>(sql: string, params?: any[]): Promise<T[]>;
  // Read-only access to Events, Agents, Identity ledgers
}

interface CortexClient {
  search(query: string, options?: {
    channels?: string[];
    since?: number;
    limit?: number;
  }): Promise<{ eventId: string; score: number }[]>;
}

interface LLMService {
  (prompt: string, options?: { json?: boolean }): Promise<string>;
  // Fixed model (gemini-3-flash-preview), no model choice
}
```

---

## Automation Result

What the handler returns:

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

**Do nothing:**
```typescript
return { fire: false };
```

**Self-disable silently:**
```typescript
return { fire: false, disable: true };
```

---

## Execution Model

```
Event arrives in NEX pipeline
         │
         ▼
    IAM resolves identity/permissions
         │
         ▼
    For each automation:
         │
         ├─ If triggers defined → check them (fast)
         │     └─ If don't match → skip handler
         │
         ├─ Run handler
         │     └─ Handler returns AutomationResult
         │
         └─ If fire=true → dispatch to Broker
         │  If enrich → add to NexusRequest context
         │  If disable → mark automation disabled
         │
         ▼
    Continue pipeline (context assembly, agent, etc.)
```

---

## Circuit Breakers

The system monitors automation health:

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
  last_error_at?: number;
}
```

**Circuit breaker rules:**
- 5 consecutive errors → circuit opens (automation paused)
- After 5 minutes → half-open (try one invocation)
- Success in half-open → circuit closes
- Failure in half-open → circuit stays open, reset timer

---

## CLI Commands

```bash
# Register a new automation
nexus automation register <filename>

# List all automations
nexus automation list

# Show automation details
nexus automation info <name>

# Enable/disable an automation
nexus automation enable <name>
nexus automation disable <name>

# Delete an automation
nexus automation delete <name>

# Test an automation against a sample event
nexus automation test <name> --event <event-json>
```

---

## File Storage

Automations are stored as files in the workspace:

```
~/nexus/state/automations/
├── casey-safety-check.ts
├── mom-2fa-helper.ts
├── heartbeat.ts
└── ...
```

Discovery is **CLI-based**, not file-watching. Agents register automations via `nexus automation register <filename>`, which validates the script and stores a record in the `automations` database table. The file system is where scripts live; the database is the source of truth for what's active.

---

## Examples

See `examples/` folder for complete examples:

| File | Pattern | Description |
|------|---------|-------------|
| `casey-safety-check.ts` | Timer + LLM | One-shot check if Casey made it home |
| `mom-2fa-helper.ts` | LLM classification | Help Mom with 2FA codes |
| `heartbeat.ts` | Timer | Periodic check-in |
| `stripe-high-value.ts` | Webhook filter | Alert on high-value payments |
| `flight-checkin.ts` | LLM + dedup | Check in for flights |

---

## Related Specs

- `../PLUGINS.md` — NEX plugin system (automations are one plugin type)
- `../NEX.md` — Pipeline architecture
- `../../iam/` — IAM resolves identity before automations run
- `../../broker/` — Broker receives dispatch when automations fire
