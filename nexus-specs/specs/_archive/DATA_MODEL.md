# Data Model Comparison

**Status:** COMPLETE  
**Last Updated:** 2026-02-04

---

## Executive Summary

**OpenClaw stores agent sessions. Nexus stores everything.**

This single difference unlocks the entire Nexus advantage: queryable history, cross-channel identity, auditable access control, and semantic context retrieval.

---

## The Fundamental Gap

| What Gets Stored | OpenClaw | Nexus |
|------------------|----------|-------|
| Agent sessions | ✅ JSONL files | ✅ Agents Ledger |
| All events | ❌ Processed and discarded | ✅ Events Ledger |
| Identity graph | ❌ Config-driven links | ✅ Identity Ledger |
| Pipeline traces | ❌ No audit trail | ✅ Nexus Ledger |
| Derived insights | ❌ In-flow memory only | ✅ Cortex layer |

**OpenClaw can't answer:** "What did Casey send me last week across all channels?"

**Nexus can:** Query the Events Ledger, join with Identity Ledger, filter by date.

---

## OpenClaw's Data Model

### What Exists

```
~/.openclaw/workspace/sessions/
├── sessions.json          # Metadata index (session key → SessionEntry)
└── {sessionId}.jsonl      # Transcript per session
```

**sessions.json** contains:
- Session ID and file path
- Last updated timestamp
- Token usage
- Model info
- Channel metadata
- Compaction count

**{sessionId}.jsonl** contains:
- Session header (version, cwd, timestamp)
- Messages (user, assistant, tool)
- Compaction summaries
- Custom plugin data

### What Doesn't Exist

1. **No Events Ledger**
   - Inbound messages are processed and discarded
   - Only agent sessions capture history
   - Can't query "all messages from Discord last month"

2. **No Identity Ledger**
   - Identity is config-driven (`identityLinks`)
   - No persistent graph of contacts → entities
   - Cross-channel linking is manual

3. **No Audit Trail**
   - No record of access decisions
   - No pipeline traces
   - Can't answer "why was this message blocked?"

4. **No Derived Layer**
   - Memory is in-flow (MEMORY.md, vector search during runs)
   - No async processing of historical data
   - No entity extraction, no facets, no embeddings

---

## Nexus Data Model

### System of Record (4 Ledgers)

All stored in `~/nexus/state/nexus.db` (SQLite):

#### 1. Events Ledger

**Every event, from every adapter, permanently.**

```sql
events (
  id TEXT PRIMARY KEY,
  timestamp INTEGER,
  adapter TEXT,           -- 'imessage', 'discord', 'gmail', etc.
  direction TEXT,         -- 'inbound' | 'outbound'
  contact_id TEXT,        -- FK to contacts
  channel_id TEXT,        -- Adapter-specific channel/thread
  content_type TEXT,      -- 'text', 'image', 'email', etc.
  content TEXT,           -- The actual payload
  metadata JSON           -- Adapter-specific data
)
```

**Why it matters:**
- Query across all channels: "messages from Casey in January"
- Audit trail: "what happened on this date"
- Foundation for Cortex: can analyze all history

#### 2. Identity Ledger

**The identity graph: Contacts → Entities → Mappings**

```sql
contacts (
  id TEXT PRIMARY KEY,
  adapter TEXT,           -- Where this contact came from
  external_id TEXT,       -- Adapter-specific ID
  display_name TEXT,
  phone TEXT,
  email TEXT,
  metadata JSON
)

entities (
  id TEXT PRIMARY KEY,
  name TEXT,              -- Canonical name: "Casey", "Mom", "Stripe"
  type TEXT,              -- 'person' | 'organization' | 'service'
  relationship TEXT,      -- 'partner', 'family', 'work', 'service'
  tags JSON,
  metadata JSON
)

mappings (
  contact_id TEXT,        -- FK to contacts
  entity_id TEXT,         -- FK to entities
  confidence REAL,        -- How sure are we?
  source TEXT,            -- 'manual' | 'cortex' | 'user'
  created_at INTEGER
)
```

**Why it matters:**
- Cross-channel identity: "Discord user 12345 = Casey = iMessage +1555..."
- Relationship-based policies: "family can do X, work contacts can do Y"
- Learned over time: Cortex can discover links

#### 3. Agents Ledger

**Sessions, turns, messages, tool calls.**

```sql
sessions (
  id TEXT PRIMARY KEY,
  label TEXT,             -- Human-readable label
  agent_id TEXT,
  entity_id TEXT,         -- Who owns this session
  thread_id TEXT,         -- Current head of the turn tree
  created_at INTEGER,
  updated_at INTEGER,
  metadata JSON
)

turns (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  parent_id TEXT,         -- For branching/forking
  created_at INTEGER,
  token_input INTEGER,
  token_output INTEGER
)

messages (
  id TEXT PRIMARY KEY,
  turn_id TEXT,
  role TEXT,              -- 'user' | 'assistant' | 'system' | 'tool'
  content TEXT,
  timestamp INTEGER
)

tool_calls (
  id TEXT PRIMARY KEY,
  turn_id TEXT,
  tool_name TEXT,
  parameters JSON,
  result JSON,
  duration_ms INTEGER
)
```

**Why it matters:**
- Queryable history: "all turns where shell was called"
- Atomic transactions: no partial writes
- Tree structure preserved: branching and forking supported

#### 4. Nexus Ledger

**Pipeline traces and audit trail.**

```sql
requests (
  id TEXT PRIMARY KEY,
  event_id TEXT,          -- FK to events
  started_at INTEGER,
  finished_at INTEGER,
  status TEXT,            -- 'completed' | 'denied' | 'error'
  
  -- Stage timing
  receive_ms INTEGER,
  identity_ms INTEGER,
  access_ms INTEGER,
  triggers_ms INTEGER,
  context_ms INTEGER,
  agent_ms INTEGER,
  deliver_ms INTEGER,
  finalize_ms INTEGER
)

access_decisions (
  request_id TEXT,
  policy_id TEXT,
  effect TEXT,            -- 'allow' | 'deny'
  reason TEXT,
  principal JSON,
  permissions JSON
)
```

**Why it matters:**
- Audit trail: every decision logged
- Debugging: trace any request through the pipeline
- Performance: identify slow stages

### Derived Layer (Cortex)

Built FROM the System of Record, async:

```sql
episodes (
  id TEXT PRIMARY KEY,
  event_ids JSON,         -- Events in this episode
  summary TEXT,
  embedding BLOB,
  created_at INTEGER
)

facets (
  id TEXT PRIMARY KEY,
  source_type TEXT,       -- 'event' | 'turn' | 'episode'
  source_id TEXT,
  facet_type TEXT,        -- 'entity' | 'topic' | 'sentiment' | 'pii'
  value JSON
)

embeddings (
  id TEXT PRIMARY KEY,
  source_type TEXT,
  source_id TEXT,
  model TEXT,
  vector BLOB
)
```

**Why it matters:**
- Semantic search: "that caching thing we discussed"
- Entity extraction: automatically discover people, places, things
- Enrichment: Cortex can learn and link identities

---

## The Relationships

### Nexus Relationship Graph

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           NEXUS DATA MODEL                                       │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                         SYSTEM OF RECORD                                 │    │
│  │                                                                          │    │
│  │    EVENTS                    IDENTITY                    AGENTS          │    │
│  │    ┌─────────┐              ┌─────────┐               ┌─────────┐       │    │
│  │    │ Event   │──────────────│ Contact │               │ Session │       │    │
│  │    │         │   who sent   │         │               │         │       │    │
│  │    │ adapter │              │ adapter │               │ agent_id│       │    │
│  │    │ content │              │ phone   │               │ entity  │       │    │
│  │    │ timestamp│             │ email   │               │ label   │       │    │
│  │    └─────────┘              └────┬────┘               └────┬────┘       │    │
│  │         │                        │                         │            │    │
│  │         │                        │ mapping                 │            │    │
│  │         │                        ▼                         │            │    │
│  │         │                   ┌─────────┐                    │            │    │
│  │         │                   │ Entity  │────────────────────┘            │    │
│  │         │                   │         │   session owner                 │    │
│  │         │                   │ name    │                                 │    │
│  │         │                   │ type    │                                 │    │
│  │         │                   │ tags    │◄──── Policies reference         │    │
│  │         │                   └─────────┘                                 │    │
│  │         │                                                               │    │
│  │         │                   NEXUS (Traces)                              │    │
│  │         │                   ┌─────────┐                                 │    │
│  │         └──────────────────►│ Request │                                 │    │
│  │              traces event   │         │                                 │    │
│  │                             │ timing  │                                 │    │
│  │                             │ access  │                                 │    │
│  │                             │ result  │                                 │    │
│  │                             └─────────┘                                 │    │
│  │                                                                          │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                      │                                           │
│                                      │ derived from                              │
│                                      ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                              CORTEX                                      │    │
│  │                                                                          │    │
│  │    Episodes         Facets          Embeddings       Analyses           │    │
│  │    (grouped         (extracted      (vectors for     (patterns,         │    │
│  │     events)          entities)       search)          insights)         │    │
│  │                                                                          │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### OpenClaw Relationship Graph

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          OPENCLAW DATA MODEL                                     │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                              SESSIONS                                    │    │
│  │                                                                          │    │
│  │    sessions.json              {sessionId}.jsonl                         │    │
│  │    ┌─────────────┐           ┌─────────────┐                            │    │
│  │    │ session key │──────────►│ messages    │                            │    │
│  │    │ updated_at  │           │ compactions │                            │    │
│  │    │ tokens      │           │ custom data │                            │    │
│  │    │ model       │           └─────────────┘                            │    │
│  │    └─────────────┘                                                       │    │
│  │                                                                          │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                          CONFIG-DRIVEN                                   │    │
│  │                                                                          │    │
│  │    identityLinks: { casey: ["discord:123", "telegram:456"] }            │    │
│  │    allowFrom: ["@owner", "telegram:*"]                                  │    │
│  │    agents.main.tools.allow: ["*"]                                       │    │
│  │                                                                          │    │
│  │    (No persistent storage — just config)                                │    │
│  │                                                                          │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                          IN-FLOW MEMORY                                  │    │
│  │                                                                          │    │
│  │    MEMORY.md files    +    Vector search during agent runs              │    │
│  │                                                                          │    │
│  │    (Not a derived layer — active during execution only)                 │    │
│  │                                                                          │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                           NOT STORED                                     │    │
│  │                                                                          │    │
│  │    • Events (processed and discarded)                                   │    │
│  │    • Identity graph (no ledger)                                         │    │
│  │    • Access decisions (no audit)                                        │    │
│  │    • Pipeline traces (no debugging)                                     │    │
│  │                                                                          │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## What This Enables

### Queries Possible in Nexus (Impossible in OpenClaw)

```sql
-- All messages from Casey across all channels
SELECT e.* FROM events e
JOIN contacts c ON e.contact_id = c.id
JOIN mappings m ON c.id = m.contact_id
JOIN entities ent ON m.entity_id = ent.id
WHERE ent.name = 'Casey'
ORDER BY e.timestamp DESC;

-- Topics discussed with work contacts last month
SELECT f.value as topic, COUNT(*) as count
FROM facets f
JOIN events e ON f.source_id = e.id
JOIN contacts c ON e.contact_id = c.id
JOIN mappings m ON c.id = m.contact_id
JOIN entities ent ON m.entity_id = ent.id
WHERE ent.relationship = 'work'
  AND e.timestamp > strftime('%s', 'now', '-1 month')
  AND f.facet_type = 'topic'
GROUP BY f.value;

-- Access decisions for a specific entity
SELECT * FROM access_decisions ad
JOIN requests r ON ad.request_id = r.id
WHERE ad.principal->>'entity_id' = 'casey-entity-id'
ORDER BY r.started_at DESC;

-- All tool calls across all sessions
SELECT tc.tool_name, COUNT(*) as usage
FROM tool_calls tc
GROUP BY tc.tool_name
ORDER BY usage DESC;
```

### Features Enabled by the Data Model

| Feature | Requires | OpenClaw | Nexus |
|---------|----------|----------|-------|
| Cross-channel identity | Identity Ledger | ❌ | ✅ |
| Relationship-based policies | Entity graph | ❌ | ✅ |
| Audit trail | Nexus Ledger | ❌ | ✅ |
| Semantic search across history | Events + Cortex | ❌ | ✅ |
| "What did X send me last week?" | Events Ledger | ❌ | ✅ |
| Entity extraction | Cortex | ❌ | ✅ |
| Learned identity links | Cortex + Identity | ❌ | ✅ |
| Per-request debugging | Nexus Ledger | ❌ | ✅ |

---

## The Chain of Dependencies

```
Events Ledger (store all events)
       ↓
Identity Ledger (extract and link contacts → entities)
       ↓
Entity-based Policies (access control references entities)
       ↓
Session Routing (policies determine where messages go)
       ↓
Agents Ledger (sessions tied to entities, not just channels)
       ↓
Nexus Ledger (audit everything)
       ↓
Cortex (derive insights from the System of Record)
```

**OpenClaw skips the first step.** Without storing events, you can't build the identity graph. Without the identity graph, you can't have entity-based policies. Without entity-based policies, access control is scattered. Without audit logging, you can't debug or trust the system.

---

## Summary

| Aspect | OpenClaw | Nexus |
|--------|----------|-------|
| Philosophy | Store agent sessions | Store everything |
| Events | Discarded | Permanent ledger |
| Identity | Config-driven | Learned graph |
| Access Control | Scattered config | Entity-based policies |
| Audit | None | Complete trail |
| Memory | In-flow active | Derived async layer |
| Queries | Session-scoped | Cross-everything |

**The single decision to store all events unlocks the entire Nexus advantage.**

---

## References

- `specs/data/ledgers/` — Ledger schemas
- `specs/data/cortex/` — Cortex design
- `specs/runtime/iam/` — IAM policies
- `specs/runtime/iam/upstream/` — OpenClaw access control
- `specs/runtime/broker/upstream/UPSTREAM_SESSION_STORAGE.md` — OpenClaw session format

---

*OpenClaw's agent sessions are valuable. Nexus builds a complete System of Record around them.*
