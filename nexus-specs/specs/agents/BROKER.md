# Agent Broker

**Status:** DESIGN
**Last Updated:** 2026-03-02
**Related:** DATA_MODEL.md, CONTEXT_ASSEMBLY.md, SESSION_LIFECYCLE.md

---

## Overview

The Agent Broker is the agent execution subsystem. It is responsible for:

1. **Routing** — Resolving where messages go (sessions, threads, personas)
2. **Context Assembly** — Building the full context for agent execution
3. **Queue Management** — Handling message delivery modes and ordering
4. **Agent Execution** — Wrapping pi-coding-agent with Nexus context
5. **Manager-Worker Orchestration** — Coordinating MA/WA agent hierarchy
6. **Ledger Writes** — Persisting sessions/turns to the Agents Ledger

The Broker is invoked by NEX during the `executeOperation` pipeline stage. It does not handle inbound events directly — that's NEX's job.

---

## Broker Wraps pi-coding-agent

**The Broker does NOT reinvent agent execution.** It wraps `@mariozechner/pi-coding-agent` just like OpenClaw does.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BROKER                                          │
│                                                                              │
│   1. BEFORE EXECUTION (Broker's primary job)                                │
│      • Resolve routing → session/thread                                     │
│      • Assemble context (workspace, persona, history, Memory System)        │
│      • Build system prompt                                                   │
│      • Prepare tool set (with IAM-based filtering)                          │
│                                                                              │
│   2. DURING EXECUTION (Delegate to pi-coding-agent)                         │
│      • Call runEmbeddedPiAgent() with assembled context                     │
│      • Stream responses back to NEX                                          │
│      • Handle tool calls (pi-coding-agent manages this)                      │
│                                                                              │
│   3. AFTER EXECUTION (Broker's persistence job)                             │
│      • Write turn to Agents Ledger (not JSONL)                              │
│      • Update session pointer                                                │
│      • Trigger compaction if needed                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**What pi-coding-agent provides:**
- Core agent loop (user message → LLM → tool calls → response)
- Tool execution framework
- Session/transcript management (we replace storage layer)
- Streaming subscriptions
- Compaction logic (we adapt for our data model)

**What Broker adds:**
- NEX integration (receives NexusRequest, returns AgentResponse)
- SQLite-based persistence (Agents Ledger instead of JSONL)
- Memory System context injection (semantic memory layer)
- IAM-based tool filtering
- Manager-Worker orchestration

---

## Interface with NEX

NEX hands the Broker a `NexusRequest` with:
- Event data (already stored in Events Ledger)
- Identity (resolved by IAM)
- Permissions (resolved by IAM)
- Routing decision (from hooks or default routing)

The Broker:
1. Resolves the routing decision to a specific session/thread
2. Assembles context (history, Memory System injection, system prompt)
3. Executes the agent
4. The agent invokes delivery tools directly (agent-driven delivery)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              NEX PIPELINE                                    │
│                                                                              │
│   ... → resolveAccess → ┌──────────────────────────────────────────┐   │
│                          │            executeOperation               │   │
│                          │  ┌────────────────────────────────────┐   │   │
│                          │  │ Broker: context assembly + agent    │   │   │
│                          │  │ Agent invokes delivery tools        │   │   │
│                          │  └────────────────────────────────────┘   │   │
│                          └──────────────────────┬───────────────────┘   │
│                                                  ↓                       │
│                                          finalizeRequest                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Manager-Worker Pattern

The Manager-Worker Pattern (MWP) defines how Nexus orchestrates multiple agents to handle complex tasks.

**Core insight:** A single user-facing agent (Manager) maintains conversation continuity while delegating context-heavy execution to specialized agents (Workers).

In Nexus MWP:
- The MA is communication-only (decide what to say, when to wait, and what to dispatch).
- The MA aggressively parallelizes work via async dispatch to WAs.
- The MA may write to a scratchpad workspace, but does not do project/tool work directly.

### Terminology

| Term | Role | Description |
|------|------|-------------|
| **Manager Agent (MA)** | Interaction | Talks to user, delegates tasks, maintains conversation |
| **Worker Agent (WA)** | Execution | Task-focused, heavy context, specialized tools |

### Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                         NEX Pipeline                                │
│                (triggers broker at executeOperation stage)         │
└────────────────────────────────────────┬───────────────────────────┘
                                         │
                                         ▼
┌────────────────────────────────────────────────────────────────────┐
│                        AGENT BROKER                                 │
│                                                                     │
│  • Routes messages to appropriate agent sessions                   │
│  • Manages message queues (durable, priority-based)               │
│  • Tracks agent relationships (who spawned whom)                  │
│  • Handles trigger → session routing                               │
│  • Writes sessions/turns to Agents Ledger                         │
│                                                                     │
└────────────────┬──────────────────────────────────┬────────────────┘
                 │                                   │
                 ▼                                   ▼
┌────────────────────────────┐   ┌────────────────────────────────────┐
│     Manager Agent (MA)     │   │      Worker Agent (WA)             │
│                            │   │                                    │
│  • User conversation       │   │  • Task execution                  │
│  • Intent understanding    │   │  • Heavy project context           │
│  • Delegation decisions    │   │  • Specialized tools               │
│  • Communication learning  │   │  • Can spawn sub-workers           │
│                            │   │                                    │
│  Tools:                    │   │  Can message back to MA:           │
│  - agent_send              │   │  - Progress updates                │
│  - get_agent_status        │   │  - Clarifying questions            │
│  - ledger/memory inspection│   │  - Partial results                 │
│  - wait                    │   │                                    │
│  - send_message            │   │  Final result always returns:      │
│  (scratchpad-only file     │   │  - worker_result → caller session  │
│   tools, sandboxed)        │   │                                    │
└────────────────────────────┘   └────────────────────────────────────┘
                                             │
                                             │ nested spawn
                                             ▼
                              ┌────────────────────────────────────────┐
                              │      Sub-Worker Agent                  │
                              │      (WAs can spawn their own WAs)     │
                              │      Depth limit: 3 (configurable      │
                              │      via `agents.max_worker_depth`)    │
                              └────────────────────────────────────────┘
```

### Key Properties

**1. All Agents Persistent**

Every agent session is persisted to the Agents Ledger. There are no "ephemeral" agents. Any session can be resumed with its full context.

**2. Nested Spawning Allowed**

Workers can spawn their own sub-workers. Use cases:
- Complex tasks requiring specialization
- Parallel sub-task execution
- Vision/browser workers spawning analysis workers

Broker tracks spawn depth. Default maximum: 3 levels (configurable via `agents.max_worker_depth`).

**3. Bidirectional Communication**

Workers can message the Manager at any time, not just at completion:
- Progress updates during long tasks
- Clarifying questions that need user input
- Early results before full completion

**4. Persona Is Separate From Session Keys**

Session keys identify the conversation/thread target (dm/group/worker/etc). Persona is a routing decorator that can be swapped without changing the session key.

- Workers default to the caller's persona (same identity + permissions).
- A dispatch may explicitly request a different `personaId`/persona (still subject to IAM).

---

## Routing

### Routing Hierarchy

The Broker supports three levels of routing abstraction:

```
┌─────────────────────────────────────────┐
│           Persona Routing               │  → maps persona → main session
├─────────────────────────────────────────┤
│           Session Routing               │  → maps label → current thread head
├─────────────────────────────────────────┤
│         Turn/Thread Routing             │  → routes to specific turn ID
│            (BEDROCK)                    │
└─────────────────────────────────────────┘
```

**Turn/Thread routing is the bedrock.** All higher abstractions resolve down to a turn ID.

### Routing Interface

```typescript
interface RoutingTarget {
  // Mutually exclusive - pick one:
  thread?: string;    // Turn/Thread ID (bedrock)
  session?: string;   // Session key → resolves to thread head
  persona?: string;   // Persona ID → resolves to main session → thread head

  // Modifier:
  smart?: boolean;    // Use Memory System to find best target first
}

// Examples:
route({ thread: "turn-abc-123" });           // Direct to turn
route({ session: "main" });                   // Session's current head
route({ persona: "atlas" });                  // Persona's main session
route({ session: "main", smart: true });      // Smart search via Memory System, then session routing
```

For MWP dispatch (`agent_send(op="dispatch")`), v1 MA behavior is session-level only:
- target session provided -> route to that existing session
- no target session -> spawn new worker session
- turn-level fork targeting is a Broker smart-routing concern (v2), not MA prompt burden

### Smart Routing

Smart routing is a **modifier**, not a separate routing mode:
1. Query Memory System for best matching thread/session/persona
2. Use the resolved target with standard routing
3. Falls back to specified default if no good match

---

## Session Keys

Session keys are stable identifiers assigned by ACL policies during `resolveAccess`. Format depends on sender type:

| Pattern | Example | Description |
|---------|---------|-------------|
| DM (entity-based) | `dm:{entity_id}` | Known sender, resolved via Identity Graph |
| DM (platform-based) | `dm:{platform}:{sender_id}` | Unknown sender, platform-scoped |
| Group | `group:{platform}:{container_id}` | Group conversations |
| Worker | `worker:{ulid}` | Spawned worker sessions |
| System | `system:{purpose}` | System-triggered sessions (timers, etc.) |

Session keys use **session aliases** for identity promotion — when a channel-based session gets linked to an entity, the old key becomes an alias pointing to the canonical entity-based key. See `SESSION_LIFECYCLE.md` for full details.

---

## Queue Modes

How messages are delivered when a session is busy:

| Mode | During Active Run | After Run Ends |
|------|-------------------|----------------|
| `steer` | Abort active run (preempt) | Drain backlog into next run |
| `followup` | Queue message | Process FIFO |
| `collect` | Queue message | Batch all into one turn (events-based) |
| `queue` | Simple queue | Process FIFO |
| `interrupt` | Abort active run (preempt) | Drain backlog into next run |

### Session Pointer Management

When multiple messages queue for a session, the broker processes them **serially** and updates the session pointer after each turn:

```
WRONG (parallel routing creates forks):
  Session "main" → Turn X
  Route msg1 to X → creates Turn Y
  Route msg2 to X → creates Turn Z  ← Should have routed to Y!

CORRECT (serial with pointer update):
  Session "main" → Turn X
  Route msg1 to X → creates Turn Y → Update session → Turn Y
  Route msg2 to Y → creates Turn Z → Update session → Turn Z
```

**Key invariants:**
1. **One message at a time per session** — Processing lock prevents parallel execution
2. **Fresh lookup each message** — Always read session pointer from Agents Ledger
3. **Update after completion** — Pointer moves only after turn finishes
4. **Session table is source of truth** — Route via session lookup, not cached turn IDs

### Explicit Forking

To intentionally fork from a turn that already has children:

```typescript
async forkFromTurn(turnId: string, message: Message): Promise<Session> {
  const newSessionKey = `fork-${uuid()}`;

  // Create session pointing to fork point
  await db.createSession({ label: newSessionKey, threadId: turnId });

  // Route message - creates new turn as child of turnId
  await this.routeToSession(newSessionKey, message);

  return db.getSession(newSessionKey);
}
```

Result:
```
Turn A → Turn B → Turn X → Turn Y (session "main")
                  └──→ Turn Z (session "fork-abc" - forked from X)
```

---

## Communication Patterns

MA ↔ WA messages go through the **Broker directly**, not via NEX. This is a fast path that bypasses the NEX pipeline — no event storage, no hook evaluation.

### MA → WA: Task Delegation

```
MA decides to delegate: "This requires deep code analysis"
  │
  ▼
MA calls: agent_send({ op: "dispatch", text: "...", target: { session: "worker:code-worker" } })
  │
  ▼
Broker enqueues a durable worker request (fire-and-forget)
  │
  ▼
WA executes (may take minutes, can use tools)
  │
  ▼
WA completion enqueues a `worker_result` event back to the caller session (MA)
```

### WA → MA: Mid-Task Communication

```
WA encounters ambiguity during execution
  │
  ▼
WA calls: agent_send({ op: "message", text: "Need clarification...", target: { session: "parent" } })
  │
  ▼
Broker routes to MA session
  │
  ▼
MA asks user for clarification
  │
  ▼
MA responds to WA with answer
  │
  ▼
WA continues execution
```

### User → MA: Status Query

```
User: "How's that code review going?"
  │
  ▼
MA receives via NEX pipeline
  │
  ▼
MA inspects worker history via ledger/memory using dispatch_id/session_key
  │
  ▼
MA summarizes for user
```

### Dispatch Targeting (v1 + v2 Shape)

Canonical interface (tool-level shape):

```typescript
type AgentSendInput =
  | {
      op: "dispatch";
      text: string;
      // v1:
      // - target.session provided => route to existing session
      // - target omitted => spawn new worker session
      // v2:
      // - smart/forked routing may resolve from historical checkpoints
      target?: DispatchTarget;
      deliveryMode?: "queue" | "interrupt";
      metadata?: Record<string, unknown>;
    }
  | {
      op: "message";
      text: string;
      target: { session: string };
      deliveryMode?: "queue" | "interrupt";
      metadata?: Record<string, unknown>;
    };

type DispatchTarget =
  | { kind: "session"; session: string }                      // v1 explicit routing
  | { kind: "new_session"; labelHint?: string }               // v1 explicit spawn
  | { kind: "fork"; fromTurnId: string; labelHint?: string }  // v2 smart/explicit fork
```

LLM shorthand contract for v1 (what MA thinks in prompts):
- `agent_send("task", "worker:label")` -> dispatch to existing session
- `agent_send("task")` -> spawn a new worker session

### Dispatch Handles and History Lookup

- Every `agent_send(op=dispatch)` returns a `dispatch_id` (the tool call id) and `spawned_session_key`.
- The spawned worker session persists a backlink: `spawn_tool_call_id = dispatch_id`.
- Worker results include `broker.dispatched_tool_call_id = dispatch_id` for correlation.
- Long-term: no special "get agent logs" tool is required. MA/WA inspection should use existing ledger + Memory System APIs with `dispatch_id` and `spawned_session_key` as the lookup handles.

---

## Tool Interface

### Manager Tools

| Tool | Purpose |
|------|---------|
| `agent_send` | Unified inter-agent send: dispatch work (`op=dispatch`) or message (`op=message`) |
| `get_agent_status` | Check session status + queue snapshot |
| `wait` | End turn without sending a user-facing reply |
| `send_message` | Send explicit user-facing messages to any channel/target (multi-channel) |

### Worker Tools

| Tool | Purpose |
|------|---------|
| `agent_send` | Message the manager/parent or other agents; can also dispatch sub-workers |
| Full tool access | File ops, shell, web, etc. (per permissions), but no direct end-user messaging |
| (implicit) `worker_result` | Worker completion is always routed upstream to the caller session |

---

## Context Assembly

The Broker assembles context before agent execution from five conceptual layers, mapped to three physical layers optimized for LLM prompt caching:

| Conceptual Layer | Physical Layer | Caching |
|------------------|---------------|---------|
| **Workspace** — AGENTS.md, rules, static runtime | System Prompt (static) | Full cache |
| **Persona** — SOUL.md, IDENTITY.md, permissions | System Prompt (static) | Full cache |
| **Session** — History from thread ancestry | Conversation History (incremental) | Prefix cache |
| **Memory System** — Relevant context from derived layer | Current Event (dynamic) | Never cached |
| **Event** — Triggering event, hook injections, user message | Current Event (dynamic) | Never cached |

**See:** `CONTEXT_ASSEMBLY.md` for the full specification.

---

## Agent Execution

### Run States

| State | Description |
|-------|-------------|
| `idle` | No active run, ready for messages |
| `running` | Active run in progress |
| `streaming` | Actively generating output |
| `compacting` | Performing context compaction |

### Turn Lifecycle

A **turn** completes when the assistant finishes responding. It includes:
- The triggering message(s) (query)
- All tool calls made during the response
- All agent thinking
- The final response

**Turn ID is a ULID** — independent, unique, and sortable.

Tool calls are **part of** a turn, not separate turns.

### Ledger Writes

The Broker writes directly to the **Agents Ledger** (not JSONL files):
- `sessions` — Named session pointers
- `turns` — Turn records with parent relationships
- `messages` — Individual messages (query + response)
- `tool_calls` — Tool invocations and results
- `compactions` — Rich compaction metadata (separate from turns)
- `threads` — Pre-computed ancestry for fast routing
- `session_history` — Session pointer movement log

**See:** `../../data/ledgers/AGENTS_LEDGER.md`

---

## Documents in This Folder

| Document | Description |
|----------|-------------|
| **BROKER.md** | This file — broker overview + Manager-Worker Pattern |
| **DATA_MODEL.md** | Ontology — conceptual definitions (Message, Turn, Thread, Session, Persona) |
| **AGENT_ENGINE.md** | pi-coding-agent wrapper interface (in/out contracts, ledger mapping) |
| **CONTEXT_ASSEMBLY.md** | How context is built before agent execution (5 conceptual → 3 physical layers) |
| **QUEUE_MANAGEMENT.md** | Queue modes, session locking, drain semantics |
| **MEESEEKS_PATTERN.md** | Canonical automation system — disposable role forks, hook points, workspace model |
| **SESSION_LIFECYCLE.md** | Session creation, identity coupling, forking, compaction, subagent lifecycle |
| **STREAMING.md** | Redirect → `../STREAMING.md` (consolidated cross-cutting streaming spec) |
| **upstream/** | Upstream OpenClaw reference documentation |

---

## Open Questions

1. **NEX → Broker handoff:** Exact interface and data contract
2. **Context assembly details:** Full spec for each layer
3. **Memory System integration:** How Broker queries Memory System for context injection
4. **Error handling:** Agent run failures, queue overflow, recovery paths
5. **Persona management:** Storage, creation, inheritance rules
6. **MA sandboxing:** How hard should we sandbox MA scratchpad-only file access (tool-level path allowlist vs stronger OS/container sandbox)?
7. **Spawn depth limit:** Is 3 levels sufficient? Should it be per-workspace configurable?
8. **Cross-persona workers:** Can a WA be spawned with a different persona than MA? (Permission escalation/restriction scenarios)
9. **Worker cleanup:** When should completed worker sessions be archived vs kept active?

---

## Related Specs

- `../nex/` — NEX pipeline (triggers Broker)
- `../../data/ledgers/AGENTS_LEDGER.md` — Where Broker writes sessions/turns
- `../memory/MEMORY_SYSTEM.md` — Where Broker queries for context (Memory System)
- `../iam/` — Permissions that constrain agent execution

---

*This document defines the Agent Broker subsystem and the Manager-Worker Pattern for agent orchestration.*
