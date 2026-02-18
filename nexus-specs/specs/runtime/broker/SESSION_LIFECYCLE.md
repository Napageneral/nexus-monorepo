# Session Lifecycle

**Status:** DESIGN SPEC
**Last Updated:** 2026-02-17
**Canonical routing spec:** `specs/runtime/RUNTIME_ROUTING.md`

---

## Overview

This document defines the complete lifecycle of agent sessions — from creation through turn processing, compaction, forking, and entity-merge-driven session aliasing. It stitches together the session-related concepts defined across DATA_MODEL.md, AGENTS_LEDGER.md, CONTEXT_ASSEMBLY.md, and OVERVIEW.md into one coherent flow.

**Key Insight:** Session keys are identity-driven from first contact. Every sender gets an entity on message one (via auto-entity-creation in the contacts table), so all DM sessions are entity-based from the start. When the memory-writer later discovers that two entities are the same person, entity merge propagates to session aliases — conversation history stays intact, memory bridges the knowledge gap.

---

## Session Keys

### Format

Session keys are produced by `buildSessionKey()` at stage 3 (`resolveAccess`). Because every sender has an entity from first contact (via the contacts table + auto-entity-creation), all DM session keys are entity-based from the start.

| Scenario | Format | Example |
|----------|--------|---------|
| DM (any channel) | `dm:{canonical_entity_id}` | `dm:ent_002` |
| Group/channel | `group:{channel}:{peer_id}` | `group:discord:general` |
| Group thread | `group:{channel}:{peer_id}:thread:{id}` | `group:slack:eng:thread:ts123` |
| Worker/subagent | `worker:{ulid}` | `worker:01HWXYZ...` |
| System | `system:{purpose}` | `system:compaction` |

There is no `dm:{channel}:{sender_id}` fallback format. See `../RUNTIME_ROUTING.md` for the full `buildSessionKey()` implementation.

### ACL Policy Examples

```yaml
# DM → always entity-based (every sender has an entity from first contact)
- name: dm-session
  match:
    principal:
      type: [known, owner]
    delivery:
      peer_kind: dm
  session:
    key: "dm:{principal.entity_id}"
    persona: atlas

# Group chat → channel-based
- name: group-session
  match:
    delivery:
      peer_kind: group
  session:
    key: "group:{delivery.channel}:{delivery.peer_id}"
    persona: atlas
```

> **Note:** The `unknown` principal type still exists for edge cases (missing sender_id, system errors), but it is not a normal routing state for DM sessions. See `../RUNTIME_ROUTING.md` for details.

### Progressive Identity Resolution

Because every sender gets an entity from first contact, session keys are entity-based from day one. Identity evolves through **entity merges** and **session aliasing**, not through a format change:

```
Day 1: Mom texts from iMessage
       → contact auto-created (imessage, +15559876543)
       → entity auto-created: ent_001 (type=phone, name="imessage:+15559876543")
       → session key: "dm:ent_001"

Day 3: Memory-writer discovers real name ("that's my Mom, Sarah")
       → creates person entity: ent_002 (type=person, name="Sarah")
       → merges ent_001 into ent_002
       → propagateMergeToSessions() creates alias: "dm:ent_002" → "dm:ent_001"
       → future messages route via alias to existing session

Day 7: Mom emails from mom@gmail.com
       → contact auto-created (gmail, mom@gmail.com)
       → entity auto-created: ent_003 (type=email)
       → memory-writer recognizes same person → merges ent_003 into ent_002
       → propagateMergeToSessions() creates alias: "dm:ent_003" → "dm:ent_001"
       → all channels now converge on the same session
```

The Broker handles merges via **session aliases** (see Identity-Session Coupling below). Turn trees are never merged — memory bridges knowledge across sessions.

---

## Session Creation

### When

Sessions are created **eagerly** at stage 5 (`assembleContext`) by the Broker. The Broker needs the session row to exist for queue management — you can't lock a session that doesn't have a row yet.

### Flow

```
Stage 3 (resolveAccess): ACL produces routing.session_label
Stage 5 (assembleContext): Broker resolves session
    │
    ├── Lookup session by label
    │     Found → use it, acquire lock
    │     Not found → check aliases
    │         Alias found → use aliased session, acquire lock  
    │         No alias → CREATE new session
    │
    ├── Resolve thread head from session.thread_id
    │     Session is new → thread_id is null, this will be the root turn
    │     Session exists → thread_id points to latest turn
    │
    └── Proceed with context assembly
```

### New Session Insert

```sql
INSERT INTO sessions (label, thread_id, persona_id, routing_key, origin, created_at, updated_at, status)
VALUES (?, NULL, ?, ?, ?, ?, ?, 'active');
```

`thread_id` starts as NULL for brand new sessions. After the first turn completes, it points to that turn's thread.

---

## Identity-Session Coupling

### Architecture

Identity resolution uses two systems working at different speeds:

- **Contacts table** (`identity.db`): Pipeline-speed lookup. Maps `(channel, sender_id)` to an `entity_id`. Updated synchronously on every inbound message. Zero LLM, sub-millisecond.
- **Entity store** (`cortex.db`): Knowledge-speed resolution. Entities with union-find (`merged_into` chains) handle progressive identity resolution. The memory-writer merges entities asynchronously as it learns who people are.

The pipeline crosses both databases on every message: contact lookup in `identity.db`, then merged_into chain walk in `cortex.db` to find the canonical entity. Both are local SQLite, no network hop.

### Session Aliases on Entity Merge

When the memory-writer (or any agent) merges two entities, `propagateMergeToSessions()` is called **synchronously** from the merge operation. This function creates session aliases so that the new canonical session key resolves to the primary session.

```
Before merge:
  dm:ent_001 (iMessage session, 20 turns about project planning)
  dm:ent_003 (Gmail session, 5 turns about weekend plans)

Memory-writer merges ent_001 and ent_003 → canonical ent_002

propagateMergeToSessions() runs:
  1. Find DM sessions: dm:ent_001 (20 turns), dm:ent_003 (5 turns)
  2. Pick primary: dm:ent_001 (most turns)
  3. Create alias: dm:ent_002 → dm:ent_001
  4. Create alias: dm:ent_003 → dm:ent_001

After merge:
  Next message from Gmail:
    Contact (gmail, mom@gmail.com) → ent_003 → merged_into → ent_002
    Session key: dm:ent_002 → alias → dm:ent_001
    Memory-reader finds facts from both conversations
    Agent responds via Gmail adapter (outbound uses inbound delivery context)
```

**Turn trees are never merged.** Merging divergent conversation histories is lossy and complex. Non-primary sessions stop receiving new messages but their turn trees remain intact and queryable. Memory bridges the knowledge gap — facts extracted from all sessions are linked to the canonical entity and surfaced by the memory-reader.

See `../RUNTIME_ROUTING.md` for the full `propagateMergeToSessions()` implementation.

### Session Aliases Schema

```sql
CREATE TABLE session_aliases (
    alias TEXT PRIMARY KEY,              -- The alternative session key
    session_label TEXT NOT NULL,         -- The canonical session it resolves to
    created_at INTEGER NOT NULL,
    reason TEXT,                         -- 'identity_merge' | 'manual'
    
    FOREIGN KEY (session_label) REFERENCES sessions(label)
);

CREATE INDEX idx_session_aliases_target ON session_aliases(session_label);
```

### Lookup Order

```typescript
async function resolveSession(label: string): Promise<Session | null> {
  // 1. Direct lookup
  const session = await db.get('SELECT * FROM sessions WHERE label = ?', label);
  if (session) return session;
  
  // 2. Alias lookup
  const alias = await db.get('SELECT * FROM session_aliases WHERE alias = ?', label);
  if (alias) return db.get('SELECT * FROM sessions WHERE label = ?', alias.session_label);
  
  // 3. Not found — caller should create
  return null;
}
```

---

## Turn Processing

### Serial Execution

Sessions process one message at a time. This is the most important invariant.

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

### Processing Lock

The Broker acquires a per-session lock before execution. Implementation options:
- **In-memory mutex** (sufficient for single-process NEX)
- **SQLite advisory lock** (if multi-process needed later)

### Pointer Update

After every turn completion:

```sql
-- Single transaction
BEGIN;

-- Write turn, messages, tool_calls, thread (see AGENT_ENGINE.md)
INSERT INTO turns (...) VALUES (...);
INSERT INTO messages (...) VALUES (...);
INSERT INTO threads (...) VALUES (...);

-- Update session pointer
UPDATE sessions SET thread_id = ?, updated_at = ? WHERE label = ?;

-- Log pointer movement
INSERT INTO session_history (session_label, thread_id, changed_at) VALUES (?, ?, ?);

COMMIT;
```

### Turn Lifecycle

```
idle → processing → streaming → completing → idle
                       │
                       └→ compacting → streaming (retry) → completing → idle
```

| State | Description |
|-------|-------------|
| `idle` | No active run, ready for messages |
| `processing` | Context assembly in progress |
| `streaming` | Agent generating tokens, streaming to adapter |
| `compacting` | Context overflow, running compaction |
| `completing` | Writing AgentResult to ledger, updating pointer |

---

## Queue Management

### Queue Modes

How messages are handled when a session is busy:

| Mode | During Active Run | After Run Ends | Default For |
|------|-------------------|----------------|-------------|
| `interrupt` | Abort active run (preempt) | Drain backlog into next run | User → MA |
| `steer` | Abort active run (preempt) | Drain backlog into next run | — |
| `followup` | Queue message | Process next from queue | WA → MA, Timer → MA |
| `collect` | Queue message | Batch all queued into one turn (events-based) | — |
| `queue` | Queue message | Process FIFO | General default |

### Default Queue Modes

| Source → Target | Default Mode | Rationale |
|-----------------|-------------|-----------|
| User → MA | `interrupt` | New user message should cancel stale generation |
| WA → MA | `followup` | Don't interrupt MA for worker status updates |
| Timer/Automation → MA | `followup` | Don't interrupt for periodic checks |
| MA → WA | `agent_send(op=dispatch)` | Async, durable dispatch; results flow back via worker_result events |

### MA Dispatch Semantics (v1)

In v1 (pre-smart-forking), the MA only reasons about sessions:

- `agent_send(op="dispatch", target.session=...)` -> enqueue task on that existing session
- `agent_send(op="dispatch")` with no target session -> spawn a new worker session (`worker:{ulid}`)
- MA does not choose turn-level fork points directly

Turn/thread-level fork targeting is reserved for Broker smart routing (v2), which may decide to fork from a historical checkpoint before delivering work.

### Queue Drain

When a turn completes and the queue has messages:

```
Turn completes → release lock → check queue
    │
    ├── Queue empty → session goes idle
    │
    ├── Mode: followup/queue → take next message
    │     Create new NexusRequest (re-enter at stage 5, skip stages 1-4)
    │     Fresh assembleContext with updated session head
    │     Process turn → repeat
    │
    └── Mode: collect → take ALL queued messages
          Batch into single turn (multiple query messages)
          Fresh assembleContext
          Process turn → done
```

**Key:** Queued messages get fresh context assembly. The session head has advanced since they were queued, so the agent sees the result of the prior turn.

**Preemptive modes (`interrupt`/`steer`):** If a new message arrives while a run is active, the Broker aborts the active run and the queue drains the backlog (queued messages + the new message) into a single `queue_batch` turn that runs next.

**Queue storage:** Durable write-through to the Agents Ledger (`queue_items`) with startup rehydration. In-memory scheduling is a performance optimization, not the source of truth.

---

## Compaction

### Approach

Nexus wraps `pi-coding-agent`, which has built-in compaction. We don't reinvent the algorithm — we configure it and capture rich metadata.

### What pi-coding-agent Handles

- Detecting context overflow (token count vs context window)
- Deciding what to summarize vs keep (token-budget-based, not turn-count-based)
- Generating the summary via LLM
- Rebuilding context with summary + kept messages

### What We Add

**1. Proactive budget check (before calling pi-agent)**

```typescript
// At assembleContext, before sending to agent engine
const estimatedTokens = systemPromptTokens + historyTokens + eventTokens;
if (estimatedTokens > modelLimit * 0.85) {
  // Trigger compaction before execution, not during
  await triggerCompaction(sessionLabel);
  // Re-read history after compaction
  history = await buildHistoryMessages(threadId);
}
```

This avoids wasted API calls from sending too-large context to the LLM.

**2. Rich metadata capture**

When compaction completes (whether proactive or pi-agent-triggered), we capture:

```sql
INSERT INTO compactions (
  turn_id, summary, summarized_through_turn_id, first_kept_turn_id,
  turns_summarized, compaction_type, model, provider,
  tokens_before, tokens_after, summary_tokens,
  summarization_input_tokens, summarization_output_tokens,
  duration_ms, trigger, metadata_json
) VALUES (...);
```

**3. Compaction as a turn**

The compaction summary becomes a turn in the tree (turn_type = 'compaction'). This preserves the full history — compaction doesn't delete anything, just marks a context boundary.

### Configuration

| Parameter | Default | Notes |
|-----------|---------|-------|
| Proactive threshold | 85% of model limit | Trigger proactive compaction before this |
| Summarization model | Session model | Same model by default, configurable to cheaper |
| Reactive fallback | Yes (1 retry) | If pi-agent hits overflow, compact and retry |

### Manual Compaction

The agent can trigger compaction via a tool or slash command:

```
/compact                           # Compact with default instructions
/compact Focus on decisions made   # Compact with specific focus
```

This creates a compaction turn like any other, just with `trigger: 'manual'`.

---

## Forking

### What Is Forking?

Creating a new session that branches from an existing turn. Like `git checkout -b` from a specific commit.

```
Turn A → Turn B → Turn X → Turn Y (session "main")
                  └──→ Turn Z (session "fork-abc")
```

### When It Happens

- **Explicit fork:** Agent or user wants to explore an alternative from a specific point
- **Entity merge:** Could technically be a fork, but we use aliases instead (see above)

### Dispatch Targeting Contract (Forward-Compatible)

```typescript
type DispatchTarget =
  | { kind: "session"; session: string }                     // v1: send to existing session
  | { kind: "new_session"; labelHint?: string }              // v1: spawn worker session
  | { kind: "fork"; fromTurnId: string; labelHint?: string } // v2: true fork from checkpoint
```

`kind: "fork"` always creates a new session. Routing to an existing session and routing to a historical turn are intentionally distinct operations.

### Fork Flow

```typescript
async function forkFromTurn(turnId: string, label?: string): Promise<Session> {
  const newLabel = label ?? `fork-${generateULID()}`;
  
  await db.run(`
    INSERT INTO sessions (label, thread_id, persona_id, origin, created_at, updated_at, status)
    SELECT ?, ?, persona_id, 'fork', ?, ?, 'active'
    FROM threads WHERE turn_id = ?
  `, [newLabel, turnId, Date.now(), Date.now(), turnId]);
  
  return db.get('SELECT * FROM sessions WHERE label = ?', newLabel);
}
```

### Fork Rules

1. **Any turn is forkable** — even turns that already have children
2. **Forked session is independent** — it has its own label and pointer
3. **History is shared** — the fork sees all ancestor turns (they're in the same tree)
4. **Persona is inherited** — fork gets the same persona as the original thread

---

## Subagent Sessions

### Creation

When an MA spawns a WA via `agent_send` (`op="dispatch"`):

```sql
INSERT INTO sessions (
  label, thread_id, persona_id,
  is_subagent, parent_session_label, parent_turn_id, spawn_tool_call_id,
  task_description, task_status,
  origin, created_at, updated_at, status
) VALUES (
  'worker:{ulid}', NULL, ?,
  1, ?, ?, ?,
  ?, 'running',
  'subagent', ?, ?, 'active'
);
```

### Subagent Lifecycle

```
MA calls agent_send(op="dispatch")
  → Broker enqueues worker request (durable)
    - target session provided: route to that session queue
    - no target session: create worker session then queue
  → WA session is ensured during worker pipeline execution (assembleContext)
  → Context Assembly for WA (stripped-down system prompt, task-focused)
  → WA executes (may take many turns)
  → WA completion is delivered upstream as a `worker_result` event to the parent session
    → MA can inspect logs/traces and respond to the user
  → WA marks task complete (task_status: 'completed')
```

### Parent-Child Linking

```
sessions table:
  MA session: label="main", thread_id=turn_47
  WA session: label="worker:abc", parent_session_label="main", parent_turn_id=turn_45

turns table:
  turn_45 (MA): tool_call with spawned_session_label="worker:abc"
  
tool_calls table:
  tc_xyz: turn_id=turn_45, tool_name="agent_send", op="dispatch", spawned_session="worker:abc"
```

This enables:
- **Forward lookup:** "What workers did this MA turn spawn?" → tool_calls WHERE turn_id = X
- **Reverse lookup:** "Who is this worker's parent?" → sessions.parent_session_label

---

## Session Lifecycle Summary

```
                    ┌──────────────────────────────┐
                    │        SESSION CREATED         │
                    │   (eager, at assembleContext)  │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │         FIRST TURN            │
                    │  thread_id: NULL → turn_1     │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
              ┌────────────────────────────────────────┐
              │              ACTIVE                      │
              │                                          │
              │  Turn processing (serial, locked)       │
              │  Queue management (per queue mode)      │
              │  Pointer advances after each turn       │
              │  Compaction when context is tight        │
              │                                          │
              │  May be forked → creates new session    │
              │  May be aliased → entity merge           │
              │  May spawn subagents → child sessions   │
              └────────────────────────────────────────┘
```

---

## Related Documents

- `../RUNTIME_ROUTING.md` — Canonical routing spec: contacts, identity resolution, session key generation, entity merge propagation
- `DATA_MODEL.md` — Ontology: Session, Turn, Thread, Compaction definitions
- `OVERVIEW.md` — Broker architecture, routing hierarchy
- `AGENT_ENGINE.md` — Agent execution, CompactionResult, subagent spawning
- `CONTEXT_ASSEMBLY.md` — Compaction-aware history building, token budget
- `AGENTS.md` — Manager-Worker Pattern, inter-agent communication
- `../../data/ledgers/AGENTS_LEDGER.md` — Schema for sessions, threads, compactions, session_history
- `../../runtime/nex/NEXUS_REQUEST.md` — Pipeline stages 3 (routing) and 5 (session resolution)
- `../../runtime/iam/ACCESS_CONTROL_SYSTEM.md` — ACL policies that produce session keys

---

*This document defines the complete session lifecycle for Nexus. It unifies session concepts from DATA_MODEL, OVERVIEW, CONTEXT_ASSEMBLY, and AGENT_ENGINE into a single reference.*
