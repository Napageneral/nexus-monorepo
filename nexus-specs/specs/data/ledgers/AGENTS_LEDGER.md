# Agents Ledger Schema

**Status:** DESIGN SPEC  
**Last Updated:** 2026-02-05

---

## Overview

The Agents Ledger is the permanent record of all AI conversations. It stores the complete history of sessions, turns, messages, and tool calls — enabling replay, forking, and audit.

**Design Philosophy:** Follows the DATA_MODEL.md structure where turns form a tree and sessions are stable pointers to thread heads. Incorporates rich metadata from AIX for full-fidelity capture.

---

## Entity Hierarchy

```
Session (stable pointer)
  └── Thread (view of turn + ancestry)
        └── Turn (can branch into tree)
              ├── Message (user, assistant, system)
              │     ├── File reference (message_files)
              │     ├── Lint snapshot (message_lints)
              │     └── Code block (message_codeblocks)
              ├── Tool Call (with result)
              └── Compaction details (if turn_type = 'compaction')

Session History (append-only log of session pointer movements)
```

- **Session**: Stable label pointing to current thread head
- **Thread**: A turn viewed with all its ancestry (denormalized for queries)
- **Turn**: One exchange (query → response), the key addressable unit
- **Message**: Individual message within a turn
- **Tool Call**: Tool invocation with parameters and result
- **Compaction**: Rich record of a summarization operation (separate table)
- **Session History**: Log of every session pointer advance

---

## Schema

### Turns

The primary table. Turns form a tree via `parent_turn_id`.

```sql
CREATE TABLE turns (
    id TEXT PRIMARY KEY,              -- ULID
    parent_turn_id TEXT,              -- Previous turn (null for root)
    
    -- Turn type
    turn_type TEXT NOT NULL DEFAULT 'normal',  -- 'normal' | 'compaction'
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'streaming' | 'completed' | 'failed'
    
    -- Timing (Unix ms)
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    
    -- Model/Provider (what was used for this turn)
    model TEXT,
    provider TEXT,                    -- 'anthropic' | 'openai' | 'google' | etc.
    
    -- Role (what type of agent)
    role TEXT NOT NULL DEFAULT 'unified',  -- 'manager' | 'worker' | 'unified'
    
    -- Toolset and Permissions (snapshot of what was available)
    toolset_name TEXT,                -- Named toolset: 'manager' | 'worker' | 'full' | custom
    tools_available TEXT,             -- JSON array of tool names actually available
    permissions_granted TEXT,         -- JSON of IAM permissions applied
    permissions_used TEXT,            -- JSON of IAM permissions actually exercised
    
    -- Token usage (for this turn only)
    input_tokens INTEGER,
    output_tokens INTEGER,
    cached_input_tokens INTEGER,      -- Cache reads
    cache_write_tokens INTEGER,       -- Cache writes
    reasoning_tokens INTEGER,         -- Extended thinking tokens
    total_tokens INTEGER,             -- Sum total
    
    -- Message tracking (denormalized for fast lookup)
    query_message_ids TEXT,           -- JSON array of input message IDs
    response_message_id TEXT,         -- Final assistant message ID
    
    -- Tree structure
    has_children INTEGER DEFAULT 0,   -- Has this turn been forked from?
    tool_call_count INTEGER DEFAULT 0,
    
    -- Source tracking
    source_event_id TEXT,             -- NEX event that triggered this turn
    workspace_path TEXT,              -- Workspace root (supports future sandboxing)
    
    FOREIGN KEY (parent_turn_id) REFERENCES turns(id)
);

CREATE INDEX idx_turns_parent ON turns(parent_turn_id);
CREATE INDEX idx_turns_type ON turns(turn_type);
CREATE INDEX idx_turns_status ON turns(status);
CREATE INDEX idx_turns_started ON turns(started_at DESC);
CREATE INDEX idx_turns_has_children ON turns(has_children);
CREATE INDEX idx_turns_role ON turns(role);
CREATE INDEX idx_turns_source_event ON turns(source_event_id);
```

**Status values:**
- `pending`: Turn created, agent not yet started
- `streaming`: Agent actively generating response
- `completed`: Agent finished successfully
- `failed`: Agent errored out

**Note:** Turns do NOT have a `session_id`. A turn can appear in the ancestry of multiple sessions (via forking). The session → turn relationship is captured through threads and session_history.

---

### Threads

Denormalized view of turn + ancestry. One thread per turn.

```sql
CREATE TABLE threads (
    turn_id TEXT PRIMARY KEY,         -- Same as the turn it represents
    
    -- Accumulated data (denormalized for fast queries)
    ancestry TEXT,                    -- JSON array of turn IDs from root to this turn
    total_tokens INTEGER,             -- Sum of all ancestor turn tokens
    depth INTEGER,                    -- How many turns deep
    
    -- Config applied to this thread
    persona_id TEXT,                  -- Identity & permissions bundle
    system_prompt_hash TEXT,          -- Hash of system prompt (for cache tracking)
    
    -- Routing
    thread_key TEXT UNIQUE,           -- Structured key for addressing
    
    FOREIGN KEY (turn_id) REFERENCES turns(id)
);

CREATE INDEX idx_threads_key ON threads(thread_key);
CREATE INDEX idx_threads_persona ON threads(persona_id);
```

---

### Sessions

Stable labels pointing to thread heads. Sessions are pointers, not containers.

```sql
CREATE TABLE sessions (
    label TEXT PRIMARY KEY,           -- Stable identifier (e.g., "main", "code-worker-1")
    thread_id TEXT NOT NULL,          -- Current thread head
    
    -- Persona
    persona_id TEXT NOT NULL,         -- Which persona owns this session
    
    -- Subagent tracking (only if this session is a subagent)
    is_subagent INTEGER DEFAULT 0,
    parent_session_label TEXT,        -- Parent session that spawned this
    parent_turn_id TEXT,              -- Turn in parent where spawn happened
    spawn_tool_call_id TEXT,          -- Tool call ID linking parent → child
    task_description TEXT,            -- Task description from spawn
    task_status TEXT,                 -- 'pending' | 'running' | 'completed' | 'failed'
    
    -- Routing context
    routing_key TEXT,                 -- IAM-assigned routing key
    
    -- Origin tracking (where this session came from)
    origin TEXT,                      -- 'nexus' | 'cursor' | 'claude-code'
    origin_session_id TEXT,           -- Original ID if imported (e.g., Cursor composerId)
    
    -- Timing
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'archived' | 'deleted'
    
    FOREIGN KEY (thread_id) REFERENCES threads(turn_id),
    FOREIGN KEY (parent_turn_id) REFERENCES turns(id)
);

CREATE INDEX idx_sessions_persona ON sessions(persona_id);
CREATE INDEX idx_sessions_routing ON sessions(routing_key);
CREATE INDEX idx_sessions_updated ON sessions(updated_at DESC);
CREATE INDEX idx_sessions_parent ON sessions(parent_session_label);
CREATE INDEX idx_sessions_origin ON sessions(origin);
```

---

### Messages

Individual messages within turns.

```sql
CREATE TABLE messages (
    id TEXT PRIMARY KEY,              -- ULID
    turn_id TEXT NOT NULL,            -- Parent turn
    
    -- Content
    role TEXT NOT NULL,               -- 'user' | 'assistant' | 'system' | 'tool'
    content TEXT,                     -- Message content (may be null for tool results)
    
    -- Source (for non-assistant messages)
    source TEXT,                      -- 'human' | 'trigger' | 'agent' | 'webhook' | 'cron' | 'event'
    
    -- Ordering
    sequence INTEGER NOT NULL,        -- Order within turn
    
    -- Timing
    created_at INTEGER NOT NULL,
    
    -- Rich metadata
    thinking TEXT,                    -- Extended thinking content (if applicable)
    context_json TEXT,                -- Context snapshot: assembled context, cortex injections, attached files
    metadata_json TEXT,               -- Catch-all for additional metadata
    
    FOREIGN KEY (turn_id) REFERENCES turns(id)
);

CREATE INDEX idx_messages_turn ON messages(turn_id, sequence);
CREATE INDEX idx_messages_role ON messages(role);
```

**`context_json` is the primary place for context tracking.** This captures what context was injected into or attached to each message:
- On system messages: workspace rules, persona identity, assembled context from Context Assembly
- On user messages: event context, hook injections, user-attached file context
- On assistant messages: typically null (assistant generates, doesn't receive context)

This keeps context tracking at the level where it actually applies — the message that carries it.

---

### Tool Calls

Tool invocations within turns.

```sql
CREATE TABLE tool_calls (
    id TEXT PRIMARY KEY,              -- Tool call ID (from LLM or generated)
    turn_id TEXT NOT NULL,            -- Parent turn
    message_id TEXT,                  -- Assistant message that made this call
    
    -- Tool info
    tool_name TEXT NOT NULL,
    tool_number INTEGER,              -- Numeric tool ID (if applicable)
    params_json TEXT NOT NULL,        -- Parameters as JSON
    
    -- Result
    result_json TEXT,                 -- Result as JSON
    error TEXT,                       -- Error message if failed
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'running' | 'completed' | 'failed'
    
    -- Subagent spawning
    spawned_session_label TEXT,       -- Session label if this tool spawned a subagent
    
    -- Timing
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    
    -- Ordering
    sequence INTEGER NOT NULL,        -- Order within turn
    
    FOREIGN KEY (turn_id) REFERENCES turns(id),
    FOREIGN KEY (message_id) REFERENCES messages(id)
);

CREATE INDEX idx_tool_calls_turn ON tool_calls(turn_id, sequence);
CREATE INDEX idx_tool_calls_tool ON tool_calls(tool_name);
CREATE INDEX idx_tool_calls_message ON tool_calls(message_id);
CREATE INDEX idx_tool_calls_spawned ON tool_calls(spawned_session_label);
```

---

### Compactions

Rich record of compaction operations. One row per compaction turn.

Compaction is important enough to be first-class — different strategies, models, and economics need proper tracking.

```sql
CREATE TABLE compactions (
    turn_id TEXT PRIMARY KEY,                    -- The compaction turn (FK to turns)
    
    -- What was summarized
    summary TEXT NOT NULL,                       -- LLM-generated summary of prior turns
    summarized_through_turn_id TEXT NOT NULL,    -- Last turn included in summary
    first_kept_turn_id TEXT,                     -- First turn kept in fresh context
    turns_summarized INTEGER,                    -- Count of turns that were summarized
    
    -- Strategy
    compaction_type TEXT NOT NULL DEFAULT 'summary',  -- 'summary' | 'sliding_window' | 'selective' | ...
    
    -- Model used for summarization
    -- (May differ from session model — e.g., use a cheaper model for summaries)
    model TEXT NOT NULL,
    provider TEXT,
    
    -- Token metrics: the compaction's impact on context
    tokens_before INTEGER,                       -- Total context tokens before compaction
    tokens_after INTEGER,                        -- Total context tokens after compaction
    summary_tokens INTEGER,                      -- Tokens in the generated summary
    
    -- Token metrics: the summarization call itself
    summarization_input_tokens INTEGER,          -- Tokens sent to summarizer
    summarization_output_tokens INTEGER,         -- Tokens received from summarizer
    
    -- Performance
    duration_ms INTEGER,                         -- How long summarization took
    
    -- Why it happened
    trigger TEXT,                                 -- 'context_limit' | 'manual' | 'periodic'
    
    -- Extensible
    metadata_json TEXT,                          -- Strategy params, version info, etc.
    
    FOREIGN KEY (turn_id) REFERENCES turns(id),
    FOREIGN KEY (summarized_through_turn_id) REFERENCES turns(id),
    FOREIGN KEY (first_kept_turn_id) REFERENCES turns(id)
);
```

**Compaction types:**
- `summary`: LLM summarizes old turns into prose (default, what upstream does)
- `sliding_window`: Drop oldest turns without summarization
- `selective`: Summarize selectively based on relevance
- Future types as needed — `metadata_json` captures strategy-specific params

---

### Session History

Append-only log of session pointer movements. Records every time a session advances to a new thread head.

```sql
CREATE TABLE session_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_label TEXT NOT NULL,
    thread_id TEXT NOT NULL,          -- Thread head the session pointed to
    changed_at INTEGER NOT NULL,      -- When the pointer moved (Unix ms)
    
    FOREIGN KEY (session_label) REFERENCES sessions(label),
    FOREIGN KEY (thread_id) REFERENCES threads(turn_id)
);

CREATE INDEX idx_session_history_label ON session_history(session_label, changed_at DESC);
CREATE INDEX idx_session_history_thread ON session_history(thread_id);
```

This enables:
- **Forward lookup:** "What was session X's head at time T?" — scan history by label
- **Reverse lookup:** "Which sessions have included turn Y?" — find threads containing Y in ancestry, then find session_history entries pointing to those threads
- **Session timeline:** Full history of a session's evolution, including forks and replays

---

### Session Aliases

Maps alternative session keys to canonical sessions. Used for identity promotion (channel-based → entity-based) and identity merge scenarios.

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

This enables:
- **Identity promotion:** Unknown sender gets entity-based key after identity resolution → alias to existing channel-based session
- **Identity merge:** Two channel-based sessions discovered to be same entity → alias entity key to primary session
- **Lookup order:** Direct session lookup → alias lookup → create new

See `../../runtime/broker/SESSION_LIFECYCLE.md` for the full identity-session coupling design.

---

### Auxiliary Tables

Rich context capture at the message level for replay and analysis.

#### Message Files

Files referenced/modified, tracked per-message.

```sql
CREATE TABLE message_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT NOT NULL,
    
    kind TEXT NOT NULL,               -- 'read' | 'written' | 'referenced' | 'attached'
    file_path TEXT NOT NULL,
    line_start INTEGER,               -- Optional line range
    line_end INTEGER,
    
    FOREIGN KEY (message_id) REFERENCES messages(id),
    UNIQUE(message_id, kind, file_path, line_start)
);

CREATE INDEX idx_message_files_message ON message_files(message_id);
CREATE INDEX idx_message_files_path ON message_files(file_path);
```

#### Message Lints

Linter errors visible at the time of a message.

```sql
CREATE TABLE message_lints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT NOT NULL,
    
    file_path TEXT,
    message TEXT,
    lint_source TEXT,                  -- Linter source (eslint, pyright, etc.)
    start_line INTEGER,
    start_col INTEGER,
    end_line INTEGER,
    end_col INTEGER,
    severity TEXT,                    -- 'error' | 'warning' | 'info'
    
    FOREIGN KEY (message_id) REFERENCES messages(id)
);

CREATE INDEX idx_message_lints_message ON message_lints(message_id);
```

#### Message Codeblocks

Code suggestions/outputs from assistant messages.

```sql
CREATE TABLE message_codeblocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT NOT NULL,
    
    idx INTEGER NOT NULL,             -- Order in message
    language TEXT,
    content TEXT NOT NULL,
    file_path TEXT,                   -- Target file if applicable
    line_start INTEGER,
    line_end INTEGER,
    
    FOREIGN KEY (message_id) REFERENCES messages(id),
    UNIQUE(message_id, idx)
);

CREATE INDEX idx_message_codeblocks_message ON message_codeblocks(message_id);
```

---

## Turn Tree (Forking)

Turns form a tree, not a list. This enables:
- **Branching**: Start new conversation path from any point
- **Smart forking**: Cortex finds optimal fork point
- **Rollback**: Return to earlier state without losing history

```
Turn 1 (root)
    └── Turn 2
          ├── Turn 3a (current branch)
          │     └── Turn 4a
          └── Turn 3b (alternate branch)
                └── Turn 4b
```

When a new turn extends Turn 2:
1. Insert new turn with `parent_turn_id = Turn 2`
2. Set `has_children = 1` on Turn 2
3. Create thread record with ancestry `[Turn 1, Turn 2, new turn]`
4. Update session pointer if this extends a labeled session

---

## Compaction as Turn Type

Compaction is a special turn that summarizes prior context. The turn itself lives in `turns` (with `turn_type = 'compaction'`), and the rich details live in `compactions`.

```
Before: Turn 1 → Turn 2 → Turn 3 → Turn 4 → Turn 5 (session head)

Trigger: Context approaching limit. Summarize 1-3, keep 4-5.

After:  Turn 1 → Turn 2 → Turn 3 → Turn 4 → Turn 5 → CompactionTurn (session head)
                                                            ↑
                                                  summary of 1-3
                                                  kept: 4, 5
```

**Two tables, one operation:**
- `turns`: The compaction turn record (parent linking, status, timing, model)
- `compactions`: The compaction details (summary text, scope, token metrics, strategy, trigger)

**Context assembly after compaction:**
- Agent sees: `[System prompt] + [Compaction summary] + [Kept turns] + [Current query]`
- Old turns still exist — just not in active context

---

## Role Definitions

Tracked per-turn to capture what type of agent processed the exchange.

| Role | Description |
|------|-------------|
| `manager` | Conversation-facing MA, orchestrates workers |
| `worker` | Task-focused WA, spawned by manager |
| `unified` | Single agent (no MA/WA split), e.g., harness agents |

Role affects:
- Toolset available
- Context injection
- Spawning capabilities
- Response expectations

---

## Toolset Tracking

Each turn captures the toolset that was available:

```sql
toolset_name TEXT,      -- Named toolset identifier
tools_available TEXT,   -- JSON array: ["Read", "Write", "Shell", "Task", ...]
permissions_granted TEXT,  -- IAM permissions snapshot
permissions_used TEXT,     -- Which permissions were actually exercised
```

This enables audit: "Did the agent use a tool it shouldn't have had access to?"

Named toolsets are defined elsewhere (IAM/config). The turn just logs what was in effect.

---

## Invariants

1. **Append-only** — Turns never deleted (mark status as archived/deleted)
2. **Tree integrity** — Every turn (except root) has valid parent
3. **Thread per turn** — Every turn gets a thread record
4. **Session is pointer** — Sessions point to thread, don't contain data
5. **Ordered messages** — Messages within turn ordered by sequence
6. **Complete tool calls** — Every completed turn has tool calls resolved
7. **Compaction preserves history** — Full turn chain always walkable
8. **Compaction has details** — Every `turn_type = 'compaction'` turn has a `compactions` row
9. **Session history logged** — Every session pointer movement gets a `session_history` entry

---

## On Every New Turn

```
1. INSERT turn (with parent_turn_id, role, toolset, etc.)
2. INSERT messages (query messages, then response)
3. INSERT tool_calls (in sequence order)
4. INSERT message_files, message_lints, message_codeblocks (if applicable)
5. IF turn_type = 'compaction': INSERT compactions record
6. UPDATE parent turn: has_children = 1
7. INSERT/UPDATE thread (ancestry, totals)
8. UPDATE session pointer: thread_id = new thread
9. INSERT session_history (log the pointer movement)
```

---

## Implementation Notes

**Turn IDs vs Message IDs:** DATA_MODEL.md defines "Turn ID = final assistant message ID" as a conceptual simplification. In the ledger, turns and messages have independent ULIDs. This is better for implementation — a turn can exist before its response message (e.g., during streaming, or if the turn fails). The `response_message_id` field provides the link.

**Sessions are materialized:** DATA_MODEL.md defines sessions as a derived concept (threads where head has no children). The ledger materializes them as a real table with subagent tracking, routing, origin, and status. This divergence is intentional — the conceptual model simplifies for understanding, the implementation adds operational fields.

---

## Broker Writes Directly

The Broker writes directly to the Agents Ledger — no intermediate JSONL files. This:
- Avoids sync loops with AIX (IDE sessions are imported, not synced)
- Ensures single source of truth for Nexus-native sessions
- Enables real-time session queries

**AIX imports remain separate** — Cursor/Claude Code sessions are imported into Agents Ledger via AIX, with `origin = 'cursor'` or `origin = 'claude-code'`.

---

## Related Documents

- `DATA_MODEL.md` — Core primitives (Message, Turn, Thread, Session)
- `SESSION_LIFECYCLE.md` — Session management, compaction, forking
- `../broker/CONTEXT_ASSEMBLY.md` — How context is built from ledger data
- `../broker/AGENTS.md` — Manager-Worker Pattern
- `../../nex/INTERFACES.md` — LedgerWrite interface contract
