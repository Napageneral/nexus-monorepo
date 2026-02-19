# NEX — Nexus Event Exchange

**Status:** DESIGN SPEC
**Last Updated:** 2026-02-18
**Database layout:** See `../../data/DATABASE_ARCHITECTURE.md` for canonical database inventory (6 databases)

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
5. **Modular** — Each stage (IAM, Automations, Broker, etc.) is a replaceable component
6. **Observable** — Full trace of every request persisted to Nexus Ledger
7. **Direct reads, orchestrated writes** — Reads go direct; request lifecycle writes go through NEX
8. **Adapters are external** — Adapters are CLI executables managed by the Adapter Manager, not in-process objects

---

## In-Process Architecture

NEX is a single TypeScript process. All stages are **functions**, not separate services. There are no network hops between stages.

```
NEX Process (TypeScript)
├── receiveEvent()       // 1. Normalize NexusEvent, create NexusRequest
├── resolveIdentity()    // 2. WHO sent this? Query Identity Graph
├── resolveAccess()      // 3. WHAT can they do? Policies → permissions, session routing
├── runAutomations()     // 4. Match automations, execute hooks, may enrich or handle
├── assembleContext()    // 5. Build AssembledContext (history, memory, config, formatting)
├── runAgent()           // 6. Execute agent with assembled context (pi-coding-agent)
├── deliverResponse()    // 7. Format, chunk, send via out-adapter
└── finalize()           // 8. Write trace to Nexus Ledger, emit outbound event

All function calls. No network hops.
```

### Stage Responsibilities

| Stage | Input | Output on NexusRequest | May Exit Pipeline? |
|-------|-------|------------------------|-------------------|
| `receiveEvent()` | NexusEvent from adapter | `event`, `delivery` populated | No |
| `resolveIdentity()` | NexusRequest | `principal` populated | Yes (unknown sender policy) |
| `resolveAccess()` | NexusRequest | `access` populated (decision, permissions, routing) | Yes (access denied) |
| `runAutomations()` | NexusRequest | `triggers` populated (automations fired, enrichment) | Yes (automation handles completely) |
| `assembleContext()` | NexusRequest | `agent` populated (turn_id, model, token_budget); builds `AssembledContext` internally | No |
| `runAgent()` | AssembledContext (from stage 5) | `response` populated (content, tool_calls, usage) | No |
| `deliverResponse()` | NexusRequest | `delivery_result` populated | No |
| `finalize()` | NexusRequest | `pipeline` trace complete, `status` set | No |

See `NEXUS_REQUEST.md` for the full typed schema per stage.

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
│    │  Session Import Service (not the receiveEvent pipeline)               │    │
│    │  See: adapters/ADAPTER_SYSTEM.md, nex/SESSION_IMPORT_SERVICE.md       │    │
│    │                                                                        │    │
│    └────────────────────────────────────────────────────────────────────────┘    │
│                                      │                                            │
│                                      │ NexusEvent (JSONL from adapter process)   │
│                                      ▼                                            │
│  ┌────────────────────────────────────────────────────────────────────────────┐  │
│  │                          SYNC PIPELINE (8 stages)                          │  │
│  │                                                                             │  │
│  │  ┌──────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ 1. receiveEvent()                                                     │  │  │
│  │  │    • Create NexusRequest from NexusEvent                             │  │  │
│  │  │    • Populate: request_id, event, delivery                           │  │  │
│  │  │    • Async: Write event to Events Ledger                             │  │  │
│  │  └──────────────────────────────────────────────────────────────────────┘  │  │
│  │                                   │                                         │  │
│  │                        [plugin: afterReceiveEvent]                         │  │
│  │                                   │                                         │  │
│  │  ┌──────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ 2. resolveIdentity()                                                  │  │  │
│  │  │    • WHO sent this?                                                   │  │  │
│  │  │    • Query Identity Graph (contacts → mappings → entities)           │  │  │
│  │  │    • Populate: principal (type, entity_id, identity details)         │  │  │
│  │  │    • If unknown → may exit based on deny policy                      │  │  │
│  │  └──────────────────────────────────────────────────────────────────────┘  │  │
│  │                                   │                                         │  │
│  │                       [plugin: afterResolveIdentity]                       │  │
│  │                                   │                                         │  │
│  │  ┌──────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ 3. resolveAccess()                                                    │  │  │
│  │  │    • WHAT can they do?                                                │  │  │
│  │  │    • Evaluate ACL policies against principal + conditions             │  │  │
│  │  │    • Populate: access (decision, permissions, routing)               │  │  │
│  │  │    • Routing includes: persona, session_label, queue_mode            │  │  │
│  │  │    • If denied → exit pipeline (async: write denial to audit)        │  │  │
│  │  └──────────────────────────────────────────────────────────────────────┘  │  │
│  │                                   │                                         │  │
│  │                        [plugin: afterResolveAccess]                        │  │
│  │                                   │                                         │  │
│  │  ┌──────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ 4. runAutomations()                                                   │  │  │
│  │  │    • Match automations against event + principal + access            │  │  │
│  │  │    • Execute matched automations (parallel where independent)        │  │  │
│  │  │    • Populate: triggers (automations_fired, enrichment, overrides)   │  │  │
│  │  │    • If automation handles completely → exit pipeline                 │  │  │
│  │  └──────────────────────────────────────────────────────────────────────┘  │  │
│  │                                   │                                         │  │
│  │                       [plugin: afterRunAutomations]                        │  │
│  │                                   │                                         │  │
│  │  ┌──────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ 5. assembleContext()                                                   │  │  │
│  │  │    • Gather context for finalized session (parallel fetches):         │  │  │
│  │  │      - Conversation history from Agents Ledger                        │  │  │
│  │  │      - Relevant context from Memory System (memory.db, embeddings.db) │  │  │
│  │  │      - Agent config (persona, model, tools)                           │  │  │
│  │  │      - Platform formatting guidance                                    │  │  │
│  │  │    • Create/resume session, create turn in Agents Ledger             │  │  │
│  │  │    • Build AssembledContext (internal to Broker, NOT on NexusRequest) │  │  │
│  │  │    • Populate: agent (turn_id, session_label, model, token_budget)   │  │  │
│  │  └──────────────────────────────────────────────────────────────────────┘  │  │
│  │                                   │                                         │  │
│  │                       [plugin: afterAssembleContext]                        │  │
│  │                                   │                                         │  │
│  │  ┌──────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ 6. runAgent()                                                          │  │  │
│  │  │    • Execute pi-coding-agent with AssembledContext                     │  │  │
│  │  │    • Streaming: tokens flow to adapter via BrokerStreamHandle         │  │  │
│  │  │    • Populate: response (content, tool_calls, usage, stop_reason)    │  │  │
│  │  │    • Writes completion to Agents Ledger                               │  │  │
│  │  └──────────────────────────────────────────────────────────────────────┘  │  │
│  │                                   │                                         │  │
│  │                          [plugin: afterRunAgent]                            │  │
│  │                                   │                                         │  │
│  │  ┌──────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ 7. deliverResponse()                                                   │  │  │
│  │  │    • Format response for target platform                              │  │  │
│  │  │    • Chunk if necessary (respects platform text limits)              │  │  │
│  │  │    • Send via adapter's `send` command                                │  │  │
│  │  │    • Populate: delivery_result (message_ids, success)                │  │  │
│  │  │    • Note: may be no-op if native streaming already delivered         │  │  │
│  │  └──────────────────────────────────────────────────────────────────────┘  │  │
│  │                                   │                                         │  │
│  │                       [plugin: afterDeliverResponse]                       │  │
│  │                                   │                                         │  │
│  │  ┌──────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ 8. finalize()                                                          │  │  │
│  │  │    • Finalize NexusRequest with pipeline trace + timing               │  │  │
│  │  │    • Write full trace to Nexus Ledger                                 │  │  │
│  │  │    • Write outbound event to Events Ledger                            │  │  │
│  │  │    • Emit to Memory System for analysis (async)                        │  │  │
│  │  └──────────────────────────────────────────────────────────────────────┘  │  │
│  │                                   │                                         │  │
│  │                          [plugin: onFinalize]                               │  │
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
function queryThreads(db: Database, sessionLabel: string): Thread[] { /* ... */ }
function getSession(db: Database, label: string): Session | null { /* ... */ }
```

Both NEX and other components use the same library. NEX doesn't "own" the database — it owns the NexusRequest lifecycle.

---

## NexusRequest Lifecycle

The `NexusRequest` is created at `receiveEvent()` and populated through each stage:

| Stage | Fields Populated |
|-------|------------------|
| **receiveEvent()** | `request_id`, `created_at`, `event`, `delivery` |
| **resolveIdentity()** | `principal` (type, entity_id, display_name, is_user) |
| **resolveAccess()** | `access` (decision, permissions, routing: persona, session_label, queue_mode) |
| **runAutomations()** | `triggers` (automations_evaluated, automations_fired, enrichment, routing_override, handled) |
| **assembleContext()** | `agent` (turn_id, session_label, model, provider, token_budget, role, persona_id) |
| **runAgent()** | `response` (content, tool_calls, usage, stop_reason, compaction, subagents_spawned) |
| **deliverResponse()** | `delivery_result` (success, message_ids, chunks_sent, error) |
| **finalize()** | `pipeline` (stage timings trace), `status` (completed/failed/denied/handled_by_automation) |

See `NEXUS_REQUEST.md` for the complete typed schema.

---

## Sync vs Async

### Sync (Critical Path)

Each stage waits for the previous to complete:

```
receiveEvent → resolveIdentity → resolveAccess → runAutomations → assembleContext → runAgent → deliverResponse → finalize
```

All 8 stages are sync because each depends on the output of the previous.

### Async (Fire-and-Forget Writes)

After each sync stage, we dispatch an async write to persist current state:

```typescript
async function pipeline(event: NexusEvent): Promise<NexusRequest> {
  const req = createNexusRequest(event);
  asyncWrite(ledgers.events, req.event);     // Fire and forget
  
  await resolveIdentity(req);
  asyncWrite(ledgers.nexus, req);            // Checkpoint
  
  await resolveAccess(req);
  if (req.access.decision === 'deny') {
    return finalize(req, 'denied');
  }
  
  await runAutomations(req);
  if (req.triggers.handled) {
    return finalize(req, 'handled_by_automation');
  }
  
  // ... remaining stages
  return finalize(req, 'completed');
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

See `../STREAMING.md` for the canonical streaming architecture spec.

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
  getConversationHistory(req.access.routing.session_label),
  memory.queryRelevantContext(req.event.content),
  loadAgentConfig(req.access.routing.persona),
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

See `../adapters/ADAPTER_SYSTEM.md` for the complete adapter specification.

---

## Plugin System

Plugins attach to hook points throughout the pipeline. They can observe, modify, or short-circuit the request.

```typescript
interface NEXPlugin {
  name: string;
  priority?: number;  // Lower runs first (default: 100)
  
  // Lifecycle hooks (after each stage)
  afterReceiveEvent?(req: NexusRequest): Promise<void | 'skip'>;
  afterResolveIdentity?(req: NexusRequest): Promise<void | 'skip'>;
  afterResolveAccess?(req: NexusRequest): Promise<void | 'skip'>;
  afterRunAutomations?(req: NexusRequest): Promise<void | 'skip'>;
  afterAssembleContext?(req: NexusRequest): Promise<void | 'skip'>;
  afterRunAgent?(req: NexusRequest): Promise<void | 'skip'>;
  afterDeliverResponse?(req: NexusRequest): Promise<void | 'skip'>;
  
  onFinalize?(req: NexusRequest): Promise<void>;
  onError?(req: NexusRequest, error: Error): Promise<void>;
}
```

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

```yaml
# nex.yaml
pipeline:
  timeout_ms: 300000        # 5 min max per request

data:
  directory: ./data          # SQLite databases stored here
  # Creates: events.db, agents.db, identity.db, memory.db, embeddings.db, runtime.db

adapters:
  - name: eve
    enabled: true
  - name: gog
    enabled: true
  - name: clock
    enabled: true
    config:
      heartbeat_interval_ms: 60000
  - name: webhook
    enabled: true
    config:
      port: 8080
      path: /webhooks

plugins:
  directory: ./plugins
  enabled:
    - logging
    - analytics

http:
  host: 127.0.0.1
  port: 7400               # Health + SSE endpoint
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
│   ├── config.ts               # nex.yaml schema (Zod)
│   ├── plugins/                # Plugin system
│   │   ├── loader.ts
│   │   ├── types.ts
│   │   └── builtin/            # Built-in plugins
│   ├── stages/                 # Pipeline stages
│   │   ├── receiveEvent.ts
│   │   ├── resolveIdentity.ts
│   │   ├── resolveAccess.ts
│   │   ├── runAutomations.ts
│   │   ├── assembleContext.ts
│   │   ├── runAgent.ts
│   │   ├── deliverResponse.ts
│   │   └── finalize.ts
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
When a Manager Agent (MA) spawns a Worker Agent (WA), the WA runs through the Broker's session system but bypasses the external NEX pipeline stages (identity, access, automations). The Broker still logs to the Agents Ledger. May revisit if inter-agent ACL is needed.

### Multi-Response
The agent uses the `send message` tool, which routes through NEX to the appropriate out-adapter via its `send` command. The adapter handles chunking based on channel capabilities. Multiple tool calls = multiple messages.

### Language Decision
NEX core is **TypeScript** (Bun runtime). The Memory System (formerly Cortex) is ported to TypeScript — there is no separate Go process. See `../../project-structure/LANGUAGE_DECISION.md`.

---

## Related Specs

- `NEXUS_REQUEST.md` — The data bus schema (canonical NexusRequest definition)
- `DAEMON.md` — Process lifecycle, signals, startup sequence
- `PLUGINS.md` — NEX plugin system
- `BUS_ARCHITECTURE.md` — Real-time event bus
- `automations/AUTOMATION_SYSTEM.md` — Automation system
- `../STREAMING.md` — Canonical streaming architecture
- `../adapters/ADAPTER_SYSTEM.md` — Adapter system (canonical)
- `../iam/ACCESS_CONTROL_SYSTEM.md` — IAM specifications
- `../broker/` — Broker and agent specifications
