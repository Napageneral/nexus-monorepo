# Agents Ledger Schema

**Status:** DESIGN COMPLETE  
**Last Updated:** 2026-02-02

---

## Overview

The Agents Ledger is the permanent record of all AI conversations. It stores the complete history of sessions, turns, messages, and tool calls — enabling replay, forking, and audit.

---

## Entity Hierarchy

```
Session
  └── Turn (can branch into tree)
        ├── Message (user, assistant, system)
        └── ToolCall (with result)
```

- **Session**: A conversation container, linked to a persona
- **Turn**: One exchange (user message → agent response)
- **Message**: Individual message within a turn
- **ToolCall**: Tool invocation with parameters and result

---

## Schema

### Sessions

```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,              -- ULID
    persona TEXT NOT NULL,            -- Which agent persona
    
    -- Session routing
    routing_key TEXT NOT NULL,        -- IAM-assigned session key
    label TEXT,                       -- Human-friendly label
    
    -- Tree navigation
    root_turn_id TEXT,                -- First turn in session
    current_turn_id TEXT,             -- Active leaf turn
    
    -- Timing
    created_at INTEGER NOT NULL,      -- Unix ms
    updated_at INTEGER NOT NULL,      -- Last activity
    
    -- Status
    status TEXT NOT NULL DEFAULT 'active',  -- 'active', 'archived', 'deleted'
    
    -- Source event that created session
    source_event_id TEXT,             -- FK to events.id
    
    FOREIGN KEY (root_turn_id) REFERENCES turns(id),
    FOREIGN KEY (current_turn_id) REFERENCES turns(id)
);

CREATE INDEX idx_sessions_persona ON sessions(persona);
CREATE INDEX idx_sessions_routing_key ON sessions(routing_key);
CREATE INDEX idx_sessions_updated ON sessions(updated_at DESC);
```

### Turns

```sql
CREATE TABLE turns (
    id TEXT PRIMARY KEY,              -- ULID
    session_id TEXT NOT NULL,         -- Parent session
    
    -- Tree structure (enables forking)
    parent_turn_id TEXT,              -- Previous turn (null for root)
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'streaming', 'completed', 'failed'
    
    -- Timing
    started_at INTEGER NOT NULL,      -- When turn began
    completed_at INTEGER,             -- When turn finished
    
    -- Token usage
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    
    -- Model info
    model TEXT,                       -- Model used
    
    -- Source
    source_event_id TEXT,             -- Event that triggered this turn
    
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (parent_turn_id) REFERENCES turns(id)
);

CREATE INDEX idx_turns_session ON turns(session_id);
CREATE INDEX idx_turns_parent ON turns(parent_turn_id);
CREATE INDEX idx_turns_started ON turns(started_at DESC);
```

### Messages

```sql
CREATE TABLE messages (
    id TEXT PRIMARY KEY,              -- ULID
    turn_id TEXT NOT NULL,            -- Parent turn
    
    -- Content
    role TEXT NOT NULL,               -- 'user', 'assistant', 'system'
    content TEXT NOT NULL,            -- Message content
    
    -- Ordering
    sequence INTEGER NOT NULL,        -- Order within turn
    
    -- Timing
    created_at INTEGER NOT NULL,
    
    FOREIGN KEY (turn_id) REFERENCES turns(id)
);

CREATE INDEX idx_messages_turn ON messages(turn_id, sequence);
```

### Tool Calls

```sql
CREATE TABLE tool_calls (
    id TEXT PRIMARY KEY,              -- ULID
    turn_id TEXT NOT NULL,            -- Parent turn
    
    -- Tool info
    tool_name TEXT NOT NULL,
    parameters TEXT NOT NULL,         -- JSON
    
    -- Result
    result TEXT,                      -- JSON
    error TEXT,                       -- Error message if failed
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'completed', 'failed'
    
    -- Timing
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    
    -- Ordering
    sequence INTEGER NOT NULL,        -- Order within turn
    
    FOREIGN KEY (turn_id) REFERENCES turns(id)
);

CREATE INDEX idx_tool_calls_turn ON tool_calls(turn_id, sequence);
CREATE INDEX idx_tool_calls_tool ON tool_calls(tool_name);
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

The `current_turn_id` on Session points to the active leaf.

---

## Example Data

### Session

```json
{
    "id": "01HQXYZ001",
    "persona": "atlas",
    "routing_key": "imessage:+15551234567:default",
    "label": "Mom - General",
    "root_turn_id": "01HQXYZ100",
    "current_turn_id": "01HQXYZ103",
    "created_at": 1706889600000,
    "updated_at": 1706889900000,
    "status": "active",
    "source_event_id": "imessage:p:+15551234567/1234567890"
}
```

### Turn

```json
{
    "id": "01HQXYZ103",
    "session_id": "01HQXYZ001",
    "parent_turn_id": "01HQXYZ102",
    "status": "completed",
    "started_at": 1706889800000,
    "completed_at": 1706889805000,
    "prompt_tokens": 1250,
    "completion_tokens": 87,
    "total_tokens": 1337,
    "model": "claude-sonnet-4-20250514",
    "source_event_id": "imessage:p:+15551234567/1234567899"
}
```

### Messages in a Turn

```json
[
    {
        "id": "01HQXYZ103M1",
        "turn_id": "01HQXYZ103",
        "role": "user",
        "content": "What's the 2FA code from Amazon?",
        "sequence": 1,
        "created_at": 1706889800000
    },
    {
        "id": "01HQXYZ103M2",
        "turn_id": "01HQXYZ103",
        "role": "assistant",
        "content": "The 2FA code from Amazon is 847291. It expires in 8 minutes.",
        "sequence": 2,
        "created_at": 1706889805000
    }
]
```

### Tool Call

```json
{
    "id": "01HQXYZ103T1",
    "turn_id": "01HQXYZ103",
    "tool_name": "gog",
    "parameters": "{\"action\": \"search\", \"query\": \"from:amazon subject:verification code\"}",
    "result": "{\"messages\": [{\"subject\": \"Amazon: 847291 is your code\", \"snippet\": \"...\"}]}",
    "status": "completed",
    "started_at": 1706889801000,
    "completed_at": 1706889803000,
    "sequence": 1
}
```

---

## Invariants

1. **Append-only** — Turns and messages never deleted (mark as archived)
2. **Tree integrity** — Every turn (except root) has valid parent
3. **Session pointer** — `current_turn_id` always points to valid leaf
4. **Ordered messages** — Messages within turn ordered by sequence
5. **Complete tool calls** — Every completed turn has tool calls resolved

---

## Broker Writes Directly

The Broker writes directly to the Agents Ledger — no intermediate JSONL files. This:
- Avoids sync loops with AIX (IDE sessions)
- Ensures single source of truth
- Enables real-time session queries

---

## Related Documents

- `README.md` — System of Record overview
- `../broker/ONTOLOGY.md` — Session/Turn/Message concepts
- `../broker/SESSION_FORMAT.md` — Session format details
- `../nex/INTERFACES.md` — LedgerWrite interface contract
