# Session Lifecycle

**Status:** DESIGN SPEC  
**Last Updated:** 2026-02-06

---

## Overview

This document defines the complete lifecycle of agent sessions — from creation through turn processing, compaction, forking, and identity-based promotion. It stitches together the session-related concepts defined across DATA_MODEL.md, AGENTS_LEDGER.md, CONTEXT_ASSEMBLY.md, and OVERVIEW.md into one coherent flow.

**Key Insight:** Session keys are driven by identity resolution. Unknown senders get channel-based sessions. Known senders get entity-based sessions. The transition happens naturally as identities are resolved, with session aliases preserving history.

---

## Session Keys

### Format

Session keys are produced by ACL policies at stage 3 (`resolveAccess`). The format depends on the identity resolution level:

**Known sender (entity resolved):**
```
dm:{entity_id}                           # Entity-based DM (cross-channel)
```

**Unknown sender (no entity):**
```
dm:{channel}:{sender_id}                 # Channel-based DM (fallback)
```

**Groups (always channel-based):**
```
group:{channel}:{peer_id}                # Per-group session
group:{channel}:{peer_id}:thread:{id}    # Per-thread within group (if platform supports)
```

**Subagents:**
```
worker:{ulid}                            # Spawned worker (unique per spawn)
```

**System:**
```
system:{purpose}                         # System sessions (heartbeat, maintenance)
```

### ACL Policy Examples

```yaml
# Known sender → entity-based session
- name: known-dm
  match:
    principal:
      type: known
    delivery:
      peer_kind: dm
  session:
    key: "dm:{principal.entity_id}"
    persona: atlas

# Unknown sender → channel-based session  
- name: unknown-dm
  match:
    principal:
      type: unknown
    delivery:
      peer_kind: dm
  session:
    key: "dm:{delivery.channel}:{delivery.sender_id}"
    persona: atlas

# Group chat → always channel-based
- name: group-session
  match:
    delivery:
      peer_kind: group
  session:
    key: "group:{delivery.channel}:{delivery.peer_id}"
    persona: atlas
```

### Identity Promotion

When a previously unknown sender's identity gets resolved, the session key format changes:

```
Day 1: Mom texts (unknown) → key: "dm:imessage:+15559876543"
Day 3: Identity linked → entity_mom
Day 5: Mom texts (known)  → key: "dm:entity_mom"
```

The Broker handles this transition via **session aliases** (see Identity-Session Coupling below).

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

### The Problem

Identity resolution is progressive. A sender might be unknown on first contact, then later linked to an entity. When this happens, the ACL produces a different session key (entity-based vs channel-based). We need to route to the existing conversation, not create a new one.

### Solution: Session Aliases

When the Broker encounters a session key that doesn't exist, but finds a channel-based session for the same entity, it creates an alias:

```
Broker: lookup "dm:entity_mom" → not found
Broker: search sessions WHERE persona_id = 'atlas' 
        AND routing context matches entity_mom
Found: "dm:imessage:+15559876543" (channel-based session for same entity)
Action: INSERT alias "dm:entity_mom" → "dm:imessage:+15559876543"
```

Future lookups for "dm:entity_mom" resolve via the alias to the original session. Conversation history is preserved.

### Multi-Channel Identity Merge

When two channel-based sessions are discovered to belong to the same entity:

```
Session A: "dm:imessage:+15559876543"  (Mom on iMessage, 20 turns)
Session B: "dm:gmail:mom@gmail.com"    (Mom on Gmail, 5 turns)

Identity merge: both map to entity_mom
```

**Resolution:**
1. Pick the session with more history as **primary** (Session A)
2. Create alias: `"dm:entity_mom"` → `"dm:imessage:+15559876543"`
3. Session B continues to exist with its history but stops receiving new messages
4. All future messages from Mom (any channel) route to the primary session via alias
5. Cortex provides cross-session context — the agent can discover "you talked to Mom on email too"

**We do NOT merge turn trees.** Merging divergent conversation histories is lossy and complex. The old sessions are preserved in the ledger. Cortex bridges them when relevant.

### Session Aliases Schema

```sql
CREATE TABLE session_aliases (
    alias TEXT PRIMARY KEY,              -- The alternative session key
    session_label TEXT NOT NULL,         -- The canonical session it resolves to
    created_at INTEGER NOT NULL,
    reason TEXT,                         -- 'identity_promotion' | 'identity_merge' | 'manual'
    
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
| `interrupt` | Abort active run, start new | — | User → MA |
| `steer` | Inject into active context | Run normally | — |
| `followup` | Queue message | Process next from queue | WA → MA, Timer → MA |
| `collect` | Queue message | Batch all queued into one turn | — |
| `steer-backlog` | Try steer, queue if fails | Process queue | — |
| `queue` | Queue message | Process FIFO | General default |

### Default Queue Modes

| Source → Target | Default Mode | Rationale |
|-----------------|-------------|-----------|
| User → MA | `interrupt` | New user message should cancel stale generation |
| WA → MA | `followup` | Don't interrupt MA for worker status updates |
| Timer/Automation → MA | `followup` | Don't interrupt for periodic checks |
| MA → WA | Direct tool call | Synchronous within MA's turn |

### Queue Drain

When a turn completes and the queue has messages:

```
Turn completes → release lock → check queue
    │
    ├── Queue empty → session goes idle
    │
    ├── Mode: interrupt → (shouldn't have queue — interrupt cancels active)
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

**Queue storage:** In-memory for v1 (messages are small, sessions are single-process). Durable queue is a later optimization if needed.

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
- **Identity promotion:** Could technically be a fork, but we use aliases instead (see above)

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

When an MA spawns a WA via `dispatch_to_agent` tool:

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
MA calls dispatch_to_agent
  → Broker creates WA session (task_status: 'running')
  → Context Assembly for WA (stripped-down system prompt, task-focused)
  → WA executes (may take many turns)
  → WA calls send_message_to_agent({ to: "manager" })
    → New turn in MA's session (source: 'agent')
    → MA responds to user
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
  tc_xyz: turn_id=turn_45, tool_name="dispatch_to_agent", spawned_session="worker:abc"
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
              │  May be aliased → identity promotion    │
              │  May spawn subagents → child sessions   │
              └────────────────────────────────────────┘
```

---

## Related Documents

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
