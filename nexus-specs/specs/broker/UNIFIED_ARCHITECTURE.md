# Unified Agent System Architecture

**Status:** CANONICAL REFERENCE  
**Last Updated:** 2026-01-29  
**Purpose:** Single source of truth for agent system architecture, tying all specs together

---

## Executive Summary

The Nexus agent system combines:
1. **Cortex Event Layer** — Universal event sourcing, storage, and hook evaluation
2. **Agent Broker** — Message routing, queue management, and agent execution
3. **Manager-Worker Pattern** — User-facing MA orchestrates task-focused WAs

This document provides the unified architecture diagram and explains how all pieces connect.

---

## 1. Unified Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL SOURCES                                    │
│                                                                              │
│   iMessage    Gmail    Discord   Telegram   WhatsApp   Webhooks   Files     │
│      │          │         │         │          │          │         │        │
│      └──────────┴─────────┴─────────┴──────────┴──────────┴─────────┘        │
│                                    │                                         │
│                           Inbound Adapters                                   │
│                    (normalize → Cortex events)                             │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MNEMONIC EVENT LAYER                                  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      Events Ledger                                     │  │
│  │  • All events stored with deterministic IDs                           │  │
│  │  • Threads table for event grouping                                   │  │
│  │  • Timer adapter fires synthetic event every 60s (for cron hooks)    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│                                    ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      Hook Evaluation                                   │  │
│  │  • ALL enabled hooks evaluated in PARALLEL for each event            │  │
│  │  • Hooks are TypeScript scripts with full flexibility                │  │
│  │  • Fast path (deterministic) vs Slow path (LLM evaluation)           │  │
│  │  • Hooks return: { fire, routing, context, disable_hook }            │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│                           Fired hooks                                        │
│                    (routing decisions)                                       │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      Agents Ledger                                     │  │
│  │  • Full-fidelity AI sessions (from AIX)                               │  │
│  │  • agent_sessions, agent_messages, agent_turns, agent_tool_calls     │  │
│  │  • Enables smart forking (future)                                     │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          AGENT BROKER                                        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                    ROUTING LAYER                                 │        │
│  │                                                                  │        │
│  │  Routing Hierarchy (bottom to top):                             │        │
│  │                                                                  │        │
│  │    ┌─────────────────────────────────────────────────────┐      │        │
│  │    │  Turn/Thread Routing (bedrock)                      │      │        │
│  │    │  • Route to specific turn ID                        │      │        │
│  │    │  • Thread = turn + all ancestors                    │      │        │
│  │    └─────────────────────────────────────────────────────┘      │        │
│  │                        ▲                                         │        │
│  │    ┌───────────────────┴─────────────────────────────────┐      │        │
│  │    │  Session Routing (abstraction)                      │      │        │
│  │    │  • Session label → current thread head              │      │        │
│  │    │  • Session = thread with no children on head        │      │        │
│  │    └─────────────────────────────────────────────────────┘      │        │
│  │                        ▲                                         │        │
│  │    ┌───────────────────┴─────────────────────────────────┐      │        │
│  │    │  Persona Routing (abstraction)                      │      │        │
│  │    │  • Persona → main session                           │      │        │
│  │    │  • Persona = Identity + Permissions                 │      │        │
│  │    └─────────────────────────────────────────────────────┘      │        │
│  │                                                                  │        │
│  │  Smart Routing Flag: Can be applied to any level                │        │
│  │  • Uses Cortex search to find best target                     │        │
│  │  • Falls through to selected routing level                      │        │
│  │                                                                  │        │
│  │  Interface: route({ thread?, session?, persona?, smart? })      │        │
│  │             (thread/session/persona are mutually exclusive)     │        │
│  └─────────────────────────────────────────────────────────┘        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │                    CONTEXT ASSEMBLY                      │        │
│  │  (See agent-bindings-research/ for details)             │        │
│  │                                                          │        │
│  │  • Layer 1 (Workspace): AGENTS.md, identity files       │        │
│  │  • Layer 2A (MA): Reply tags, messaging rules           │        │
│  │  • Layer 2B (WA): Task instructions, full tools         │        │
│  │  • Session history from thread ancestry                 │        │
│  │  • Cortex context injection (TODO: spec details)      │        │
│  └─────────────────────────────────────────────────────────┘        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │                    QUEUE MANAGEMENT                      │        │
│  │                                                          │        │
│  │  Queue Modes (from upstream):                           │        │
│  │  • steer     — Inject into active run                   │        │
│  │  • followup  — Queue for next turn                      │        │
│  │  • collect   — Batch + debounce                         │        │
│  │  • interrupt — Clear queue + abort + start new          │        │
│  │  • queue     — Simple FIFO                              │        │
│  │                                                          │        │
│  │  Per-session queues with durability (SQLite)            │        │
│  └─────────────────────────────────────────────────────────┘        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │                    AGENT EXECUTION                       │        │
│  │                                                          │        │
│  │  • Runs pi-agent with assembled context                 │        │
│  │  • Tracks active runs (streaming, compacting, idle)     │        │
│  │  • Handles tool calls within the turn                   │        │
│  │  • Turn completes when agent finishes responding        │        │
│  └─────────────────────────────────────────────────────────┘        │
│                                                                              │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────────┐
        ▼                            ▼                                ▼
┌──────────────────┐    ┌──────────────────────────┐    ┌──────────────────┐
│  Manager Agent   │    │     Worker Agents        │    │   Sub-Workers    │
│  (MA)            │    │     (WAs)                │    │   (nested OK)    │
│                  │    │                          │    │                  │
│  • User-facing   │◄──►│  • Task-focused          │◄──►│  • Depth limit   │
│  • Conversation  │    │  • Heavy context         │    │    (default: 3)  │
│  • Delegates     │    │  • Specialized tools     │    │                  │
│                  │    │                          │    │                  │
│  Tools:          │    │  Tools:                  │    │                  │
│  • dispatch_to_  │    │  • send_message_to_      │    │                  │
│    agent         │    │    agent (back to MA)    │    │                  │
│  • reply_to_     │    │  • full tool access      │    │                  │
│    caller        │    │                          │    │                  │
└──────────────────┘    └──────────────────────────┘    └──────────────────┘
        │                            │                                │
        │   Agent-to-Agent Messages (via Broker, not Event Layer)    │
        └────────────────────────────┴────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RESPONSE HANDLING                                     │
│                                                                              │
│  1. Capture agent response                                                  │
│  2. Store response as Cortex event (closes the loop)                      │
│  3. Route to outbound adapter based on original event source                │
│                                                                              │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        OUTBOUND ADAPTERS                                     │
│                                                                              │
│   Discord    Telegram    WhatsApp    Webhook    (TODO: spec formatting)     │
│   • 2000     • 4000      • Baileys   • HTTP                                 │
│     chars      chars       API         POST                                 │
│   • Embeds   • Markdown  • PTT                                              │
│   • Threads  • Buttons   • Polls                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Data Model (from ONTOLOGY.md)

### 2.1 Primitives

| Concept | Definition | Git Analogy |
|---------|------------|-------------|
| **Message** | Atomic content unit (user input, assistant output, tool result) | File change |
| **Turn** | Query + response exchange; the key addressable unit | Commit |
| **Thread** | Turn viewed with all ancestors (cumulative context) | Branch history |
| **Session** | Thread whose head has no children (active endpoint) | Branch tip |
| **Persona** | Identity + Permissions (thread decorator) | Repo permissions |

### 2.2 Turn Definition (Canonical)

A **turn** completes when the assistant finishes responding. It includes:
- The triggering message(s) (query)
- All tool calls made during the response
- All agent thinking
- The final response

**Turn ID = final assistant message ID** (clean, unambiguous).

Tool calls are **part of** a turn, not separate turns.

### 2.3 Thread vs Platform Thread (Terminology)

To avoid confusion:
- **Thread** (ONTOLOGY) = conversation state, turn + ancestry
- **Channel Thread** or **Topic** = platform feature (Discord threads, Telegram topics)

When session keys reference platform threads: `agent:main:telegram:group:123:thread:456`

---

## 3. Routing Model

### 3.1 Routing Hierarchy

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

### 3.2 Routing Interface

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

### 3.3 Smart Routing

Smart routing is a **modifier**, not a separate routing mode:
1. Query Cortex for best matching thread/session/persona
2. Use the resolved target with standard routing
3. Falls back to specified default if no good match

---

## 4. Event Flow

### 4.1 Inbound Event Flow

```
External Source (e.g., iMessage)
        │
        ▼
Inbound Adapter normalizes → Cortex Event
        │
        ▼
Event stored in Events Ledger
        │
        ▼
ALL hooks evaluated in parallel
        │
        ├─ Hook A: { fire: false }
        ├─ Hook B: { fire: true, routing: { persona: "atlas" } }
        └─ Hook C: { fire: true, routing: { session: "work" } }
        │
        ▼
Fired hooks → Broker (each separately)
        │
        ▼
Broker resolves routing → Thread ID
        │
        ▼
Context assembled for thread
        │
        ▼
Agent execution (pi-agent)
        │
        ▼
Response captured → stored as Cortex event
        │
        ▼
Outbound adapter delivers to platform
```

### 4.2 Timer Events (Cron/Scheduled Hooks)

A dedicated **Timer Adapter** fires a synthetic event every 60 seconds:
```typescript
{
  channel: "timer",
  content: null,
  timestamp: <current_time>,
  source_adapter: "timer"
}
```

Scheduled hooks check their cron expressions against this event's timestamp:
```typescript
export default async function(ctx: HookContext): Promise<HookResult> {
  if (event.channel !== 'timer') return { fire: false };
  
  if (!cronMatches(SCHEDULE, ctx.now)) return { fire: false };
  
  // Time to fire!
  return { fire: true, routing: { persona: 'atlas' }, context: { prompt: '...' } };
}
```

### 4.3 Agent-to-Agent Communication

MA ↔ WA messages go through the **Broker directly**, not the Event Layer:
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

Cortex picks up all agent sessions via AIX sync (for search/analysis), but real-time routing is broker-direct.

---

## 5. Session Key Format (Upstream Convention)

From upstream moltbot:

```
agent:{agentId}:{type}:{context}
```

### 5.1 Common Patterns

| Pattern | Example | Description |
|---------|---------|-------------|
| Main session | `agent:main:main` | Default agent, main session |
| DM (main scope) | `agent:main:main` | DMs collapse to main by default |
| DM (per-peer) | `agent:main:dm:tyler` | Isolated DM per peer |
| Group | `agent:main:telegram:group:123` | Isolated per group |
| Channel | `agent:main:slack:channel:C123` | Isolated per channel |
| Subagent | `agent:main:subagent:uuid` | Spawned worker session |
| Cron | `agent:main:cron:job-1` | Isolated cron job session |
| Thread | `agent:main:telegram:group:123:thread:456` | Platform thread within group |

### 5.2 Defaults

- **DEFAULT_AGENT_ID:** `"main"`
- **DEFAULT_MAIN_KEY:** `"main"`
- **DEFAULT_ACCOUNT_ID:** `"default"`

---

## 6. Hook System

### 6.1 Hook Structure

```typescript
/**
 * @name Human Readable Name
 * @description What this hook does
 * @mode persistent | one-shot
 */
import Database from 'better-sqlite3';

export default async function(ctx: HookContext): Promise<HookResult> {
  const { event, dbPath, search, llm, now, hook } = ctx;
  
  // Fast exit for non-matching
  if (event.channel !== 'imessage') return { fire: false };
  
  // Optional: query cortex via SQL
  const db = new Database(dbPath, { readonly: true });
  const history = db.prepare('SELECT * FROM events WHERE ...').all();
  db.close();
  
  // Optional: semantic search
  const similar = await search("relevant query", { limit: 5 });
  
  // Optional: LLM evaluation (always gemini-3-flash-preview)
  const response = await llm("Is this X? Return JSON.", { json: true });
  const analysis = JSON.parse(response);
  
  return {
    fire: true,
    routing: { agent_id: 'atlas' },
    context: { prompt: '...', extracted: analysis },
    disable_hook: false  // true for one-shot
  };
}
```

### 6.2 Hook Patterns

| Pattern | Example | Description |
|---------|---------|-------------|
| **Deterministic** | `work-whatsapp-routing.ts` | Fast pattern matching, no LLM |
| **Conditional LLM** | `mom-2fa-helper.ts` | LLM classifies incoming messages |
| **One-Shot Scheduled** | `casey-safety-check.ts` | Fires once, queries history, self-disables |
| **Interval Scheduled** | `heartbeat.ts` | Fires on timer interval |
| **Webhook Filter** | `stripe-high-value.ts` | Filters webhook events by payload |
| **Hybrid** | `flight-checkin.ts` | Deterministic pre-filter + LLM extraction |

### 6.3 Hook Health & Circuit Breaker

- 5 consecutive errors → circuit opens (hook paused)
- After 5 minutes → half-open (try one invocation)
- Success → circuit closes
- Failure → stays open, reset timer

---

## 7. Queue Modes (from Upstream)

| Mode | During Active Run | After Run Ends |
|------|-------------------|----------------|
| `steer` | Inject message into active context | Run normally |
| `followup` | Queue message | Process FIFO |
| `collect` | Queue message | Batch all into one prompt |
| `steer-backlog` | Try steer, queue if fails | Process queue |
| `queue` | Simple queue | Process FIFO |
| `interrupt` | Abort active run | Run new message |

### 7.1 Session Pointer Management

When multiple messages queue for a session, the broker must process them **serially** and update the session pointer after each turn to prevent stale routing:

```
WRONG (parallel routing creates unintended forks):
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
2. **Fresh lookup each message** — Always read session pointer from DB, never cache
3. **Update after completion** — Pointer moves only after turn finishes
4. **Session table is source of truth** — Route via session lookup, not cached turn IDs

### 7.2 Explicit Forking

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

**Result:** New turn created as **child** of the fork point (not a duplicate). Multiple sessions can fork from the same turn.

```
Turn A → Turn B → Turn X → Turn Y (session "main")
                  └──→ Turn Z (session "fork-abc" - forked from X)
```

---

## 8. Manager-Worker Pattern (MWP)

### 8.1 Roles

| Role | Responsibility | Tools |
|------|----------------|-------|
| **Manager Agent (MA)** | User conversation, delegation decisions | `dispatch_to_agent`, `reply_to_caller` |
| **Worker Agent (WA)** | Task execution, heavy context | Full tools, `send_message_to_agent` |
| **Sub-Worker** | Nested tasks (depth limit: 3) | Same as WA |

### 8.2 Key Properties

- **All agents persistent** — No ephemeral agents; any session can be resumed
- **Nested spawning allowed** — WAs can spawn sub-WAs (unlike upstream restriction)
- **Mid-task communication** — WAs can message MA anytime, not just at completion
- **Persona inheritance** — WAs inherit MA's persona (identity + permissions)

---

## 9. Spec Document Index

| Document | Status | Description |
|----------|--------|-------------|
| **UNIFIED_ARCHITECTURE.md** | ✅ Canonical | This document — unified reference |
| **ONTOLOGY.md** | ✅ Canonical | Data model (Message, Turn, Thread, Session, Persona) |
| **EVENT_SYSTEM_DESIGN.md** | ✅ Current | Cortex event layer, hooks, adapters |
| **SESSION_FORMAT.md** | ✅ Done | JSONL format, AIX compatibility |
| **TERMINOLOGY.md** | ✅ Aligned | Canonical terms (aligned with ONTOLOGY) |
| **UPSTREAM_AGENT_SYSTEM.md** | ✅ Reference | Detailed upstream clawdbot reference |
| **BROKER.md** | ⚠️ Needs Update | Routing interface needs ONTOLOGY alignment |
| **ORCHESTRATION.md** | ⚠️ Outdated | Predates EVENT_SYSTEM_DESIGN; superseded by this doc |
| **UNIFIED_TRIGGERS.md** | ❌ Superseded | Now part of EVENT_SYSTEM_DESIGN hooks |

---

## 10. Open Items (TODOs)

### 10.1 Requiring Discussion & Spec Work

| Item | Status | Notes |
|------|--------|-------|
| **Hook → Broker Interface** | TODO | How do hook routing decisions become broker calls? What if multiple hooks fire? |
| **Context Assembly Details** | TODO | Event context, session context injection — has research docs but needs detailed spec |
| **Response Formatting** | TODO | How responses are formatted per platform, threading, error handling |
| **Agent-to-Agent Flow** | TODO | Full MA ↔ WA flow details, relationship to event layer |
| **Persona Management** | TODO | Storage, creation, inheritance for WAs |
| **Error Handling** | TODO | Agent run failures, queue overflow, delivery failures, recovery paths |

### 10.2 Deferred (Future Work)

| Item | Status | Notes |
|------|--------|-------|
| **Smart Forking Algorithm** | DEFERRED | Scoring, checkpoint representation, fork context assembly |
| **BROKER.md Update** | TODO | Update to use ONTOLOGY routing model |

### 10.3 Clarifications Needed (Ambiguous)

| Item | Status | Notes |
|------|--------|-------|
| **Session Key Conventions** | AMBIGUOUS | Need to confirm conventions match upstream; requires deeper exploration |
| **Thread Terminology** | CLARIFIED | ONTOLOGY "Thread" vs platform "Channel Thread/Topic" — use distinct terms |

---

## 11. Related Documents

### Agent System Specs
- `specs/agent-system/ONTOLOGY.md` — Data model
- `specs/agent-system/EVENT_SYSTEM_DESIGN.md` — Event layer and hooks
- `specs/agent-system/SESSION_FORMAT.md` — JSONL format
- `specs/agent-system/TERMINOLOGY.md` — Canonical terms
- `specs/agent-system/hook-examples/` — Hook patterns

### Context Assembly Research
- `specs/workspace/agent-bindings-research/01-UPSTREAM_CONTEXT_INJECTION.md`
- `specs/workspace/agent-bindings-research/02-NEXUS_CONTEXT_INJECTION.md`
- `specs/workspace/agent-bindings-research/03-HARNESS_BINDING_MECHANISMS.md`

### Memory System
- `cortex/docs/CORTEX_ARCHITECTURE.md` — Unified memory system (Events + Agents ledgers)
- `aix/docs/AIX_CORTEX_PIPELINE.md` — AIX capture → Cortex flow

---

*This document is the canonical architecture reference. Other specs provide detail on specific subsystems.*
