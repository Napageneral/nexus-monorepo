# Event System Design

**Status:** DESIGN COMPLETE  
**Last Updated:** 2026-01-29  
**Related:** ONTOLOGY.md, BROKER.md, SESSION_FORMAT.md

---

## Executive Summary

This document captures the key architectural decisions from our design session on the unified event system. The core insight: **Mnemonic becomes the universal event layer** that sits on top of the Agent Broker, providing event sourcing, normalization, storage, and hook evaluation for ALL events flowing through the system.

---

## 1. The Big Picture: Mnemonic as Event Layer

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          MNEMONIC EVENT LAYER                                 │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                        EVENT SOURCES (Adapters)                          │ │
│  │                                                                          │ │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐     │ │
│  │  │iMessage│ │ Gmail  │ │   Aix  │ │Provider│ │ Timers │ │Webhooks│     │ │
│  │  │Adapter │ │Adapter │ │Adapter │ │Adapter │ │Adapter │ │Adapter │     │ │
│  │  └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘     │ │
│  │      │          │          │          │          │          │           │ │
│  │      └──────────┴──────────┴──────────┴──────────┴──────────┘           │ │
│  │                               │                                          │ │
│  │                               ▼                                          │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │ │
│  │  │              UNIFIED EVENT STORAGE (events table)                │    │ │
│  │  │                                                                  │    │ │
│  │  │  id: "{adapter}:{source_id}"   ← Deterministic, unique          │    │ │
│  │  │  timestamp, channel, content_types, content, direction          │    │ │
│  │  │  thread_id, source_adapter, metadata_json                       │    │ │
│  │  │  + event_participants, event_state, event_tags                  │    │ │
│  │  └─────────────────────────────────────────────────────────────────┘    │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                          │
│                                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                         EVENT HOOKS                                      │ │
│  │                                                                          │ │
│  │  Every event triggers evaluation of ALL registered hooks in parallel    │ │
│  │  Hooks are scripts that can do anything: pattern match, LLM eval, etc   │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                            AGENT BROKER LAYER                                 │
│                                                                               │
│  • Context Assembly (thread history, mnemonic context, system prompt)        │
│  • Session Management (lookup, state tracking, history)                       │
│  • Queue Management (steer, followup, collect, debouncing)                   │
│  • Agent Execution                                                            │
│  • Response Handling                                                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Key Conceptual Clarifications

### What IS vs ISN'T a "Trigger"

We refined terminology throughout the discussion:

| Term | Definition | NOT This |
|------|------------|----------|
| **Event** | Any normalized message in Mnemonic (from any source) | Raw platform message |
| **Hook** | Script that evaluates events and may fire actions | A simple rule |
| **Adapter** | Ingests from a source, normalizes to Mnemonic events | The source itself |

### Everything is an Event

ALL of these become Mnemonic events:
- User DMs on Discord/Telegram/WhatsApp
- iMessages and SMS
- Emails from Gmail
- Agent-to-agent messages
- Timer/cron firings
- Webhook payloads
- File system changes
- AI chat sessions (from aix)

### The "Kahneman" Model

Like Thinking Fast and Slow:
- **System 1 (Fast):** Deterministic hooks that zip through with simple matching
- **System 2 (Slow):** Conditional hooks that invoke LLM evaluation

All events flow through the same pipeline. Some are handled fast (deterministic matching), some require deliberation (LLM analysis). Even "direct messages" go through hooks — they just have very simple hooks that always fire.

---

## 3. Response Adapters Mirror Event Adapters

Just as we have inbound adapters for event sourcing, we need outbound adapters for response delivery:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          RESPONSE FLOW                                       │
│                                                                              │
│  Agent Response                                                              │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    BASE RESPONSE HANDLING                            │    │
│  │                                                                      │    │
│  │  • Capture response from agent                                      │    │
│  │  • Determine delivery target (from hook routing)                    │    │
│  │  • Update session state (tokens, model, timestamps)                 │    │
│  │  • Store response as Mnemonic event (closes the loop!)              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    PLATFORM ADAPTERS (Outbound)                      │    │
│  │                                                                      │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │    │
│  │  │ Discord  │  │ Telegram │  │ WhatsApp │  │  Webhook │            │    │
│  │  │          │  │          │  │          │  │          │            │    │
│  │  │ • 2000   │  │ • 4000   │  │ • Baileys│  │ • HTTP   │            │    │
│  │  │   chars  │  │   chars  │  │   API    │  │   POST   │            │    │
│  │  │ • Embeds │  │ • Markdown│  │ • PTT    │  │ • JSON   │            │    │
│  │  │ • Threads│  │ • Buttons│  │ • Polls  │  │          │            │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key insight:** Responses also become Mnemonic events, enabling:
- Full audit trail of all activity
- Search/analysis of agent responses
- Hooks that match on agent responses (meta!)

---

## 4. Upstream Concepts → Nexus Mapping

### Routing Bindings → Hooks

Upstream's routing bindings:
```json
{
  "agentId": "work",
  "match": {
    "channel": "whatsapp",
    "accountId": "biz",
    "peer": { "kind": "dm", "id": "+15551234567" }
  }
}
```

**This IS a hook** — a simple deterministic one that says "when event matches this pattern, route to this agent."

### Heartbeat → Scheduled Hook

Upstream heartbeat config becomes a scheduled hook with no event matching — just fires on interval.

### Cron Jobs → Scheduled Hooks

Same pattern — scheduled hooks with optional event matching.

### Hook Mappings → Hooks

Already hook-shaped, just needs migration to the unified schema.

---

## 5. Upstream Rule Types Summary

From our investigation:

| Upstream Concept | Location | Match Priority | Nexus Equivalent |
|-----------------|----------|----------------|------------------|
| **Routing Bindings** | `nexus.json` → `routing.bindings` | peer → guild → team → account → channel → default | Deterministic Hook |
| **Heartbeat Config** | `nexus.json` → `agent.heartbeat` | Interval timer | Scheduled Hook |
| **Cron Jobs** | `~/.config/nexus/cron/jobs.json` | Time-based | Scheduled Hook |
| **Queue Mode** | Config + Session + Inline | inline > session > channel > global > default | Part of hook routing |
| **Send Policy** | Config + Session | session > rules > default | Access control |
| **Hook Mappings** | `nexus.json` → `hooks.mappings` | First match wins | Deterministic Hook |

---

## 6. Provider Adapters

### Inbound (Event Sourcing)

| Provider | Connection | Event Reception |
|----------|------------|-----------------|
| **Discord** | WebSocket (discord.js) | `MessageCreate` event |
| **Telegram** | Long poll or webhook (Grammy) | Bot framework handlers |
| **WhatsApp** | WebSocket (Baileys) | `messages.upsert` event |

### Outbound (Response Delivery)

| Provider | Delivery Method | Key Constraints |
|----------|-----------------|-----------------|
| **Discord** | REST API | 2000 char limit, embeds, threads |
| **Telegram** | Bot API | 4000 chars, markdown, media groups |
| **WhatsApp** | Baileys socket | PTT audio, polls, read receipts |

Each provider needs both an **inbound adapter** (for Mnemonic) and an **outbound adapter** (for responses).

---

## 7. Mnemonic Adapter Pattern

From our investigation of existing Mnemonic adapters:

```go
type Adapter interface {
    Name() string
    Sync(ctx context.Context, db *sql.DB, full bool) (SyncResult, error)
}
```

### Key Patterns

1. **Deterministic Event IDs:** `{adapter}:{source_id}` ensures uniqueness
2. **Watermarking:** `sync_watermarks` table tracks last sync position
3. **Backfill + Live:** Support both full re-sync and incremental live updates
4. **Upsert Pattern:** `INSERT OR IGNORE` then `UPDATE` if changed
5. **Transaction Batching:** Bulk operations in single transaction

### New Adapters Needed

| Adapter | Source | Event ID Format | Watermark |
|---------|--------|-----------------|-----------|
| `provider:discord` | Discord messages | `discord:{message_id}` | Message ID |
| `provider:telegram` | Telegram messages | `telegram:{message_id}` | Message ID |
| `provider:whatsapp` | WhatsApp messages | `whatsapp:{message_id}` | Message ID |
| `timer` | Scheduled events | `timer:{hook_id}:{timestamp}` | Timestamp |
| `webhook` | HTTP webhooks | `webhook:{request_id}` | Timestamp |
| `agent` | Agent-to-agent | `agent:{from}:{to}:{timestamp}` | Timestamp |

---

## 8. Hook System Architecture

### 8.1 Core Schema

```typescript
interface Hook {
  // Identity
  id: string;                      // UUID or slug
  name: string;                    // Human-readable name
  description?: string;            // What this hook does
  
  // The script
  script: string;                  // TypeScript code (the entire hook logic)
  
  // Lifecycle
  enabled: boolean;
  mode: 'persistent' | 'one-shot'; // One-shot auto-disables after firing
  
  // Ownership
  created_by?: string;             // Agent ID that created it
  created_at: number;              // Unix timestamp
  updated_at: number;
  
  // Runtime state (managed by system, not agent)
  trigger_count: number;
  last_triggered?: number;
  last_error?: string;
  status: 'active' | 'paused' | 'disabled' | 'errored';
}
```

### 8.2 Hook Context (What Scripts Receive)

Following the **Bitter Truth** principle: minimal abstractions, maximum power.

```typescript
interface HookContext {
  // The event being evaluated
  event: MnemonicEvent;
  
  // Direct database path — use any SQLite client (better-sqlite3, etc.)
  dbPath: string;
  
  // Semantic search (embeds query internally, returns event IDs + scores)
  search(query: string, options?: {
    channels?: string[];
    since?: number;
    until?: number;
    limit?: number;
  }): Promise<{ eventId: string; score: number }[]>;
  
  // LLM call — always gemini-3-flash-preview, no model choice
  llm(prompt: string, options?: {
    system?: string;
    json?: boolean;
    max_tokens?: number;
  }): Promise<string>;
  
  // Timing
  now: Date;
  
  // This hook's metadata (for self-referential logic)
  hook: {
    id: string;
    name: string;
    created_at: number;
    trigger_count: number;
    last_triggered?: number;
  };
}
```

**Design rationale:**
- `dbPath` — Agents use SQLite directly. No wrapper. Full power.
- `search()` — Semantic search handles embedding internally. Returns IDs, agents fetch details via SQL.
- `llm()` — One model (`gemini-3-flash-preview`), no choice. Prevents model selection mistakes.

The skill doc provides schema reference and example patterns, not API abstractions.

### 8.3 Hook Result (What Scripts Return)

```typescript
interface HookResult {
  // Core decision
  fire: boolean;
  
  // Optional: routing instructions (defaults to persona routing)
  routing?: {
    mode: 'persona' | 'session' | 'thread';
    target?: string;           // Session key or thread ID
    agent_id?: string;         // Specific agent to invoke
    queue_mode?: string;       // steer, followup, collect, etc.
  };
  
  // Optional: context for the agent
  context?: {
    prompt?: string;           // Custom instruction
    extracted?: Record<string, any>;  // Data extracted from event
    include_thread?: boolean;  // Pull in thread history
  };
  
  // Lifecycle control
  disable_hook?: boolean;      // Self-disable after this run (for one-shots)
}
```

### 8.4 Hook Invocation Tracking

Every hook execution is logged for observability:

```typescript
interface HookInvocation {
  id: string;                  // UUID
  hook_id: string;             // FK to Hook
  event_id: string;            // FK to Mnemonic event
  
  // Timing
  started_at: number;          // Unix ms
  finished_at: number;         // Unix ms
  latency_ms: number;          // Computed
  
  // Outcome
  fired: boolean;              // Did the hook return fire: true?
  result?: HookResult;         // Full result (if fired)
  
  // Resource usage
  llm_calls: number;           // How many LLM calls made
  llm_tokens_in: number;       // Total input tokens
  llm_tokens_out: number;      // Total output tokens
  llm_cost_usd?: number;       // Estimated cost
  search_calls: number;        // How many semantic searches
  
  // Error tracking
  error?: string;              // Error message if failed
  stack_trace?: string;        // For debugging
}
```

### 8.5 Circuit Breaker & Health

The system monitors hook health and can auto-disable failing hooks:

```typescript
interface HookHealth {
  hook_id: string;
  
  // Rolling window stats (last 100 invocations)
  invocation_count: number;
  success_count: number;
  error_count: number;
  fire_count: number;
  
  // Performance
  avg_latency_ms: number;
  p95_latency_ms: number;
  p99_latency_ms: number;
  
  // Cost
  total_cost_usd: number;
  avg_cost_per_invocation: number;
  
  // Circuit breaker
  consecutive_errors: number;
  circuit_state: 'closed' | 'open' | 'half-open';
  last_error_at?: number;
}
```

**Circuit breaker rules:**
- 5 consecutive errors → circuit opens (hook paused)
- After 5 minutes → half-open (try one invocation)
- Success in half-open → circuit closes
- Failure in half-open → circuit stays open, reset timer

### 8.6 LLM Configuration

Hooks use a single LLM model with no choice: **`gemini-3-flash-preview`**

```typescript
// In hook scripts:
const response = await llm("Is this a 2FA request? Answer yes or no.");

// With options:
const response = await llm("Extract the service name. Return JSON.", { 
  json: true 
});
```

**Why no model choice?**
- Agents always pick the worst model when given options
- Gemini 3 Flash is fast, capable, and cost-effective
- Removes a decision point that adds no value
- If we need to change the default, we change it system-wide

---

## 9. Agent Experience (AX) for Hooks

### 9.1 File-Based Hook Creation

Agents create hooks by writing files to the hooks directory:

```
~/nexus/state/hooks/
├── casey-safety-check.ts      # One-shot scheduled hook
├── mom-2fa-helper.ts          # Persistent event hook
├── heartbeat-default.ts       # System hook
├── work-whatsapp-routing.ts   # Deterministic routing
└── stripe-high-value.ts       # Webhook filter
```

**Why files?**
- Agents are great at writing code to files
- Easy to read, edit, version, debug
- Can be organized in subdirectories
- Natural Git integration

### 9.2 System Sync Process

The hook system watches the directory and syncs to DB:

```
File System                          Database
─────────────                        ────────
hooks/foo.ts  ──────────────────►  hooks table (metadata)
                                   hook_invocations table (logs)
                                   hook_health table (stats)
```

**Sync behavior:**
1. New file → Create hook record, status: `active`
2. File modified → Update `updated_at`, re-parse script
3. File deleted → Set status: `disabled` (soft delete, preserve history)
4. Parse error → Set status: `errored`, log error

### 9.3 Hook File Format

```typescript
// ~/nexus/state/hooks/my-hook.ts

/**
 * @name My Custom Hook
 * @description Does something cool when X happens
 * @mode persistent   // or 'one-shot'
 */

export default async function(ctx: HookContext): Promise<HookResult> {
  const { event, mnemonic, llm, now, hook } = ctx;
  
  // Your logic here
  
  return { fire: false };
}
```

Metadata in JSDoc comments is parsed and stored in DB.

### 9.4 Agent Tools for Hooks

Simple tool interface for agents:

```typescript
// Create a hook (writes file + registers)
{
  name: "create_hook",
  parameters: {
    name: string,        // Becomes filename: {name}.ts
    description: string, // JSDoc @description
    mode: "persistent" | "one-shot",
    script: string       // The function body
  }
}

// List hooks with health stats
{
  name: "list_hooks",
  parameters: {
    status?: string,     // Filter: active, paused, errored
    created_by?: string  // Filter by creator agent
  }
}

// Get hook details including recent invocations
{
  name: "get_hook",
  parameters: {
    name: string
  }
}

// Disable a hook
{
  name: "disable_hook",
  parameters: {
    name: string,
    reason?: string
  }
}

// Delete a hook (removes file)
{
  name: "delete_hook",
  parameters: {
    name: string
  }
}
```

### 9.5 One-Shot Hooks (Self-Disabling)

For hooks like "Casey safety check" that should fire once then stop:

```typescript
/**
 * @mode one-shot
 */
export default async function(ctx: HookContext): Promise<HookResult> {
  // ... evaluation logic ...
  
  if (shouldFire) {
    return {
      fire: true,
      routing: { agent_id: 'phone-caller' },
      context: { prompt: 'Call Tyler!' },
      disable_hook: true  // <-- Self-disable after firing
    };
  }
  
  // Check if we've passed our deadline without firing
  const deadline = new Date("2026-01-28T03:00:00-06:00");
  if (ctx.now > deadline) {
    // Past deadline and didn't need to fire — clean up
    return { fire: false, disable_hook: true };
  }
  
  return { fire: false };
}
```

**System behavior for one-shot:**
- When `disable_hook: true` returned, system sets `status: 'disabled'`
- Hook file remains (for history/debugging) but won't evaluate
- Can be re-enabled manually if needed

---

## 10. Hook Evaluation Pipeline

### Design Principles

1. **Fire all by default** — Multiple hooks can match, all fire
2. **Debouncing at queue level** — Keep upstream's queue-based debouncing in broker
3. **Ordering by timestamp** — Events processed in order, hooks evaluated in parallel
4. **Performance:** Deterministic hooks are O(n), conditional hooks run in parallel

### Flow

```
Event arrives in Mnemonic
        │
        ▼
Store in events table
        │
        ▼
Load ALL enabled hooks
        │
        ▼
Execute ALL hook scripts in PARALLEL
        │
        ├─ Hook 1: script(ctx) → HookResult
        ├─ Hook 2: script(ctx) → HookResult
        └─ Hook N: script(ctx) → HookResult
        │
        ├─ Record invocation metrics for each
        │
        ▼
Collect results where fire === true
        │
        ▼
For each fired result:
  → Apply circuit breaker check
  → Extract routing target
  → Dispatch to Agent Broker
```

---

## 11. Future: Hook Locations

Currently hooks evaluate on **new events** (post-ingestion). Future hook locations:

| Location | When | Use Case |
|----------|------|----------|
| **event** | After event stored | Current design - triggers, routing, reactions |
| **pre-agent** | Before agent invocation | Context enrichment, guardrails |
| **post-agent** | After agent response | Response validation, logging |
| **pre-response** | Before sending to channel | Final formatting, filters |

We don't need this complexity yet. Start with `event` hooks only, add locations when needed.

---

## 12. Architecture Parallel: Ad Exchange

This architecture mirrors real-time ad exchange systems:

| Ad Exchange | Nexus Event System |
|-------------|-------------------|
| Bid requests from publishers | Events from adapters |
| Request normalization | Mnemonic event normalization |
| Campaign targeting rules | Hooks (scripts) |
| Ad candidate retrieval | Context assembly |
| Real-time bidding (RTB) | Agent invocation |
| Ad serving + tracking | Response delivery + Mnemonic storage |
| Frequency capping | Queue debouncing |
| Budget pacing | Circuit breakers |

The pattern is generic: high-volume event ingestion → normalization → arbitrary rule evaluation → intelligence layer → response routing.

---

## 13. Gateway Decomposition

The upstream gateway is doing too much. We need to factor it into:

### Should Stay "Gateway" (External Interface Layer)
- HTTP server (API endpoints)
- WebSocket server (real-time connections)
- Provider management (starting/stopping platform connections)
- Webhook HTTP endpoints

### Should Move to Mnemonic Event Layer
- Event ingestion and normalization
- Hook storage and evaluation

### Should Move to Agent Broker
- Session key construction
- Agent resolution
- Queue management (modes, debouncing, per-session queues)
- Session state management
- Message delivery coordination

---

## 14. Agent Broker Layer (Brief)

The Agent Broker is the execution layer below Mnemonic. Key components:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            AGENT BROKER LAYER                                 │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                     CONTEXT ASSEMBLY (Plugin)                           │ │
│  │                                                                          │ │
│  │  • Thread history retrieval                                             │ │
│  │  • Mnemonic context injection                                           │ │
│  │  • System prompt construction                                           │ │
│  │  • Tool availability                                                    │ │
│  │                                                                          │ │
│  │  (Modular - many pieces here too, see separate spec)                   │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                     SESSION MANAGEMENT                                   │ │
│  │                                                                          │ │
│  │  • Session key construction (channel:peer:account)                      │ │
│  │  • Session state (tokens, model, timestamps)                            │ │
│  │  • History storage (JSONL format)                                       │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                     QUEUE MANAGEMENT                                     │ │
│  │                                                                          │ │
│  │  • Queue modes (steer, followup, collect, interrupt)                   │ │
│  │  • Debouncing (per-session)                                            │ │
│  │  • Agent execution coordination                                         │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                     RESPONSE HANDLING                                    │ │
│  │                                                                          │ │
│  │  • Capture agent response                                               │ │
│  │  • Store as Mnemonic event                                              │ │
│  │  • Route to outbound adapter                                            │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

Context Assembly is its own complex subsystem (another agent is working on this spec). It will be plugin-like with modular context sources.

---

## 15. OpenPoke Trigger Reference

OpenPoke has a clean trigger system worth referencing:

```python
class TriggerRecord:
    id: int
    agent_name: str
    payload: str                    # Instruction text to execute
    start_time: Optional[str]       # ISO 8601 timestamp
    next_trigger: Optional[str]     # Next firing time
    recurrence_rule: Optional[str]  # iCalendar RRULE
    timezone: Optional[str]
    status: str                     # "active", "paused", "completed"
    last_error: Optional[str]
    created_at: str
    updated_at: str
```

Key features:
- iCalendar RRULE for recurrence
- Simple scheduler (10s polling)
- Tool interface for agents (createTrigger, updateTrigger, listTriggers)
- Agent-scoped triggers

---

## 16. Decisions Made

### Core Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Hook schema | Scripts (TypeScript) | Maximum flexibility, agents write code |
| Hook storage | Files (hooks/*.ts) + DB sync | Easy to edit, version, debug |
| Runtime | **Bun** | Fast startup (~2ms), native TS |
| LLM model | **gemini-3-flash-preview** (no choice) | Prevents bad model selection |
| Mnemonic API | **dbPath + search()** | SQL is primary interface, search handles embeddings |
| Self-disabling | `disable_hook: true` in HookResult | One-shot hooks clean up after themselves |
| Evaluation | ALL hooks in parallel | Fire all matches, no mutual exclusion |
| Scheduled hooks | Timer tick events (1/minute) | Guarantees evaluation even in quiet periods |

### Bitter Truth Alignment

Following the principle: "Every abstraction is a liability."

| What we provide | What we don't provide |
|-----------------|----------------------|
| `dbPath` — direct SQLite access | Query builder methods |
| `search()` — semantic search | Separate `embed()` API |
| `llm()` — single model, one function | Model selection, structured extract/classify helpers |
| Schema docs + examples | API abstractions |

### Deferred

| Item | Status | Notes |
|------|--------|-------|
| Context Assembly | DEFER | Another agent working on this; will be broker plugin |
| Session Format | DEFER | Depends on SESSION_FORMAT.md completion |
| Hook Locations | DEFER | Start with `event` only, add pre/post-agent later |
| Hook Permissions | DEFER | Start permissive, add scoping if needed |

---

## 17. Key Terminology

| Term | Definition |
|------|------------|
| **Event** | Normalized message in Mnemonic (from any source) |
| **Hook** | Script that evaluates events and may fire actions |
| **Adapter (Inbound)** | Ingests from source, normalizes to Mnemonic events |
| **Adapter (Outbound)** | Formats and delivers responses to platforms |
| **Event Handler** | Deprecated term — use "Hook" instead |
| **Trigger** | Deprecated term — use "Hook" instead |
| **Routing Binding** | Upstream term — becomes a deterministic Hook |

---

## 18. Hook Examples

See `./hook-examples/` folder for complete examples:

| File | Pattern |
|------|---------|
| `default-dm-routing.ts` | Catch-all passthrough (simplest) |
| `work-whatsapp-routing.ts` | Pure deterministic routing |
| `heartbeat.ts` | Interval-based scheduled |
| `stripe-high-value.ts` | Webhook event filtering |
| `mom-2fa-helper.ts` | Persistent + LLM classification |
| `casey-safety-check.ts` | One-shot scheduled + LLM analysis |
| `flight-checkin.ts` | Hybrid deterministic + LLM |

Complexity ranges from simple deterministic (top) to sophisticated hybrid (bottom).

---

## 19. References

- **Mnemonic:** `~/nexus/home/projects/cortex/` — Unified event schema and adapters (project being renamed from "cortex" to "mnemonic")
- **OpenPoke:** `~/nexus/home/projects/openpoke-ref/` — Clean trigger implementation
- **Magic-Toolbox:** `~/nexus/home/projects/magic-toolbox/agentkit/triggers/` — Another trigger reference
- **Upstream Clawdbot:** `~/nexus/home/projects/nexus/worktrees/bulk-sync-ref/` — Gateway, routing, providers
- **Hook Examples:** `./hook-examples/` — This spec's example hooks

---

*This document captures the architectural decisions from our design session. See the other agent-system specs for implementation details.*
