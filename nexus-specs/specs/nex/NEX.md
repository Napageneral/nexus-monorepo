# NEX — Nexus Event Exchange

**Status:** DESIGN SPEC (legacy pipeline baseline; operation model superseded in direction)
**Last Updated:** 2026-02-25
**Database layout:** See `../DATABASE_ARCHITECTURE.md` for canonical database inventory (6 databases)

---

## Supersession Note

Canonical runtime operation semantics now live in `UNIFIED_RUNTIME_OPERATION_MODEL.md`.

This document remains valuable for runtime internals and component context, but operation-lifecycle decisions should follow the unified model:

1. single runtime operation model
2. unified `NexusEvent.operation` envelope
3. universal `resolvePrincipals` + `resolveAccess`
4. operation registry as the authoritative runtime interface

If this document conflicts with `UNIFIED_RUNTIME_OPERATION_MODEL.md`, the unified model wins.

---

## Overview

NEX is the central orchestrator for the Nexus system. It receives events from adapters, coordinates the processing pipeline, and manages the flow of data through each stage.

**Key insight:** NEX is a data bus. The `NexusRequest` object flows through the pipeline, accumulating context at each stage. NEX owns this lifecycle.

Routing and identity language in this document follows:
`ENTITY_SYMMETRIC_ROUTING_AND_PERSONA_BINDING.md` (sender/receiver symmetry, account-bound receiver resolution, entity-based session labels, no Atlas fallback).

---

## Design Principles

1. **Central orchestration** — One place owns the pipeline, not a chain of services
2. **In-process stages** — All stages are functions in one process; no network hops
3. **Sync pipeline, async persistence** — Critical path is sync; ledger writes are async
4. **Hookpoint-driven** — Automations and plugins attach to stage boundaries, not a dedicated stage
5. **Modular** — Each stage (IAM, Agent Broker, etc.) is a replaceable component
6. **Observable** — Full trace of every request persisted to Nexus Ledger
7. **Direct reads, orchestrated writes** — Reads go direct; request lifecycle writes go through NEX
8. **Adapters are external** — Adapters are CLI executables managed by the Adapter Manager, not in-process objects

---

## In-Process Architecture

NEX is a single TypeScript process. All stages are **functions**, not separate services. There are no network hops between stages.

```
NEX Process (TypeScript)
│
│  UNIVERSAL STAGES (always run)
├── receiveEvent()        // 1. Normalize NexusEvent, create NexusRequest
├── resolvePrincipals()   // 2. AuthN + sender/receiver principal resolution
├── resolveAccess()       // 3. WHAT can they do? Policies → permissions, session routing
│
│  ── [routing decision: receiver.type] ──
│
│  AGENT PATH (receiver.type = 'agent')
├── assembleContext()     // 4. Build AssembledContext (history, memory, config, formatting)
├── runAgent()            // 5. Execute agent with assembled context
│   └── deliverResponse() //    Agent tool: format, chunk, send via out-adapter
│
│  API PATH (receiver.type = 'system' | programmatic callers)
├── (handle directly)     //    Return result to caller, no agent execution
│
│  FINALIZE (always runs)
└── finalize()            // 6. Persist final trace/audit status

All function calls. No network hops.
Automation hookpoints fire at every stage boundary (before/after any stage).
```

### Pipeline Model

The pipeline has **3 universal stages**, a **routing decision**, **conditional execution paths**, and a **finalize** that always runs. This is NOT a flat sequence of 9 stages — the agent execution path is conditional on the receiver type.

**Automation hookpoints** are not a dedicated stage. Automations are configured to fire at any stage boundary (e.g., `afterResolvePrincipals`, `beforeAssembleContext`, `onFinalize`). The old `runAutomations()` stage is replaced by the hookpoint system — automations can intercept the pipeline at any point, not just between resolveAccess and assembleContext.

**deliverResponse** is an agent capability (tool), not a strict pipeline stage. The agent calls `send_message` which routes through the adapter system. For streaming adapters, delivery happens inline during `runAgent`. For non-streaming adapters, delivery happens after agent completion. Either way, it's part of the agent execution path, not a standalone stage.

### Stage Responsibilities

| Stage | Input | Output on NexusRequest | May Exit Pipeline? |
|-------|-------|------------------------|-------------------|
| **Universal** | | | |
| `receiveEvent()` | NexusEvent from adapter | `event`, `delivery` populated | No |
| `resolvePrincipals()` | NexusRequest | `sender` populated and `receiver` resolved (runtime/system or target entity/agent) | Yes (unknown sender/invalid receiver policy) |
| `resolveAccess()` | NexusRequest | `access` populated (decision, permissions, routing) | Yes (access denied) |
| **Agent Path** | | | |
| `assembleContext()` | NexusRequest | `agent` populated (turn_id, model, token_budget); builds `AssembledContext` internally | No |
| `runAgent()` | AssembledContext (from assembleContext) | `response` populated (content, tool_calls, usage) | No |
| ↳ `deliverResponse()` | NexusRequest | `delivery_result` populated (agent tool, may be implicit via streaming) | No |
| **Always** | | | |
| `finalize()` | NexusRequest | `pipeline` trace complete, `status` set | No (always runs) |

See `NEXUS_REQUEST.md` for the full typed schema per stage.

### Automation Hookpoints

Automations attach to stage boundaries, not to a dedicated pipeline slot. Any automation can be configured to fire at any hookpoint:

```typescript
interface AutomationHookpoint {
  // Before-stage hooks (can short-circuit the pipeline)
  beforeResolvePrincipals?(req: NexusRequest): Promise<void | 'skip' | 'handled'>;
  beforeResolveAccess?(req: NexusRequest): Promise<void | 'skip' | 'handled'>;
  beforeAssembleContext?(req: NexusRequest): Promise<void | 'skip' | 'handled'>;

  // After-stage hooks (can observe, enrich, or short-circuit)
  afterReceiveEvent?(req: NexusRequest): Promise<void | 'skip' | 'handled'>;
  afterResolvePrincipals?(req: NexusRequest): Promise<void | 'skip' | 'handled'>;
  afterResolveAccess?(req: NexusRequest): Promise<void | 'skip' | 'handled'>;
  afterRunAgent?(req: NexusRequest): Promise<void | 'skip' | 'handled'>;

  // Finalize hook (observe only, cannot short-circuit)
  onFinalize?(req: NexusRequest): Promise<void>;
}
```

When an automation returns `'handled'`, the pipeline skips to `finalize()` with `status = 'handled_by_automation'`. This replaces the old `runAutomations()` stage — automations now run wherever they're needed, not at a single fixed point.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                      NEX                                          │
│                           (Nexus Event Exchange)                                  │
│                                                                                   │
│  ADAPTER MANAGER ──────────────────────────────────────────────────────────┐    │
│    │                                                                        │    │
│    │  eve (iMessage)        — external CLI process                         │    │
│    │  gog (Gmail)           — external CLI process                         │    │
│    │  discord-cli           — external CLI process                         │    │
│    │  telegram-bot          — external CLI process                         │    │
│    │  clock (timer/cron)    — external CLI process                         │    │
│    │  webhooks              — HTTP endpoint adapter                        │    │
│    │  aix (IDE sessions)    — external import worker process               │    │
│    │                                                                        │    │
│    │  Channel adapters normalize to NexusEvent and pipe via JSONL stdout   │    │
│    │  AIX import adapter emits session import batches/chunks to the        │    │
│    │  Session Import Service (not the event pipeline)                │    │
│    │  See: adapters/ADAPTER_SYSTEM.md, nex/workplans/SESSION_IMPORT_SERVICE.md       │    │
│    │                                                                        │    │
│    └────────────────────────────────────────────────────────────────────────┘    │
│                                      │                                            │
│                                      │ NexusEvent (JSONL from adapter process)   │
│                                      ▼                                            │
│  ┌────────────────────────────────────────────────────────────────────────────┐  │
│  │                            SYNC PIPELINE                                    │  │
│  │                                                                             │  │
│  │  ┌──────────────────────────────────────────────────────────────────────┐  │  │
│  │  │  UNIVERSAL STAGES (always run)                                       │  │  │
│  │  │                                                                       │  │  │
│  │  │  1. receiveEvent()                                                    │  │  │
│  │  │     • Create NexusRequest from NexusEvent                            │  │  │
│  │  │     • Populate: request_id, event, delivery                          │  │  │
│  │  │     • Async: Write event to Events Ledger                            │  │  │
│  │  │                  [hookpoint: afterReceiveEvent]                       │  │  │
│  │  │                                                                       │  │  │
│  │  │  2. resolvePrincipals()                                               │  │  │
│  │  │     • AuthN + sender/receiver principal resolution                    │  │  │
│  │  │     • Query Identity Graph (contacts → entities)                      │  │  │
│  │  │     • Populate: sender + receiver                                     │  │  │
│  │  │                  [hookpoint: afterResolvePrincipals]                  │  │  │
│  │  │                                                                       │  │  │
│  │  │  3. resolveAccess()                                                   │  │  │
│  │  │     • WHAT can they do?                                               │  │  │
│  │  │     • Evaluate ACL policies against sender + receiver + conditions    │  │  │
│  │  │     • Populate: access (decision, permissions, routing)              │  │  │
│  │  │     • Routing: agent_id, persona_ref, session_label, queue_mode      │  │  │
│  │  │     • If denied → skip to finalize (async: write denial to audit)    │  │  │
│  │  │                  [hookpoint: afterResolveAccess]                      │  │  │
│  │  └──────────────────────────────────────────────────────────────────────┘  │  │
│  │                                   │                                         │  │
│  │                    [routing decision: receiver.type]                        │  │
│  │                          ┌────────┼────────┐                                │  │
│  │                          ▼        │        ▼                                │  │
│  │  ┌──────────────────────────┐     │  ┌──────────────────────────────────┐  │  │
│  │  │  AGENT PATH              │     │  │  API / PROGRAMMATIC PATH         │  │  │
│  │  │  (receiver.type='agent') │     │  │  (system, webhook, direct API)   │  │  │
│  │  │                          │     │  │                                   │  │  │
│  │  │  4. assembleContext()    │     │  │  • Return result to caller       │  │  │
│  │  │     • Conversation       │     │  │  • No agent execution            │  │  │
│  │  │       history            │     │  │  • Automations may have already  │  │  │
│  │  │     • Memory context     │     │  │    handled via hookpoints        │  │  │
│  │  │     • Agent config       │     │  │                                   │  │  │
│  │  │     • Platform guidance  │     │  └──────────────────────────────────┘  │  │
│  │  │     • Create/resume      │     │                                         │  │
│  │  │       session + turn     │     │                                         │  │
│  │  │     [hookpoint:          │     │                                         │  │
│  │  │      afterAssemble]      │     │                                         │  │
│  │  │                          │     │                                         │  │
│  │  │  5. runAgent()           │     │                                         │  │
│  │  │     • Execute agent      │     │                                         │  │
│  │  │     • Streaming: tokens  │     │                                         │  │
│  │  │       flow to adapter    │     │                                         │  │
│  │  │     • Agent may call     │     │                                         │  │
│  │  │       deliverResponse()  │     │                                         │  │
│  │  │       as a tool (send    │     │                                         │  │
│  │  │       message)           │     │                                         │  │
│  │  │     [hookpoint:          │     │                                         │  │
│  │  │      afterRunAgent]      │     │                                         │  │
│  │  └──────────────────────────┘     │                                         │  │
│  │                          └────────┘                                         │  │
│  │                                   │                                         │  │
│  │  ┌──────────────────────────────────────────────────────────────────────┐  │  │
│  │  │  FINALIZE (always runs)                                               │  │  │
│  │  │                                                                       │  │  │
│  │  │  finalize()                                                           │  │  │
│  │  │     • Finalize NexusRequest with pipeline trace + timing              │  │  │
│  │  │     • Persist final status + audit metadata to Nexus Ledger           │  │  │
│  │  │     • Emit to Memory System for analysis (async)                      │  │  │
│  │  │                  [hookpoint: onFinalize]                               │  │  │
│  │  └──────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                             │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                   │
│  DATABASES (System of Record) ─────────────────────────────────────────────┐    │
│    │                                                                        │    │
│    │  events.db          ← Inbound events, outbound responses              │    │
│    │  agents.db          ← Turns, sessions, messages, tool calls           │    │
│    │  identity.db        ← Contacts, directory, entities, auth, ACL        │    │
│    │  memory.db          ← Facts, episodes, analysis (Memory System)       │    │
│    │  embeddings.db      ← Semantic vector index (sqlite-vec)              │    │
│    │  runtime.db         ← NexusRequest traces, adapters, automations, bus │    │
│    │                                                                        │    │
│    │  All databases stored in ~/nexus/state/data/ (SQLite)                 │    │
│    │                                                                        │    │
│    └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                   │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Access Patterns

**Principle:** NEX owns writes during request processing. Everything else accesses the database directly.

### Hybrid Approach

| Access Type | Route | Why |
|-------------|-------|-----|
| **NexusRequest lifecycle** | Through NEX | NEX orchestrates; writes are part of pipeline |
| **Reads/queries** | Direct | No reason to add latency |
| **Background jobs** | Direct | Independent work, not part of request |
| **Memory System** | Direct | TS memory pipeline reads from events.db/agents.db, writes to memory.db/identity.db/embeddings.db |

### What This Means Concretely

1. **Stages update NexusRequest, NEX coordinates** — stages return results, NEX maintains lifecycle
2. **Broker writes to Agents Ledger directly** — it's part of the NEX process, just a logical separation
3. **CLI reads directly** — no need to route queries through NEX
4. **Memory System reads/writes directly** — TS pipeline reads events.db + agents.db, writes memory.db + identity.db (entities) + embeddings.db

### Shared Database Library

```typescript
// src/db/ledgers.ts
import Database from 'better-sqlite3';

interface Ledgers {
  events: Database;      // Event Ledger
  agents: Database;      // Agents Ledger
  identity: Database;    // Identity (contacts, directory, entities, auth, ACL)
  memory: Database;      // Memory System (facts, episodes, analysis)
  embeddings: Database;  // Semantic vector index
  runtime: Database;     // Runtime Operations (requests, adapters, automations, bus)
}

// Raw SQL queries — no ORM
function writeEvent(db: Database, event: NexusEvent): void { /* ... */ }
function writeTurn(db: Database, turn: TurnRecord): void { /* ... */ }
function queryThreads(db: Database, sessionKey: string): Thread[] { /* ... */ }
function getSession(db: Database, sessionKey: string): Session | null { /* ... */ }
```

Both NEX and other components use the same library. NEX doesn't "own" the database — it owns the NexusRequest lifecycle.

---

## NexusRequest Lifecycle

The `NexusRequest` is created at `receiveEvent()` and populated through each stage:

| Stage | Fields Populated |
|-------|------------------|
| **Universal** | |
| `receiveEvent()` | `request_id`, `created_at`, `event`, `delivery` |
| `resolvePrincipals()` | `sender` (type, entity_id, display_name, is_user) and `receiver` (type, entity_id, agent_id, persona_ref, name, source) |
| `resolveAccess()` | `access` (decision, permissions, routing: agent_id, persona_ref, session_label, queue_mode) |
| **Agent Path** (conditional) | |
| `assembleContext()` | `agent` (turn_id, session_label, model, provider, token_budget, role, agent_id, persona_ref) |
| `runAgent()` | `response` (content, tool_calls, usage, stop_reason, compaction, subagents_spawned) |
| ↳ `deliverResponse()` | `delivery_result` (success, message_ids, chunks_sent, error) |
| **Always** | |
| `finalize()` | `pipeline` (stage timings trace), `status` (completed/failed/denied/handled_by_automation) |

`triggers` (automations_evaluated, automations_fired, enrichment, routing_override, handled) is populated by automation hookpoints whenever they fire — not by a dedicated stage.

See `NEXUS_REQUEST.md` for the complete typed schema.

---

## Sync vs Async

### Sync (Critical Path)

The universal stages run sequentially, then execution branches:

```
receiveEvent → resolvePrincipals → resolveAccess
    ├── [agent path] → assembleContext → runAgent (→ deliverResponse as tool)
    └── [api path]   → handle directly
    └── finalize (always)
```

Automation hookpoints fire at each stage boundary. If a hookpoint returns `'handled'`, the pipeline skips to `finalize()`.

### Async (Fire-and-Forget Writes)

After each sync stage, we dispatch an async write to persist current state:

```typescript
async function pipeline(event: NexusEvent): Promise<NexusRequest> {
  const req = createNexusRequest(event);
  asyncWrite(ledgers.events, req.event);     // Fire and forget

  // --- Universal stages ---
  await resolvePrincipals(req); // resolves sender + receiver
  asyncWrite(ledgers.nexus, req);            // Checkpoint

  await resolveAccess(req);

  if (req.access.decision === 'deny') {
    return finalize(req, 'denied');           // finalize always runs
  }

  // Automation hookpoints may have set req.triggers.handled at any boundary
  if (req.triggers?.handled) {
    return finalize(req, 'handled_by_automation');
  }

  // --- Routing decision ---
  if (req.receiver.type === 'agent') {
    // Agent path
    await assembleContext(req);
    await runAgent(req);                      // agent calls deliverResponse as tool
  }
  // API/programmatic path: no agent execution, result returned to caller

  return finalize(req, 'completed');          // finalize always runs
}
```

Benefits:
- Critical path is fast (doesn't wait for I/O)
- State is persisted at each step (crash recovery)
- Writes can be batched/coalesced

---

## Streaming

Agent streaming (token-by-token output) is coordinated through the BrokerStreamHandle. NEX sets up the delivery context and the Broker manages the stream lifecycle.

```
Agent generates tokens
    ↓
Broker emits StreamEvents (stream_start, token, tool_status, reasoning, stream_end)
    ↓
NEX routes StreamEvents based on adapter capability:
    ├── Native streaming adapter → forward via adapter's `stream` command (bidirectional JSONL)
    └── Non-streaming adapter → Block Pipeline coalesces tokens into chunks → `send` command
    ↓
On completion, full response written to Agents Ledger
Outbound event written to Events Ledger
```

See `../delivery/STREAMING.md` for the canonical streaming architecture spec.

---

## Parallelization

### Within Stages

**Automation Evaluation (parallel):**
```typescript
const results = await Promise.all(
  matchingAutomations.map(a => a.evaluate(req))
);
```

**Context Assembly (parallel):**
```typescript
const [history, memoryContext, agentConfig] = await Promise.all([
  getConversationHistory(req.access.routing.session_label),  // session label from routing
  memory.queryRelevantContext(req.event.content),
  loadAgentConfig(req.access.routing.persona_ref),
]);
```

### Across Stages

The main pipeline is sequential (each stage depends on previous).

Background work can run in parallel:
- Async writes to ledgers
- Emit to Memory System for analysis
- Bus event notifications

---

## Adapters

Adapters are **external CLI executables** managed by the Adapter Manager. They are NOT in-process objects.

### Adapter Protocol

Adapters implement a CLI protocol with standard commands:

| Command | Purpose |
|---------|---------|
| `adapter info` | Report capabilities and channel metadata |
| `adapter monitor` | Watch for events, emit JSONL to stdout |
| `adapter send` | Deliver a message to a target |
| `adapter stream` | Bidirectional JSONL for native streaming |
| `adapter health` | Health check |
| `adapter backfill` | Historical event import |

### How NEX Receives Events

```
┌─────────────┐    JSONL stdout     ┌────────────────┐    NexusEvent    ┌───────────┐
│ eve monitor │  ─────────────────► │ Adapter Manager │ ──────────────► │ NEX       │
│  (process)  │                     │  (in NEX proc)  │                 │ Pipeline  │
└─────────────┘                     └────────────────┘                  └───────────┘
```

The Adapter Manager:
- Spawns adapter processes as children
- Reads JSONL from their stdout (monitor mode)
- Routes `NexusEvent` objects into the pipeline
- Handles health monitoring, auto-restart, crash recovery

See `../delivery/ADAPTER_SYSTEM.md` for the complete adapter specification.

---

## Plugin System

Plugins and automations share the same hookpoint infrastructure. Plugins are developer-provided extensions; automations are user-configured rules. Both attach to the same stage boundaries.

```typescript
interface NEXPlugin {
  name: string;
  priority?: number;  // Lower runs first (default: 100)

  // Before-stage hooks (can short-circuit)
  beforeResolvePrincipals?(req: NexusRequest): Promise<void | 'skip' | 'handled'>;
  beforeResolveAccess?(req: NexusRequest): Promise<void | 'skip' | 'handled'>;
  beforeAssembleContext?(req: NexusRequest): Promise<void | 'skip' | 'handled'>;

  // After-stage hooks (can observe, enrich, or short-circuit)
  afterReceiveEvent?(req: NexusRequest): Promise<void | 'skip' | 'handled'>;
  afterResolvePrincipals?(req: NexusRequest): Promise<void | 'skip' | 'handled'>;
  afterResolveAccess?(req: NexusRequest): Promise<void | 'skip' | 'handled'>;
  afterAssembleContext?(req: NexusRequest): Promise<void | 'skip' | 'handled'>;
  afterRunAgent?(req: NexusRequest): Promise<void | 'skip' | 'handled'>;

  // Finalize + error hooks (observe only)
  onFinalize?(req: NexusRequest): Promise<void>;
  onError?(req: NexusRequest, error: Error): Promise<void>;
}
```

Returning `'handled'` from any hookpoint skips remaining stages and jumps to `finalize()`. This is how automations short-circuit the pipeline — they're hookpoints, not a dedicated stage.

See `PLUGINS.md` for the full plugin specification.

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
  req.status = 'failed';
  req.pipeline.error = serializeError(error);
  await writeFinalTrace(ledgers.nexus, req);
  await Promise.all(plugins.map(p => p.onError?.(req, error)));
}
```

### Async Write Errors

Fire-and-forget writes log errors but don't fail the pipeline:

```typescript
function asyncWrite(db: Database, query: string, params: any[]) {
  db.exec(query, params).catch(err => {
    logger.error('[NEX] Async write failed', { error: err.message });
  });
}
```

---

## Configuration

```jsonc
// state/config.json
{
  "pipeline": {
    "timeout_ms": 300000        // 5 min max per request
  },
  "data": {
    "directory": "./data"       // SQLite databases stored here
    // Creates: events.db, agents.db, identity.db, memory.db, embeddings.db, runtime.db
  },
  "adapters": [
    { "name": "eve", "enabled": true },
    { "name": "gog", "enabled": true },
    { "name": "clock", "enabled": true, "config": { "heartbeat_interval_ms": 60000 } },
    { "name": "webhook", "enabled": true, "config": { "port": 8080, "path": "/webhooks" } }
  ],
  "plugins": {
    "directory": "./plugins",
    "enabled": ["logging", "analytics"]
  },
  "http": {
    "host": "127.0.0.1",
    "port": 18789              // Control surface (SPA + WS + health)
  }
}
```

---

## Location in Codebase

```
src/
├── nex/                        # NEX package
│   ├── nex.ts                  # Main orchestrator
│   ├── pipeline.ts             # Pipeline execution
│   ├── request.ts              # NexusRequest type and helpers
│   ├── daemon.ts               # Process lifecycle (PID, signals, startup)
│   ├── config.ts               # config.json schema (Zod)
│   ├── plugins/                # Plugin system
│   │   ├── loader.ts
│   │   ├── types.ts
│   │   └── builtin/            # Built-in plugins
│   ├── stages/                 # Pipeline stages
│   │   ├── receiveEvent.ts       # Universal
│   │   ├── resolveIdentity.ts    # Universal
│   │   ├── resolveReceiver.ts    # Universal
│   │   ├── resolveAccess.ts      # Universal
│   │   ├── assembleContext.ts    # Agent path
│   │   ├── runAgent.ts           # Agent path
│   │   ├── deliverResponse.ts   # Agent tool (send_message routing)
│   │   └── finalize.ts          # Always runs
│   ├── adapters/               # Adapter Manager
│   │   ├── manager.ts          # Spawn/supervise adapter processes
│   │   ├── protocol.ts         # JSONL protocol handling
│   │   └── types.ts            # NexusEvent, DeliveryResult
│   ├── bus/                    # Event Bus
│   │   ├── bus.ts              # Pub/sub API
│   │   ├── events.ts           # Event type definitions (Zod)
│   │   └── sse.ts              # SSE streaming endpoint
│   └── db/                     # Ledger access
│       ├── ledgers.ts          # Database connections
│       ├── events.ts           # Events Ledger queries
│       ├── agents.ts           # Agents Ledger queries
│       ├── identity.ts         # Identity queries (contacts, entities, auth, ACL)
│       ├── memory.ts           # Memory System queries (facts, episodes)
│       ├── embeddings.ts       # Embedding queries (vector search)
│       └── runtime.ts          # Runtime Operations queries (requests, adapters)
```

---

## Resolved Design Questions

### Timer/Clock Events
Clock events (heartbeat, cron, scheduled) come from the `clock` adapter — an external process like any other adapter. It emits timer events as `NexusEvent` objects that flow through the full pipeline. See the clock adapter spec for details.

### Agent-to-Agent
When a Manager Agent (MA) spawns a Worker Agent (WA), the WA runs through the Broker's session system but bypasses the universal NEX pipeline stages (identity, receiver, access). The Broker still logs to the Agents Ledger. May revisit if inter-agent ACL is needed.

### Multi-Response
The agent uses the `send message` tool, which routes through NEX to the appropriate out-adapter via its `send` command. The adapter handles chunking based on channel capabilities. Multiple tool calls = multiple messages.

### Language Decision
NEX core is **TypeScript** (Bun runtime). The Memory System is TypeScript — there is no separate Go process. See `../architecture/LANGUAGE_DECISION.md`.

---

## Related Specs

- `NEXUS_REQUEST.md` — The data bus schema (canonical NexusRequest definition)
- `DAEMON.md` — Process lifecycle, signals, startup sequence
- `PLUGINS.md` — NEX plugin system
- `BUS_ARCHITECTURE.md` — Real-time event bus
- `../_archive/AUTOMATION_SYSTEM.md` — Historical automation system spec
- `../delivery/STREAMING.md` — Canonical streaming architecture
- `../delivery/ADAPTER_SYSTEM.md` — Adapter system (canonical)
- `../iam/ACCESS_CONTROL_SYSTEM.md` — IAM specifications
- `../agents/` — Agent engine and session specifications
