# Nexus Ledger Schema

**Status:** DESIGN COMPLETE  
**Last Updated:** 2026-02-02

---

## Overview

The Nexus Ledger stores the complete trace of every `NexusRequest` as it flows through the NEX pipeline. Each stage populates more fields on the request object, and the ledger captures both intermediate states (upserts) and the final result.

**Purpose:**
- Debugging: See exactly what happened at each stage
- Audit: Complete trail of every event processed
- Replay: Reconstruct any request's journey
- Analytics: Pipeline performance, error rates, patterns

---

## Schema

```sql
CREATE TABLE nexus_requests (
    -- Primary key
    id TEXT PRIMARY KEY,              -- ULID, created at receiveEvent
    
    -- Source event
    event_id TEXT NOT NULL,           -- FK to events.id
    event_type TEXT NOT NULL,         -- 'message', 'email', 'timer', etc.
    event_source TEXT NOT NULL,       -- 'imessage', 'gmail', 'discord', etc.
    
    -- Pipeline state
    stage TEXT NOT NULL,              -- Current/final stage
    status TEXT NOT NULL,             -- 'processing', 'completed', 'failed', 'skipped'
    
    -- Identity (populated at resolveIdentity)
    principal_id TEXT,                -- Entity ID if resolved
    principal_type TEXT,              -- 'person', 'persona', 'system', 'unknown'
    principal_is_user BOOLEAN,        -- Is this the Nexus owner?
    
    -- Access (populated at resolveAccess)
    access_decision TEXT,             -- 'allow', 'deny'
    access_policy TEXT,               -- Which policy matched
    session_key TEXT,                 -- Routing key
    session_persona TEXT,             -- Target persona
    permissions TEXT,                 -- JSON: tools, credentials, data grants
    
    -- Hooks (populated at executeTriggers)
    hooks_matched TEXT,               -- JSON array of hook names that matched
    hooks_fired TEXT,                 -- JSON array of hooks that executed
    hooks_handled BOOLEAN,            -- Did a hook handle the event entirely?
    hooks_context TEXT,               -- JSON: extracted context from hooks
    
    -- Agent (populated at assembleContext + runAgent)
    turn_id TEXT,                     -- FK to turns.id (if agent ran)
    agent_model TEXT,                 -- Model used
    agent_tokens_prompt INTEGER,
    agent_tokens_completion INTEGER,
    agent_tokens_total INTEGER,
    agent_tool_calls TEXT,            -- JSON array of tool names called
    
    -- Delivery (populated at deliverResponse)
    delivery_channel TEXT,            -- Where response was sent
    delivery_message_ids TEXT,        -- JSON array of platform message IDs
    delivery_success BOOLEAN,
    delivery_error TEXT,              -- Error message if failed
    
    -- Timing
    started_at INTEGER NOT NULL,      -- When receiveEvent started
    completed_at INTEGER,             -- When finalize completed
    
    -- Stage timings (JSON object)
    stage_timings TEXT,               -- { "receiveEvent": 12, "resolveIdentity": 5, ... }
    
    -- Error tracking
    error_stage TEXT,                 -- Which stage failed
    error_message TEXT,               -- Error message
    error_stack TEXT,                 -- Stack trace
    
    -- Full request snapshot (for deep debugging)
    request_snapshot TEXT,            -- JSON: complete NexusRequest at finalize
    
    FOREIGN KEY (event_id) REFERENCES events(id),
    FOREIGN KEY (turn_id) REFERENCES turns(id)
);

-- Indexes for common queries
CREATE INDEX idx_nexus_requests_event ON nexus_requests(event_id);
CREATE INDEX idx_nexus_requests_status ON nexus_requests(status);
CREATE INDEX idx_nexus_requests_started ON nexus_requests(started_at DESC);
CREATE INDEX idx_nexus_requests_principal ON nexus_requests(principal_id);
CREATE INDEX idx_nexus_requests_session ON nexus_requests(session_key);
CREATE INDEX idx_nexus_requests_turn ON nexus_requests(turn_id);
CREATE INDEX idx_nexus_requests_stage ON nexus_requests(stage);
```

---

## Lifecycle

### 1. Created at `receiveEvent`

```sql
INSERT INTO nexus_requests (id, event_id, event_type, event_source, stage, status, started_at)
VALUES ('01HQ...', 'imessage:p:+1555.../123', 'message', 'imessage', 'receiveEvent', 'processing', 1706889600000);
```

### 2. Upserted at Each Stage

```sql
-- After resolveIdentity
UPDATE nexus_requests SET
    stage = 'resolveIdentity',
    principal_id = '01HQENT001',
    principal_type = 'person',
    principal_is_user = false
WHERE id = '01HQ...';

-- After resolveAccess
UPDATE nexus_requests SET
    stage = 'resolveAccess',
    access_decision = 'allow',
    access_policy = 'family-trusted',
    session_key = 'imessage:+15551234567:default',
    session_persona = 'atlas',
    permissions = '{"tools": {"allow": ["*"], "deny": ["bash"]}, ...}'
WHERE id = '01HQ...';

-- ... and so on for each stage
```

### 3. Finalized at `finalize`

```sql
UPDATE nexus_requests SET
    stage = 'finalize',
    status = 'completed',
    completed_at = 1706889601500,
    stage_timings = '{"receiveEvent": 12, "resolveIdentity": 5, "resolveAccess": 8, ...}',
    request_snapshot = '{...full NexusRequest JSON...}'
WHERE id = '01HQ...';
```

---

## Query Examples

### Recent Failed Requests

```sql
SELECT id, event_source, error_stage, error_message, started_at
FROM nexus_requests
WHERE status = 'failed'
ORDER BY started_at DESC
LIMIT 20;
```

### Pipeline Performance (Last Hour)

```sql
SELECT 
    stage,
    AVG(json_extract(stage_timings, '$.' || stage)) as avg_ms,
    MAX(json_extract(stage_timings, '$.' || stage)) as max_ms
FROM nexus_requests
WHERE started_at > (strftime('%s', 'now') * 1000 - 3600000)
  AND status = 'completed'
GROUP BY stage;
```

### Requests by Principal

```sql
SELECT 
    principal_id,
    COUNT(*) as request_count,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
    SUM(CASE WHEN hooks_handled THEN 1 ELSE 0 END) as hook_handled
FROM nexus_requests
WHERE started_at > (strftime('%s', 'now') * 1000 - 86400000)
GROUP BY principal_id
ORDER BY request_count DESC;
```

### Hook Effectiveness

```sql
SELECT 
    json_each.value as hook_name,
    COUNT(*) as times_fired,
    SUM(CASE WHEN hooks_handled THEN 1 ELSE 0 END) as times_handled
FROM nexus_requests, json_each(hooks_fired)
WHERE hooks_fired IS NOT NULL
GROUP BY json_each.value
ORDER BY times_fired DESC;
```

---

## Relationship to Other Ledgers

```
┌─────────────────────────────────────────────────────────────────┐
│                      SYSTEM OF RECORD                            │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │    Events    │  │    Agents    │  │      Identity        │  │
│  │    Ledger    │  │    Ledger    │  │       Graph          │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────┘  │
│         │                 │                                      │
│         │    ┌────────────┴────────────┐                        │
│         │    │                         │                        │
│         ▼    ▼                         │                        │
│  ┌─────────────────────────────────────┴─────────────────────┐  │
│  │                     NEXUS LEDGER                           │  │
│  │              (Pipeline Trace / Audit)                      │  │
│  │                                                            │  │
│  │  Links to: events.id, turns.id, entities.id               │  │
│  │  Contains: Full request trace from receiveEvent → finalize│  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Key insight:** The Nexus Ledger is the *observability layer* of the System of Record. It references the other ledgers but focuses on *how* requests were processed, not *what* the content was.

---

## Invariants

1. **One request per event** — Each event creates exactly one NexusRequest
2. **Stage progression** — Stages always progress forward (no going back)
3. **Upsert pattern** — Same row updated through lifecycle (not new rows)
4. **Always finalized** — Every request ends in `completed`, `failed`, or `skipped`
5. **Snapshot at end** — Full request JSON only stored at finalize (saves space)

---

## Retention Policy

Unlike the append-only Events and Agents ledgers, the Nexus Ledger can be pruned:

| Age | Action |
|-----|--------|
| < 7 days | Keep full request_snapshot |
| 7-30 days | Drop request_snapshot, keep summary fields |
| > 30 days | Archive to cold storage or delete |

This keeps the ledger performant for recent debugging while preserving long-term audit trail in the other ledgers.

---

## Related Documents

- `README.md` — System of Record overview
- `../nex/NEXUS_REQUEST.md` — NexusRequest schema
- `../nex/NEX.md` — Pipeline stages
