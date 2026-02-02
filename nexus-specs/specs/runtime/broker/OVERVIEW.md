# Agent Broker Overview

**Status:** SPEC IN PROGRESS  
**Last Updated:** 2026-02-02

---

## What is the Broker?

The Agent Broker is responsible for:
1. **Routing** — Resolving where messages go (sessions, threads, personas)
2. **Context Assembly** — Building the full context for agent execution
3. **Queue Management** — Handling message delivery modes and ordering
4. **Agent Execution** — Running agents and managing their lifecycle
5. **Ledger Writes** — Persisting sessions/turns to the Agents Ledger

The Broker is invoked by NEX during the `assembleContext` and `runAgent` pipeline stages. It does not handle inbound events directly — that's NEX's job.

---

## Interface with NEX

NEX hands the Broker a `NexusRequest` with:
- Event data (already stored in Events Ledger)
- Identity (resolved by IAM)
- Permissions (resolved by IAM)
- Routing decision (from hooks or default routing)

The Broker:
1. Resolves the routing decision to a specific session/thread
2. Assembles context (history, Cortex injection, system prompt)
3. Executes the agent
4. Returns the response to NEX for delivery

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              NEX PIPELINE                                    │
│                                                                              │
│   ... → resolveAccess → executeTriggers → ┌─────────────────────────────┐   │
│                                           │       BROKER DOMAIN          │   │
│                                           │  ┌────────────────────────┐  │   │
│                                           │  │ assembleContext        │  │   │
│                                           │  │ runAgent               │  │   │
│                                           │  └────────────────────────┘  │   │
│                                           └──────────────┬──────────────┘   │
│                                                          ↓                   │
│                                           deliverResponse → finalize ...     │
└─────────────────────────────────────────────────────────────────────────────┘
```

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
  session?: string;   // Session label → resolves to thread head
  persona?: string;   // Persona ID → resolves to main session → thread head
  
  // Modifier:
  smart?: boolean;    // Use Cortex to find best target first
}

// Examples:
route({ thread: "turn-abc-123" });           // Direct to turn
route({ session: "main" });                   // Session's current head
route({ persona: "atlas" });                  // Persona's main session
route({ session: "main", smart: true });      // Smart search, then session routing
```

### Smart Routing

Smart routing is a **modifier**, not a separate routing mode:
1. Query Cortex for best matching thread/session/persona
2. Use the resolved target with standard routing
3. Falls back to specified default if no good match

---

## Session Keys

Session keys provide stable identifiers for routing:

```
{type}:{agentId}:{context...}
```

### Common Patterns

| Pattern | Example | Description |
|---------|---------|-------------|
| Main session | `agent:main:main` | Default agent, main session |
| DM (main scope) | `agent:main:main` | DMs collapse to main by default |
| DM (per-peer) | `agent:main:dm:tyler` | Isolated DM per peer |
| Group | `agent:main:telegram:group:123` | Isolated per group |
| Worker | `agent:main:worker:uuid` | Spawned worker session |
| Platform thread | `agent:main:telegram:group:123:thread:456` | Thread within group |

---

## Queue Modes

How messages are delivered when a session is busy:

| Mode | During Active Run | After Run Ends |
|------|-------------------|----------------|
| `steer` | Inject message into active context | Run normally |
| `followup` | Queue message | Process FIFO |
| `collect` | Queue message | Batch all into one prompt |
| `steer-backlog` | Try steer, queue if fails | Process queue |
| `queue` | Simple queue | Process FIFO |
| `interrupt` | Abort active run | Run new message |

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
  const newSessionLabel = `fork-${uuid()}`;
  
  // Create session pointing to fork point
  await db.createSession({ label: newSessionLabel, threadId: turnId });
  
  // Route message - creates new turn as child of turnId
  await this.routeToSession(newSessionLabel, message);
  
  return db.getSession(newSessionLabel);
}
```

Result:
```
Turn A → Turn B → Turn X → Turn Y (session "main")
                  └──→ Turn Z (session "fork-abc" - forked from X)
```

---

## Context Assembly

The Broker assembles context before agent execution:

### Layers

1. **Workspace Layer** — AGENTS.md, identity files, workspace rules
2. **Persona Layer** — Agent identity (SOUL.md, IDENTITY.md), permissions
3. **Session Layer** — History from thread ancestry (via Agents Ledger)
4. **Cortex Layer** — Relevant context from derived layer (episodes, facets)
5. **Event Layer** — The triggering event and any hook-injected context

**TODO:** Detailed context assembly spec (see `workspace/agent-bindings-research/`)

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

**Turn ID = final assistant message ID.**

Tool calls are **part of** a turn, not separate turns.

### Ledger Writes

The Broker writes directly to the **Agents Ledger** (not JSONL files):
- `agent_sessions` — Session metadata
- `agent_turns` — Turn records with parent relationships
- `agent_messages` — Individual messages
- `agent_tool_calls` — Tool invocations and results

**See:** `ledgers/AGENTS_LEDGER.md`

---

## Agent-to-Agent Communication

MA ↔ WA messages go through the **Broker directly**, not via NEX:

```
MA calls: send_message_to_agent({ to: "code-worker", content: "..." })
        │
        ▼
Broker routes to WA session
        │
        ▼
WA processes, calls: send_message_to_agent({ to: "manager", content: "result" })
        │
        ▼
Broker routes back to MA
```

This is a fast path that bypasses the NEX pipeline — no event storage, no hook evaluation.

---

## Documents in This Folder

| Document | Description |
|----------|-------------|
| **OVERVIEW.md** | This file — broker overview |
| **DATA_MODEL.md** | Core data model (Message, Turn, Thread, Session, Persona) |
| **AGENTS.md** | Manager-Worker Pattern (MWP), agent orchestration |
| **SESSION_LIFECYCLE.md** | Session/turn management, ledger writes, compaction, forking |
| **CONTEXT_ASSEMBLY.md** | How context is built before agent execution |
| **QUEUE_MANAGEMENT.md** | Queue modes, storage, steering, delivery |
| **INTERFACES.md** | NEX ↔ Broker, Broker ↔ Cortex contracts |
| **STREAMING.md** | Streaming bridge: agent → broker → NEX → out-adapter |
| **SMART_ROUTING.md** | Cortex-powered routing to best context |
| **upstream/** | Upstream openclaw reference documentation |

---

## Open Questions

1. **NEX → Broker handoff:** Exact interface and data contract
2. **Context assembly details:** Full spec for each layer
3. **Cortex integration:** How Broker queries Cortex for context injection
4. **Error handling:** Agent run failures, queue overflow, recovery paths
5. **Persona management:** Storage, creation, inheritance rules

---

## Related Specs

- `../nex/` — NEX pipeline (triggers Broker)
- `../ledgers/AGENTS_LEDGER.md` — Where Broker writes sessions/turns
- `../cortex/` — Where Broker queries for context
- `../iam/` — Permissions that constrain agent execution

---

*This document provides an overview of the Agent Broker subsystem.*
