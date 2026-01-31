# NEX — Nexus Event Exchange

**Status:** DESIGN IN PROGRESS  
**Last Updated:** 2026-01-30

---

## Overview

NEX is the central orchestrator for the Nexus system. It receives events from adapters, coordinates the processing pipeline, and manages the flow of data through each stage.

**Key insight:** NEX is a data bus. The `NexusRequest` object flows through the pipeline, accumulating context at each stage. NEX owns this lifecycle.

---

## Design Principles

1. **Central orchestration** — One place owns the pipeline, not a chain of services
2. **Sync pipeline, async persistence** — Critical path is sync; ledger writes are async
3. **Plugin-friendly** — Before/after hooks at each stage
4. **Modular** — Each stage (ACL, Hooks, Broker, etc.) is a replaceable component
5. **Observable** — Full trace of every request persisted

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                      NEX                                         │
│                           (Nexus Event Exchange)                                 │
│                                                                                  │
│  ADAPTERS ──────────────────────────────────────────────────────────────────┐   │
│    │                                                                         │   │
│    │  eve (iMessage)                                                        │   │
│    │  gog (Gmail)                                                           │   │
│    │  discord-cli                                                           │   │
│    │  telegram-bot                                                          │   │
│    │  webhooks (Stripe, GitHub, etc.)                                       │   │
│    │  timers (cron)                                                         │   │
│    │  aix (IDE sessions)                                                    │   │
│    │                                                                         │   │
│    └─────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                           │
│                                      │ AdapterEvent                              │
│                                      ▼                                           │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                          SYNC PIPELINE                                     │  │
│  │                                                                            │  │
│  │  ┌──────────────────────────────────────────────────────────────────────┐ │  │
│  │  │ 1. RECEIVE                                                            │ │  │
│  │  │    • Create NexusRequest from AdapterEvent                           │ │  │
│  │  │    • Populate: request_id, event_id, timestamp, event, delivery      │ │  │
│  │  │    • Async: Write event to Events Ledger                             │ │  │
│  │  └──────────────────────────────────────────────────────────────────────┘ │  │
│  │                                   │                                        │  │
│  │                          [plugin: after_receive]                          │  │
│  │                                   │                                        │  │
│  │  ┌──────────────────────────────────────────────────────────────────────┐ │  │
│  │  │ 2. ACL                                                                │ │  │
│  │  │    • Resolve sender identity from Identity Ledger                    │ │  │
│  │  │    • Evaluate policies                                                │ │  │
│  │  │    • Populate: principal, permissions, session                       │ │  │
│  │  │    • If denied → exit pipeline (async: write denial)                 │ │  │
│  │  │    • Async: Write ACL result                                         │ │  │
│  │  └──────────────────────────────────────────────────────────────────────┘ │  │
│  │                                   │                                        │  │
│  │                          [plugin: after_acl]                              │  │
│  │                                   │                                        │  │
│  │  ┌──────────────────────────────────────────────────────────────────────┐ │  │
│  │  │ 3. HOOKS                                                              │ │  │
│  │  │    • Match hooks against triggers (parallel)                         │ │  │
│  │  │    • Execute matched hooks (parallel where independent)              │ │  │
│  │  │    • Populate: hooks.evaluated, hooks.fired, hooks.context           │ │  │
│  │  │    • If hook handles completely → exit pipeline                      │ │  │
│  │  │    • Async: Write hooks result                                       │ │  │
│  │  └──────────────────────────────────────────────────────────────────────┘ │  │
│  │                                   │                                        │  │
│  │                          [plugin: after_hooks]                            │  │
│  │                                   │                                        │  │
│  │  ┌──────────────────────────────────────────────────────────────────────┐ │  │
│  │  │ 4. BROKER                                                             │ │  │
│  │  │    • Prepare agent execution context (parallel fetches):             │ │  │
│  │  │      - Conversation history                                           │ │  │
│  │  │      - Relevant context from Mnemonic                                │ │  │
│  │  │      - Agent config (persona, model, tools)                          │ │  │
│  │  │    • Create turn in Agents Ledger                                    │ │  │
│  │  │    • Inject channel formatting guidance                              │ │  │
│  │  │    • Populate: agent.agent_id, agent.turn_id, agent.thread_id        │ │  │
│  │  │    • Async: Write broker prep                                        │ │  │
│  │  └──────────────────────────────────────────────────────────────────────┘ │  │
│  │                                   │                                        │  │
│  │                          [plugin: after_broker]                           │  │
│  │                                   │                                        │  │
│  │  ┌──────────────────────────────────────────────────────────────────────┐ │  │
│  │  │ 5. AGENT                                                              │ │  │
│  │  │    • Execute agent with prepared context                             │ │  │
│  │  │    • Stream updates to Agents Ledger                                 │ │  │
│  │  │    • Populate: response.content, response.tool_calls, response.tokens │ │  │
│  │  │    • Async: Write completion to Agents Ledger                        │ │  │
│  │  └──────────────────────────────────────────────────────────────────────┘ │  │
│  │                                   │                                        │  │
│  │                          [plugin: after_agent]                            │  │
│  │                                   │                                        │  │
│  │  ┌──────────────────────────────────────────────────────────────────────┐ │  │
│  │  │ 6. DELIVER                                                            │ │  │
│  │  │    • Format response for channel                                     │ │  │
│  │  │    • Chunk if necessary                                               │ │  │
│  │  │    • Send via out-adapter                                            │ │  │
│  │  │    • Populate: delivery_result                                       │ │  │
│  │  │    • Async: Write response event to Events Ledger                    │ │  │
│  │  └──────────────────────────────────────────────────────────────────────┘ │  │
│  │                                   │                                        │  │
│  │                          [plugin: after_deliver]                          │  │
│  │                                   │                                        │  │
│  │  ┌──────────────────────────────────────────────────────────────────────┐ │  │
│  │  │ 7. COMPLETE                                                           │ │  │
│  │  │    • Finalize NexusRequest                                           │ │  │
│  │  │    • Async: Write full trace to Nexus Ledger                         │ │  │
│  │  │    • Emit to Mnemonic for analysis                                   │ │  │
│  │  └──────────────────────────────────────────────────────────────────────┘ │  │
│  │                                   │                                        │  │
│  │                          [plugin: on_complete]                            │  │
│  │                                                                            │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  LEDGERS (write targets) ───────────────────────────────────────────────────┐   │
│    │                                                                         │   │
│    │  Events Ledger      ← Inbound events, outbound responses               │   │
│    │  Agents Ledger      ← Turns, sessions, tool calls                      │   │
│    │  Identity Ledger    ← Entities, identities (read by ACL)               │   │
│    │  Nexus Ledger       ← Full NexusRequest traces                         │   │
│    │                                                                         │   │
│    └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  MNEMONIC (async processing) ───────────────────────────────────────────────┐   │
│    │                                                                         │   │
│    │  NEX writes to ledgers → Mnemonic's bus picks up → Analysis jobs      │   │
│    │                                                                         │   │
│    │  Episode Store      ← Conversation episodes                            │   │
│    │  Embedding Store    ← Semantic vectors                                 │   │
│    │  Facet Store        ← Extracted structured data                        │   │
│    │  Analysis Store     ← Insights, patterns                               │   │
│    │                                                                         │   │
│    └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## NexusRequest Lifecycle

The `NexusRequest` is created at receive and populated through each stage:

| Stage | Fields Populated |
|-------|------------------|
| **Receive** | `request_id`, `event_id`, `timestamp`, `event`, `delivery` |
| **ACL** | `principal`, `permissions`, `session` |
| **Hooks** | `hooks.evaluated`, `hooks.fired`, `hooks.context` |
| **Broker** | `agent.agent_id`, `agent.turn_id`, `agent.thread_id`, `agent.persona` |
| **Agent** | `response.content`, `response.tool_calls`, `response.tokens` |
| **Deliver** | `delivery_result` |
| **Complete** | `pipeline` trace, final timestamps |

See `NEXUS_REQUEST.md` for full schema.

---

## Sync vs Async

### Sync (Critical Path)

Each stage waits for the previous to complete:

```
Receive → ACL → Hooks → Broker → Agent → Deliver → Complete
```

All of these are sync because each depends on the output of the previous.

### Async (Fire-and-Forget Writes)

After each sync stage, we dispatch an async write to persist current state:

```typescript
// Pseudo-code
async function pipeline(event: AdapterEvent) {
  const req = createNexusRequest(event);
  asyncWrite('events', req.event);           // Fire and forget
  
  const aclResult = await acl.evaluate(req);
  Object.assign(req, aclResult);
  asyncWrite('nex_trace', req);              // Fire and forget
  
  // ... etc
}
```

Benefits:
- Critical path is fast (doesn't wait for I/O)
- State is persisted at each step (crash recovery)
- Writes can be batched/coalesced

### Async (Background Processing)

NEX doesn't have its own job queue. It writes to ledgers, and Mnemonic's bus picks up the writes for analysis:

```
NEX writes to Events Ledger
    ↓
Mnemonic bus detects new row
    ↓
Mnemonic runs analysis job (embedding, facet extraction, etc.)
```

---

## Parallelization

### Within Stages

**Hook Evaluation (parallel):**
```typescript
// All matching hooks evaluate in parallel
const results = await Promise.all(
  matchingHooks.map(h => h.evaluate(req))
);
```

**Broker Preparation (parallel):**
```typescript
const [history, context, config] = await Promise.all([
  getConversationHistory(req.session.session_key),
  mnemonic.queryRelevantContext(req.event.content),
  loadAgentConfig(req.session.persona),
]);
```

### Across Stages

The main pipeline is sequential (each stage depends on previous).

Background work can run in parallel with the main pipeline:
- Async writes to ledgers
- Emit to Mnemonic for analysis

---

## Plugin System

### Plugin Interface

```typescript
interface NEXPlugin {
  name: string;
  priority?: number;  // Lower runs first (default: 100)
  
  // Lifecycle hooks
  afterReceive?(req: NexusRequest): Promise<void | 'skip'>;
  afterACL?(req: NexusRequest): Promise<void | 'skip'>;
  afterHooks?(req: NexusRequest): Promise<void | 'skip'>;
  afterBroker?(req: NexusRequest): Promise<void | 'skip'>;
  afterAgent?(req: NexusRequest): Promise<void | 'skip'>;
  afterDeliver?(req: NexusRequest): Promise<void | 'skip'>;
  
  onComplete?(req: NexusRequest): Promise<void>;
  onError?(req: NexusRequest, error: Error): Promise<void>;
}
```

### Plugin Capabilities

Plugins can:
- **Read** the NexusRequest at any point
- **Modify** the NexusRequest (add to `hooks.context`, adjust `permissions`, etc.)
- **Skip** remaining pipeline (return `'skip'`)
- **Log/observe** the flow
- **Emit** to external systems

### Example Plugins

```typescript
// Logging plugin
const loggingPlugin: NEXPlugin = {
  name: 'logging',
  afterReceive: async (req) => {
    console.log(`[NEX] Received: ${req.event_id}`);
  },
  onComplete: async (req) => {
    console.log(`[NEX] Complete: ${req.request_id} in ${req.pipeline.duration_ms}ms`);
  },
};

// Analytics plugin
const analyticsPlugin: NEXPlugin = {
  name: 'analytics',
  onComplete: async (req) => {
    await analytics.track('request_complete', {
      channel: req.delivery.channel,
      persona: req.session.persona,
      duration_ms: req.pipeline.duration_ms,
    });
  },
};

// Custom ACL override plugin
const customACLPlugin: NEXPlugin = {
  name: 'custom-acl',
  priority: 50,  // Run before default
  afterReceive: async (req) => {
    if (req.event.content.includes('ADMIN_OVERRIDE')) {
      req.principal = { type: 'owner', name: 'Admin Override' };
      return 'skip';  // Skip normal ACL
    }
  },
};
```

### Agent-Written Plugins

Agents can create plugins via a skill:

```typescript
// Agent writes this to plugins/my-custom-hook.ts
export const plugin: NEXPlugin = {
  name: 'agent-created-hook',
  afterHooks: async (req) => {
    if (req.event.content.match(/urgent/i)) {
      req.hooks.context.priority = 'urgent';
    }
  },
};
```

NEX loads plugins from a directory on startup.

---

## Adapters

### Adapter Interface

```typescript
interface NEXAdapter {
  name: string;
  channel: string;
  
  // Inbound
  start(): Promise<void>;
  stop(): Promise<void>;
  onEvent(callback: (event: AdapterEvent) => void): void;
  
  // Outbound (optional)
  send?(target: DeliveryTarget, content: string): Promise<DeliveryResult>;
}

interface AdapterEvent {
  channel: string;
  source_id: string;
  content: string;
  content_type: string;
  
  // Sender
  sender_id: string;
  sender_name?: string;
  
  // Context
  peer_id: string;
  peer_kind: 'dm' | 'group' | 'channel';
  thread_id?: string;
  reply_to_id?: string;
  
  // Metadata
  timestamp: number;
  metadata?: Record<string, any>;
}
```

### Adapter Types

| Type | Examples | Connection |
|------|----------|------------|
| **CLI tools** | `eve`, `gog`, `discord-cli` | Subprocess, JSON lines |
| **Daemons** | `telegram-bot`, `signal-cli` | Socket/gRPC |
| **Webhooks** | Stripe, GitHub, Slack | HTTP server |
| **Timers** | Cron, heartbeat | Internal scheduler |
| **IDE** | `aix` | Local socket |

### Adapter Registration

```typescript
// NEX startup
nex.registerAdapter(new EveAdapter());
nex.registerAdapter(new GogAdapter());
nex.registerAdapter(new DiscordAdapter());
nex.registerAdapter(new WebhookAdapter('/webhooks'));
nex.registerAdapter(new TimerAdapter({ interval: 60_000 }));
```

---

## Error Handling

### Pipeline Errors

If any sync stage throws:

1. Log the error with full context
2. Call `onError` plugins
3. Write error state to Nexus Ledger
4. Return error to adapter (if applicable)

```typescript
try {
  await pipeline(event);
} catch (error) {
  await asyncWrite('nex_trace', { ...req, error: serializeError(error) });
  await Promise.all(plugins.map(p => p.onError?.(req, error)));
  throw error;  // Or return gracefully
}
```

### Async Write Errors

Fire-and-forget writes log errors but don't fail the pipeline:

```typescript
function asyncWrite(ledger: string, data: any) {
  writeToLedger(ledger, data).catch(err => {
    console.error(`[NEX] Async write failed: ${err.message}`);
    // Could retry, but don't block
  });
}
```

### Retry Logic

For transient errors (network, rate limits), stages can implement retry:

```typescript
const response = await retry(
  () => agent.execute(req),
  { maxAttempts: 3, backoff: 'exponential' }
);
```

---

## Configuration

### NEX Config

```yaml
# nex.yaml
pipeline:
  timeout_ms: 300000        # 5 min max per request
  
ledgers:
  events: sqlite://./data/events.db
  agents: sqlite://./data/agents.db
  identity: sqlite://./data/identity.db
  nexus: sqlite://./data/nexus.db

adapters:
  - type: eve
    enabled: true
  - type: gog
    enabled: true
  - type: webhook
    port: 8080
    path: /webhooks
  - type: timer
    interval_ms: 60000

plugins:
  directory: ./plugins
  enabled:
    - logging
    - analytics
```

---

## Location in Codebase

```
nexus/
├── nex/                        # NEX package
│   ├── nex.ts                  # Main orchestrator
│   ├── pipeline.ts             # Pipeline execution
│   ├── request.ts              # NexusRequest type and helpers
│   ├── plugins/                # Plugin system
│   │   ├── loader.ts
│   │   ├── types.ts
│   │   └── builtin/            # Built-in plugins
│   ├── adapters/               # Adapter implementations
│   │   ├── types.ts
│   │   ├── eve.ts
│   │   ├── gog.ts
│   │   ├── discord.ts
│   │   ├── webhook.ts
│   │   └── timer.ts
│   ├── stages/                 # Pipeline stages
│   │   ├── receive.ts
│   │   ├── acl.ts
│   │   ├── hooks.ts
│   │   ├── broker.ts
│   │   ├── agent.ts
│   │   ├── deliver.ts
│   │   └── complete.ts
│   └── ledger/                 # Ledger write helpers
│       ├── events.ts
│       ├── agents.ts
│       ├── identity.ts
│       └── nexus.ts
```

---

## Resolved Design Questions

### Timer Events
Timer events (heartbeat, cron) are just another adapter source. They go through the full pipeline like any other event.

### Agent-to-Agent
When MA spawns WA, it skips the NexusRequest flow and connects directly through Broker. The Broker still logs to the Event and Agent ledgers, but we don't run ACL/hooks for inter-agent communication. May revisit if needed.

### Multi-Response
The agent uses the `send message` tool, which routes through NEX to the appropriate out-adapter. The out-adapter handles chunking — the agent doesn't think about it. If the agent wants to send multiple messages (even across channels), they make multiple tool calls.

### Streaming
Agent streaming (token-by-token output, typing indicators) is handled by Broker/Agent directly to the adapter. NEX provides the delivery context at setup, but doesn't intercept streaming — that would be too slow. Final response is persisted after completion.

Streaming flow:
```
Agent generates tokens
    ↓
Broker/pi-agent emits text_delta events
    ↓
Adapter receives (e.g., Telegram edits draft, typing indicator)
    ↓
On completion, full response written to ledger
```

---

## Evolution from Mnemonic

NEX is the evolution of the existing Mnemonic server. The Go infrastructure becomes the NEX foundation:

```
Current Mnemonic                    Becomes NEX
────────────────                    ──────────────
Go server                      →    NEX core
Async job bus                  →    Powers hook parallelization
Ledger stores                  →    Events/Agents/Identity/Nexus ledgers
Analysis jobs                  →    Continue as background processing

New in NEX:
- Pipeline orchestration (Receive → ACL → Hooks → Broker → Agent → Deliver)
- Plugin system (before/after hooks at each stage)
- Adapter registry
- NexusRequest data bus
```

This means:
- We don't build a separate job queue — we use Mnemonic's existing bus
- The async write pattern is already implemented
- The ledger infrastructure exists
- We add pipeline orchestration and plugins on top

---

## Related Specs

- `NEXUS_REQUEST.md` — The data bus schema
- `INTERFACE_WORKPLAN.md` — Interface tracking
- `../adapters/` — Adapter specifications
- `../acl/` — ACL specifications
- `../agent-system/` — Broker and agent specifications
