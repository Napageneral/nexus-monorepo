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
2. **In-process stages** — All stages are functions in one process; no network hops
3. **Sync pipeline, async persistence** — Critical path is sync; ledger writes are async
4. **Plugin-friendly** — Before/after hooks at each stage
5. **Modular** — Each stage (ACL, Hooks, Broker, etc.) is a replaceable component
6. **Observable** — Full trace of every request persisted
7. **Direct reads, orchestrated writes** — Reads go direct; request lifecycle writes go through NEX

---

## In-Process Architecture

NEX is a single process. All stages are **functions**, not separate services. There are no network hops between stages.

```
NEX Process (single binary)
├── receiveEvent()       // 1. Normalize event, create NexusRequest
├── resolveIdentity()    // 2. WHO sent this? Lookup Identity Ledger
├── resolveAccess()      // 3. WHAT can they do? Policies → permissions, base session
├── executeTriggers()    // 4. Match triggers, execute hooks, may override session
├── assembleContext()    // 5. Gather history, Cortex context, agent config, formatting
├── runAgent()           // 6. Execute agent with assembled context
├── deliverResponse()    // 7. Format, chunk, send via out-adapter
└── finalize()           // 8. Write trace, emit to Cortex

All function calls. No network hops.
```

**Key insight:** Each stage name is a verb describing its action. No ambiguity about what happens where.

### Stage Responsibilities

| Stage | Input | Output | May Exit Pipeline? |
|-------|-------|--------|-------------------|
| `receiveEvent()` | AdapterEvent | NexusRequest created | No |
| `resolveIdentity()` | NexusRequest | `principal.identity` populated | Yes (unknown sender) |
| `resolveAccess()` | NexusRequest | `permissions`, `session` (base) | Yes (access denied) |
| `executeTriggers()` | NexusRequest | `hooks.*`, `session` (final) | Yes (hook handles completely) |
| `assembleContext()` | NexusRequest | `agent.context` assembled | No |
| `runAgent()` | NexusRequest | `response.*` populated | No |
| `deliverResponse()` | NexusRequest | `delivery_result` | No |
| `finalize()` | NexusRequest | `pipeline` trace complete | No |

---

## Database Access Patterns

**Principle:** NEX owns writes during request processing. Everything else accesses the database directly.

### Hybrid Approach

| Access Type | Route | Why |
|-------------|-------|-----|
| **NexusRequest lifecycle** | Through NEX | NEX orchestrates; writes are part of pipeline |
| **Reads/queries** | Direct | No reason to add latency |
| **Background jobs** | Direct | Independent work, not part of request |
| **Analysis/indexing** | Direct | Cortex's existing pattern |

### What This Means Concretely

1. **Stages don't write to ledgers** — they return results to NEX, NEX writes
2. **Broker doesn't write to Agents Ledger** — Broker executes agent, returns result, NEX writes
3. **CLI reads directly** — no need to route queries through NEX
4. **Cortex jobs write directly** — they're not part of a NexusRequest

This isn't about routing — it's separation of concerns. The Broker's job is to execute agents. NEX's job is to orchestrate and maintain the audit trail.

### Shared Database Library

```go
// nexus/db/ledgers.go
package db

type Ledgers struct {
    Events  *EventsLedger
    Agents  *AgentsLedger
    Nexus   *NexusLedger  // NexusRequest storage
}

// Used by NEX for pipeline writes
func (l *Ledgers) WriteAgentTurn(...)
func (l *Ledgers) WriteEvent(...)

// Used by CLI, analysis jobs, etc for queries
func (l *Ledgers) QueryThreads(...)
func (l *Ledgers) GetSession(...)
```

Both NEX and other components use the same library. NEX doesn't "own" the database — it owns the NexusRequest lifecycle.

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
│  │                          SYNC PIPELINE (8 stages)                         │  │
│  │                                                                            │  │
│  │  ┌──────────────────────────────────────────────────────────────────────┐ │  │
│  │  │ 1. receiveEvent()                                                     │ │  │
│  │  │    • Create NexusRequest from AdapterEvent                           │ │  │
│  │  │    • Populate: request_id, event_id, timestamp, event, delivery      │ │  │
│  │  │    • Async: Write event to Events Ledger                             │ │  │
│  │  └──────────────────────────────────────────────────────────────────────┘ │  │
│  │                                   │                                        │  │
│  │                        [plugin: afterReceiveEvent]                        │  │
│  │                                   │                                        │  │
│  │  ┌──────────────────────────────────────────────────────────────────────┐ │  │
│  │  │ 2. resolveIdentity()                                                  │ │  │
│  │  │    • WHO sent this?                                                   │ │  │
│  │  │    • Lookup sender in Identity Ledger                                │ │  │
│  │  │    • Populate: principal.identity                                    │ │  │
│  │  │    • If unknown → may exit or create new identity                    │ │  │
│  │  └──────────────────────────────────────────────────────────────────────┘ │  │
│  │                                   │                                        │  │
│  │                       [plugin: afterResolveIdentity]                      │  │
│  │                                   │                                        │  │
│  │  ┌──────────────────────────────────────────────────────────────────────┐ │  │
│  │  │ 3. resolveAccess()                                                    │ │  │
│  │  │    • WHAT can they do?                                                │ │  │
│  │  │    • Evaluate ACL policies                                            │ │  │
│  │  │    • Populate: principal.permissions, session (BASE)                 │ │  │
│  │  │    • If denied → exit pipeline (async: write denial)                 │ │  │
│  │  │    • Async: Write ACL result                                         │ │  │
│  │  └──────────────────────────────────────────────────────────────────────┘ │  │
│  │                                   │                                        │  │
│  │                        [plugin: afterResolveAccess]                       │  │
│  │                                   │                                        │  │
│  │  ┌──────────────────────────────────────────────────────────────────────┐ │  │
│  │  │ 4. executeTriggers()                                                  │ │  │
│  │  │    • Match hooks against triggers (parallel)                         │ │  │
│  │  │    • Execute matched hooks (parallel where independent)              │ │  │
│  │  │    • May override session (smart routing)                            │ │  │
│  │  │    • Populate: hooks.*, session (FINAL)                              │ │  │
│  │  │    • If hook handles completely → exit pipeline                      │ │  │
│  │  │    • Async: Write hooks result                                       │ │  │
│  │  └──────────────────────────────────────────────────────────────────────┘ │  │
│  │                                   │                                        │  │
│  │                       [plugin: afterExecuteTriggers]                      │  │
│  │                                   │                                        │  │
│  │  ┌──────────────────────────────────────────────────────────────────────┐ │  │
│  │  │ 5. assembleContext()                                                  │ │  │
│  │  │    • Gather context for finalized session (parallel fetches):        │ │  │
│  │  │      - Conversation history                                           │ │  │
│  │  │      - Relevant context from Cortex                                │ │  │
│  │  │      - Agent config (persona, model, tools)                          │ │  │
│  │  │      - Channel formatting guidance                                    │ │  │
│  │  │    • Create turn in Agents Ledger                                    │ │  │
│  │  │    • Populate: agent.context, agent.turn_id, agent.thread_id         │ │  │
│  │  │    • Async: Write context prep                                       │ │  │
│  │  └──────────────────────────────────────────────────────────────────────┘ │  │
│  │                                   │                                        │  │
│  │                       [plugin: afterAssembleContext]                      │  │
│  │                                   │                                        │  │
│  │  ┌──────────────────────────────────────────────────────────────────────┐ │  │
│  │  │ 6. runAgent()                                                         │ │  │
│  │  │    • Execute agent with assembled context                            │ │  │
│  │  │    • Streaming: tokens flow directly to adapter                      │ │  │
│  │  │    • Populate: response.content, response.tool_calls, response.tokens │ │  │
│  │  │    • Async: Write completion to Agents Ledger                        │ │  │
│  │  └──────────────────────────────────────────────────────────────────────┘ │  │
│  │                                   │                                        │  │
│  │                          [plugin: afterRunAgent]                          │  │
│  │                                   │                                        │  │
│  │  ┌──────────────────────────────────────────────────────────────────────┐ │  │
│  │  │ 7. deliverResponse()                                                  │ │  │
│  │  │    • Format response for channel                                     │ │  │
│  │  │    • Chunk if necessary                                               │ │  │
│  │  │    • Send via out-adapter                                            │ │  │
│  │  │    • Populate: delivery_result                                       │ │  │
│  │  │    • Async: Write response event to Events Ledger                    │ │  │
│  │  └──────────────────────────────────────────────────────────────────────┘ │  │
│  │                                   │                                        │  │
│  │                       [plugin: afterDeliverResponse]                      │  │
│  │                                   │                                        │  │
│  │  ┌──────────────────────────────────────────────────────────────────────┐ │  │
│  │  │ 8. finalize()                                                         │ │  │
│  │  │    • Finalize NexusRequest                                           │ │  │
│  │  │    • Async: Write full trace to Nexus Ledger                         │ │  │
│  │  │    • Emit to Cortex for analysis                                   │ │  │
│  │  └──────────────────────────────────────────────────────────────────────┘ │  │
│  │                                   │                                        │  │
│  │                          [plugin: onFinalize]                             │  │
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
│  CORTEX (async processing) ───────────────────────────────────────────────┐   │
│    │                                                                         │   │
│    │  NEX writes to ledgers → Cortex's bus picks up → Analysis jobs      │   │
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

The `NexusRequest` is created at `receiveEvent()` and populated through each stage:

| Stage | Fields Populated |
|-------|------------------|
| **receiveEvent()** | `request_id`, `event_id`, `timestamp`, `event`, `delivery` |
| **resolveIdentity()** | `principal.identity` |
| **resolveAccess()** | `principal.permissions`, `session` (base) |
| **executeTriggers()** | `hooks.evaluated`, `hooks.fired`, `hooks.context`, `session` (final) |
| **assembleContext()** | `agent.context`, `agent.turn_id`, `agent.thread_id`, `agent.persona` |
| **runAgent()** | `response.content`, `response.tool_calls`, `response.tokens` |
| **deliverResponse()** | `delivery_result` |
| **finalize()** | `pipeline` trace, final timestamps |

### Data Flow Visualization

```
receiveEvent()       → request.event populated
                        │
resolveIdentity()    → request.principal.identity populated
                        │
resolveAccess()      → request.principal.permissions
                       request.session (BASE)
                        │
executeTriggers()    → request.session (FINAL - may be overridden by trigger)
                       request.hooks.context (injected context)
                        │
assembleContext()    → request.agent.context (history, Cortex, config, formatting)
                        │
runAgent()           → request.response.* populated
                        │
deliverResponse()    → request.delivery_result
                        │
finalize()           → request.pipeline trace complete
```

See `NEXUS_REQUEST.md` for full schema.

---

## Sync vs Async

### Sync (Critical Path)

Each stage waits for the previous to complete:

```
receiveEvent → resolveIdentity → resolveAccess → executeTriggers → assembleContext → runAgent → deliverResponse → finalize
```

All 8 stages are sync because each depends on the output of the previous.

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

NEX doesn't have its own job queue. It writes to ledgers, and Cortex's bus picks up the writes for analysis:

```
NEX writes to Events Ledger
    ↓
Cortex bus detects new row
    ↓
Cortex runs analysis job (embedding, facet extraction, etc.)
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
  cortex.queryRelevantContext(req.event.content),
  loadAgentConfig(req.session.persona),
]);
```

### Across Stages

The main pipeline is sequential (each stage depends on previous).

Background work can run in parallel with the main pipeline:
- Async writes to ledgers
- Emit to Cortex for analysis

---

## Plugin System

### Plugin Interface

```typescript
interface NEXPlugin {
  name: string;
  priority?: number;  // Lower runs first (default: 100)
  
  // Lifecycle hooks (after each stage)
  afterReceiveEvent?(req: NexusRequest): Promise<void | 'skip'>;
  afterResolveIdentity?(req: NexusRequest): Promise<void | 'skip'>;
  afterResolveAccess?(req: NexusRequest): Promise<void | 'skip'>;
  afterExecuteTriggers?(req: NexusRequest): Promise<void | 'skip'>;
  afterAssembleContext?(req: NexusRequest): Promise<void | 'skip'>;
  afterRunAgent?(req: NexusRequest): Promise<void | 'skip'>;
  afterDeliverResponse?(req: NexusRequest): Promise<void | 'skip'>;
  
  onFinalize?(req: NexusRequest): Promise<void>;
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
  afterReceiveEvent: async (req) => {
    console.log(`[NEX] Received: ${req.event_id}`);
  },
  onFinalize: async (req) => {
    console.log(`[NEX] Complete: ${req.request_id} in ${req.pipeline.duration_ms}ms`);
  },
};

// Analytics plugin
const analyticsPlugin: NEXPlugin = {
  name: 'analytics',
  onFinalize: async (req) => {
    await analytics.track('request_complete', {
      channel: req.delivery.channel,
      persona: req.session.persona,
      duration_ms: req.pipeline.duration_ms,
    });
  },
};

// Identity enrichment plugin (runs after identity resolved, before access check)
const enrichIdentityPlugin: NEXPlugin = {
  name: 'enrich-identity',
  afterResolveIdentity: async (req) => {
    // Add extra context from external system
    const profile = await crm.getProfile(req.principal.identity.email);
    req.principal.identity.metadata = { ...req.principal.identity.metadata, crm: profile };
  },
};

// Context injection plugin (runs after triggers, before context assembly)
const urgentFlagPlugin: NEXPlugin = {
  name: 'urgent-flag',
  afterExecuteTriggers: async (req) => {
    if (req.event.content.match(/urgent|asap|emergency/i)) {
      req.hooks.context.priority = 'urgent';
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
  afterExecuteTriggers: async (req) => {
    // Custom routing: if message mentions "code", route to CodeAgent
    if (req.event.content.match(/code|programming|debug/i)) {
      req.session = { ...req.session, persona: 'code-agent' };
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
│   ├── stages/                 # Pipeline stages (8 total)
│   │   ├── receiveEvent.ts
│   │   ├── resolveIdentity.ts
│   │   ├── resolveAccess.ts
│   │   ├── executeTriggers.ts
│   │   ├── assembleContext.ts
│   │   ├── runAgent.ts
│   │   ├── deliverResponse.ts
│   │   └── finalize.ts
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

## Evolution from Cortex

NEX is the evolution of the existing Cortex server. The Go infrastructure becomes the NEX foundation:

```
Current Cortex                    Becomes NEX
────────────────                    ──────────────
Go server                      →    NEX core
Async job bus                  →    Powers hook parallelization
Ledger stores                  →    Events/Agents/Identity/Nexus ledgers
Analysis jobs                  →    Continue as background processing

New in NEX:
- 8-stage pipeline (receiveEvent → resolveIdentity → resolveAccess → executeTriggers → assembleContext → runAgent → deliverResponse → finalize)
- Plugin system (after hooks at each stage)
- Adapter registry
- NexusRequest data bus
```

This means:
- We don't build a separate job queue — we use Cortex's existing bus
- The async write pattern is already implemented
- The ledger infrastructure exists
- We add pipeline orchestration and plugins on top

---

## Related Specs

- `NEXUS_REQUEST.md` — The data bus schema
- `PLUGINS.md` — NEX plugin system
- `automations/` — Automation system
- `../adapters/` — Adapter specifications
- `../iam/` — IAM specifications
- `../broker/` — Broker and agent specifications
