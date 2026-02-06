# Data Layer Comparison

**Status:** COMPLETE  
**Last Updated:** 2026-02-04

---

## Overview

This document consolidates ALL data layer differences between OpenClaw and Nexus — storage formats, persistence patterns, memory systems, configuration, and credentials. It serves as the authoritative comparison for everything data-related.

**The Core Difference:** OpenClaw stores *agent session transcripts*. Nexus stores *everything that happens* — events, sessions, identity, and pipeline traces — in a queryable, atomic database.

---

## Quick Reference

| Aspect | OpenClaw | Nexus |
|--------|----------|-------|
| **Primary Storage** | JSONL files | SQLite database |
| **Location** | `~/.openclaw/` (hidden) | `~/nexus/` (visible) |
| **Configuration** | Single `config.json` (JSON5) | Domain-split YAML files |
| **Credentials** | Inline in config / scattered JSON | Unified vault with pointers |
| **Sessions** | `sessions.json` + `*.jsonl` per session | `sessions` + `turns` + `messages` tables |
| **Events** | Not stored | Events Ledger (permanent) |
| **Identity** | `identityLinks` in config | Identity Ledger (graph) |
| **Memory** | `MEMORY.md` + `memory/*.md` + SQLite index | Cortex (derived from Agents Ledger) |
| **Audit Trail** | None | Nexus Ledger (traces) |
| **Queries** | Parse files manually | SQL |
| **Transactions** | File locks | ACID |
| **Backup** | Many files | Single file |

---

## 1. Storage Format: Files vs Database

### OpenClaw: File-Based Storage

```
~/.openclaw/
├── openclaw.json                     # Main config (JSON5)
├── agents/{agentId}/
│   ├── agent/
│   │   └── auth-profiles.json       # Per-agent credentials
│   └── sessions/
│       ├── sessions.json            # Session index
│       └── {sessionId}.jsonl        # Transcript per session
├── memory/
│   └── {agentId}.sqlite             # Memory index (BM25 + vectors)
├── credentials/
│   └── {provider}/{accountId}/      # Provider credentials
└── devices/
    ├── pending.json                  # Device pairing state
    └── paired.json
```

**Problems:**
- **File sprawl** — Hundreds of files after months of use
- **No cross-session queries** — Must parse every file to find information
- **Corruption risk** — Partial writes require repair logic
- **Concurrency** — File locking is fragile
- **No audit trail** — Events fire and disappear

### Nexus: SQLite System of Record

```
~/nexus/
├── state/
│   └── nexus.db                      # Single database (all four ledgers)
├── skills/                           # Skill definitions
└── home/                             # User's personal space
```

**The Four Ledgers:**

| Ledger | Purpose | Key Tables | Retention |
|--------|---------|------------|-----------|
| **Events** | All inbound/outbound events | `events` | Permanent |
| **Agents** | Conversation history | `sessions`, `turns`, `messages`, `tool_calls` | Permanent |
| **Identity** | Who's involved | `contacts`, `entities`, `identity_mappings` | Permanent |
| **Nexus** | Pipeline traces | `nexus_requests` | 7-30 days |

**Benefits:**
- **Queryable** — SQL across all sessions, all time
- **Atomic** — ACID transactions, no corruption
- **Single file** — Easy backup, sync
- **Audit trail** — Every request traced

---

## 2. What Gets Stored

### OpenClaw: Sessions Only

**Stored:**
- Session metadata (tokens, model, channel, routing)
- Conversation turns (user/assistant/tool messages)
- Tool calls and results
- Compaction summaries

**NOT Stored:**
- Raw inbound events (processed and discarded)
- Identity data (only ad-hoc `identityLinks` in config)
- Pipeline traces (events fire and disappear)
- Audit trail (no record of what happened when)

### Nexus: Complete Record

**Events Ledger:**
```sql
-- Every message, email, reaction becomes a row
INSERT INTO events (id, source, type, content, from_channel, from_identifier, timestamp)
VALUES ('imessage:p:+1555.../123', 'imessage', 'message', 'Hey!', 'imessage', '+15551234567', 1706889600000);
```

**Agents Ledger:**
```sql
-- Complete conversation history with tree structure
SELECT t.*, m.content 
FROM turns t 
JOIN messages m ON m.turn_id = t.id 
WHERE t.session_id = '01HQXYZ001';
```

**Identity Ledger:**
```sql
-- Query: all channels for one person
SELECT c.channel, c.identifier FROM contacts c
JOIN identity_mappings m ON c.channel = m.channel AND c.identifier = m.identifier
WHERE m.entity_id = 'ent_mom';
```

**Nexus Ledger:**
```sql
-- Debug: why did this message get routed wrong?
SELECT stage, status, principal_id, access_decision, session_key
FROM nexus_requests
WHERE event_id = 'imessage:p:+1555.../123';
```

---

## 3. Session Storage

### OpenClaw: JSONL Transcripts

**Index file (`sessions.json`):**
```typescript
{
  "agent:atlas:dm:+15551234": {
    sessionId: "uuid",
    updatedAt: 1706976000000,
    inputTokens: 1234,
    outputTokens: 567,
    totalTokens: 1801,
    model: "claude-sonnet-4-20250514",
    channel: "imessage",
    compactionCount: 2,
    // ... many more fields
  }
}
```

**Transcript file (`{sessionId}.jsonl`):**
```json
{"type": "session", "version": 9, "id": "uuid", "timestamp": "...", "cwd": "..."}
{"type": "message", "id": "uuid", "parentId": "uuid", "message": {"role": "user", "content": [...]}}
{"type": "message", "id": "uuid", "parentId": "uuid", "message": {"role": "assistant", "content": [...]}}
{"type": "compaction", "summary": "...", "firstKeptEntryId": "uuid", "tokensBefore": 100000}
```

**Tree structure:** Each message has `id` and `parentId` for branching support.

**Concurrency:** File-based locking with `.lock` files, 10s timeout, stale lock detection.

### Nexus: SQL Tables

```sql
-- Sessions table (replaces sessions.json)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  session_key TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  persona TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  model TEXT,
  model_provider TEXT,
  compaction_count INTEGER DEFAULT 0,
  -- ... routing fields
);

-- Turns table (replaces JSONL messages)
CREATE TABLE turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  parent_id TEXT REFERENCES turns(id),
  role TEXT NOT NULL,  -- 'user', 'assistant', 'tool'
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  model TEXT,
  stop_reason TEXT
);

-- Messages table (content blocks)
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  turn_id TEXT NOT NULL REFERENCES turns(id),
  content_type TEXT NOT NULL,  -- 'text', 'tool_call', 'tool_result', 'thinking'
  content TEXT,
  sequence INTEGER NOT NULL
);

-- Tool calls table
CREATE TABLE tool_calls (
  id TEXT PRIMARY KEY,
  turn_id TEXT NOT NULL REFERENCES turns(id),
  tool_name TEXT NOT NULL,
  arguments TEXT,
  result TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  status TEXT  -- 'success', 'error', 'timeout'
);
```

**Benefits:**
- Queryable across all sessions
- Proper foreign key relationships
- Tree structure via `parent_id`
- Atomic transactions

---

## 4. Configuration Storage

### OpenClaw: Monolithic JSON5

**Single file (`~/.openclaw/openclaw.json`)** contains:
- Agent definitions and settings
- Channel credentials (raw values!)
- Access policies (scattered throughout)
- Model configuration
- Skill configuration
- Identity links
- Send policies
- Hook configuration
- Tool settings

**Problems:**
- No separation of concerns
- Secrets in plaintext
- Hard to audit (grep to find settings)
- Every change touches one file

### Nexus: Domain-Split YAML

```
~/nexus/state/
├── agents/{id}/
│   ├── IDENTITY.md       # Who the agent is
│   ├── SOUL.md           # Values/boundaries
│   └── config.yaml       # Agent settings
├── credentials/
│   └── {service}.yaml    # Credential pointers (not raw values)
├── config/
│   ├── access.yaml       # IAM policies
│   ├── adapters.yaml     # Adapter settings
│   └── capabilities.yaml # Capability registry
└── skills/
    └── {skill}/
        └── state.yaml    # Per-skill state
```

**Example access policy:**
```yaml
# state/config/access.yaml
policies:
  - name: dm-allowlist
    subjects: [user:tyler, user:casey]
    actions: [message:send]
    resources: [adapter:imessage:dm:*]
    effect: allow
```

**Benefits:**
- Clear separation of concerns
- Each file has independent history
- Secrets never in files (pointers only)
- Easy auditing

---

## 5. Credential Storage

### OpenClaw: Scattered + Inline

**Auth profiles per agent:**
```
~/.openclaw/agents/{agentId}/agent/auth-profiles.json
```

```json
{
  "version": 1,
  "profiles": {
    "anthropic-main": {
      "type": "api_key",
      "provider": "anthropic",
      "key": "sk-ant-..."  // RAW SECRET
    },
    "google-oauth": {
      "type": "oauth",
      "access": "ya29...",
      "refresh": "1//...",
      "expires": 1706976000000
    }
  },
  "usageStats": {
    "anthropic-main": {
      "lastUsed": 1706889600000,
      "errorCount": 0,
      "cooldownUntil": null
    }
  }
}
```

**Provider credentials scattered:**
```
~/.openclaw/credentials/
├── whatsapp/{accountId}/creds.json
├── telegram/{accountId}/creds.json
└── github-copilot.token.json
```

**Problems:**
- Secrets in plaintext files
- No unified view
- No health checking
- No lifecycle management

### Nexus: Unified Vault with Pointers

```yaml
# ~/nexus/state/credentials/anthropic.yaml
service: anthropic
account: default
type: api-key
source: env              # Where to get the value
key: ANTHROPIC_API_KEY   # Env var name
status: active
verified_at: 2026-02-04T10:30:00Z
last_used: 2026-02-04T14:22:00Z
```

```yaml
# ~/nexus/state/credentials/google.yaml
service: google
account: tyler@gmail.com
type: oauth
source: keychain         # macOS Keychain
key: nexus-google-oauth
scopes: [gmail, calendar]
expires_at: 2026-03-04T00:00:00Z
status: active
```

**Source types:**
- `env` — Environment variable
- `keychain` — macOS Keychain
- `1password` — 1Password CLI
- `file` — Encrypted file (pointer to path)

**Benefits:**
- Secrets never written to files
- Single view via `nexus credential list`
- Health checks via `nexus credential verify`
- Tied to skill readiness (broken credential → skill shows 🔧)

---

## 6. Memory System

### OpenClaw: File-Based + Active Writing

**Architecture:**
```
Agent conversation
        ↓
Agent writes to MEMORY.md / memory/*.md  (active)
        ↓
Memory plugins index files (SQLite + FTS5 + sqlite-vec)
        ↓
memory_search tool queries index
        ↓
Results injected into agent context
```

**Memory index (`~/.openclaw/memory/{agentId}.sqlite`):**
```sql
CREATE TABLE files (
  path TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  mtime INTEGER NOT NULL
);

CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  text TEXT NOT NULL,
  embedding TEXT NOT NULL  -- JSON-encoded float array
);

CREATE VIRTUAL TABLE chunks_fts USING fts5(text, ...);
CREATE VIRTUAL TABLE chunks_vec USING vec0(embedding FLOAT[1536]);
```

**Hybrid search:** BM25 + vector with configurable weights (default 0.3/0.7)

**Pre-compaction memory flush:**
```
"Pre-compaction memory flush. Store durable memories now."
```

Agent must save important context before compaction destroys it.

**Problems:**
- Agent burden — must remember to remember
- Lost context — anything not saved is gone after compaction
- Per-agent isolation — no cross-agent knowledge
- No regeneration — faulty memories stuck forever

### Nexus: Derived Layer (Cortex)

**Architecture:**
```
All turns → Agents Ledger (SQLite)     ← System of Record (facts)
                    ↓
            Cortex (background)         ← Derived Layer (understanding)
                    ↓
    Episodes, Facets, Embeddings, Analyses
                    ↓
            cortex_search tool
```

**Four Cortex Components:**

| Component | Description | Purpose |
|-----------|-------------|---------|
| **Episodes** | Chunks of events grouped for analysis | Coherent conversation segments |
| **Facets** | Extracted metadata (entities, topics, sentiment) | Structured knowledge extraction |
| **Embeddings** | Vector representations for semantic search | Similarity-based retrieval |
| **Analyses** | Insights, patterns, learned relationships | Higher-order understanding |

**Key differences:**

| Aspect | OpenClaw | Nexus |
|--------|----------|-------|
| **Source** | Files agent wrote | All turns in Agents Ledger |
| **Mutability** | Files are truth | Derived, can regenerate |
| **Completeness** | Only what agent saved | Everything ever said |
| **Pre-compaction flush** | Required | Not needed |
| **Cross-agent** | Isolated | Unified knowledge graph |
| **Improvement** | New conversations only | Regenerate all history |

**Why no memory flush in Nexus:**
- All turns persist in Agents Ledger forever
- Compaction marks context boundaries, doesn't delete
- Cortex derives from complete record
- Nothing is ever lost

---

## 7. Event Storage

### OpenClaw: Events Not Stored

When a message arrives:
1. Channel monitor receives it
2. Dispatch pipeline processes it
3. Agent generates response
4. Response sent
5. **Original event discarded**

Only the agent conversation is persisted. The raw inbound event is gone.

**Implications:**
- Can't query "what messages did I receive yesterday"
- Can't correlate events across channels
- No foundation for analytics

### Nexus: Events Ledger

Every event is permanently stored:

```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,           -- 'imessage:p:+1555.../123'
  source TEXT NOT NULL,          -- 'imessage', 'discord', 'gmail'
  type TEXT NOT NULL,            -- 'message', 'reaction', 'email'
  content TEXT,
  from_channel TEXT NOT NULL,
  from_identifier TEXT NOT NULL,
  to_channel TEXT,
  to_identifier TEXT,
  timestamp INTEGER NOT NULL,
  raw_payload TEXT,              -- Original platform payload
  metadata TEXT                  -- Platform-specific metadata
);
```

**Enables:**
- Cross-platform queries
- Analytics and insights
- Foundation for Cortex
- Audit trail

---

## 8. Identity Storage

### OpenClaw: Ad-Hoc Links

Identity linking is a config option:

```json5
{
  "identityLinks": {
    "casey": ["telegram:111", "discord:222", "imessage:+1555..."]
  }
}
```

This collapses sessions — messages from any of those identifiers use the same session.

**That's it.** No contact tracking, no entity resolution, no relationship modeling.

### Nexus: Identity Ledger (Graph)

Three-layer identity system:

```sql
-- Contacts: raw platform identifiers (auto-created on first contact)
CREATE TABLE contacts (
  channel TEXT NOT NULL,
  identifier TEXT NOT NULL,
  display_name TEXT,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  message_count INTEGER DEFAULT 0,
  PRIMARY KEY (channel, identifier)
);

-- Entities: resolved people/organizations
CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  entity_type TEXT,           -- 'person', 'organization', 'bot'
  relationship TEXT,          -- 'family', 'work', 'friend'
  attributes TEXT,            -- JSON: additional metadata
  created_at INTEGER NOT NULL
);

-- Mappings: links contacts to entities
CREATE TABLE identity_mappings (
  channel TEXT NOT NULL,
  identifier TEXT NOT NULL,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  mapping_type TEXT,          -- 'confirmed', 'inferred', 'manual'
  confidence REAL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (channel, identifier)
);
```

**Enables:**
- "Show all messages from Casey across all platforms"
- Contact discovery (who have I talked to most?)
- Relationship modeling
- IAM based on entity, not just identifier

---

## 9. Audit Trail

### OpenClaw: None

Events fire and disappear. If something goes wrong:
- Grep through logs
- Reconstruct from session files
- Guess and check

### Nexus: Nexus Ledger

Every `NexusRequest` is traced:

```sql
CREATE TABLE nexus_requests (
  id TEXT PRIMARY KEY,
  event_id TEXT,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  status TEXT,                -- 'success', 'failed', 'rejected'
  
  -- Stage progression
  stage TEXT,                 -- Current/final stage
  stage_timings TEXT,         -- JSON: per-stage timing
  
  -- Identity resolution
  principal_type TEXT,
  principal_id TEXT,
  
  -- Access decision
  access_decision TEXT,       -- 'allow', 'deny'
  access_policy TEXT,         -- Which policy matched
  
  -- Session routing
  session_key TEXT,
  turn_id TEXT,
  
  -- Error tracking
  error_stage TEXT,
  error_message TEXT,
  
  -- Cleanup
  expires_at INTEGER          -- 7-30 day retention
);
```

**Enables:**
- "Why did this message get denied?"
- "What stage failed?"
- "How long did each stage take?"
- Security auditing

---

## 10. Queries Impossible in OpenClaw

```sql
-- 1. Messages from a specific sender across all platforms
SELECT e.source, e.content, e.timestamp 
FROM events e
JOIN identity_mappings m ON m.channel = e.from_channel 
  AND m.identifier = e.from_identifier
WHERE m.entity_id = 'ent_mom'
ORDER BY e.timestamp DESC;

-- 2. Token usage by agent this month
SELECT 
  s.agent_id,
  SUM(t.input_tokens) as input,
  SUM(t.output_tokens) as output
FROM sessions s
JOIN turns t ON t.session_id = s.id
WHERE t.started_at > strftime('%s', 'now', 'start of month') * 1000
GROUP BY s.agent_id;

-- 3. Failed pipeline stages
SELECT error_stage, error_message, COUNT(*) as failures
FROM nexus_requests
WHERE status = 'failed'
GROUP BY error_stage, error_message
ORDER BY failures DESC;

-- 4. Most used tools
SELECT tool_name, COUNT(*) as uses
FROM tool_calls
WHERE started_at > strftime('%s', 'now', '-30 days') * 1000
GROUP BY tool_name
ORDER BY uses DESC;

-- 5. Unknown contacts (not linked to entity)
SELECT c.channel, c.identifier, c.message_count
FROM contacts c
LEFT JOIN identity_mappings m ON m.channel = c.channel 
  AND m.identifier = c.identifier
WHERE m.entity_id IS NULL
ORDER BY c.message_count DESC;

-- 6. Conversation timeline across platforms
SELECT 
  e.source,
  COALESCE(ent.name, e.from_identifier) as who,
  e.content,
  datetime(e.timestamp / 1000, 'unixepoch') as when_ts
FROM events e
LEFT JOIN identity_mappings m ON m.channel = e.from_channel 
  AND m.identifier = e.from_identifier
LEFT JOIN entities ent ON ent.id = m.entity_id
WHERE e.timestamp BETWEEN ? AND ?
ORDER BY e.timestamp;
```

---

## 11. The File Sprawl Problem

### OpenClaw After 6 Months

```bash
ls ~/.openclaw/agents/atlas/sessions/ | wc -l
# 847 files

find ~/.openclaw -name "*.jsonl" | wc -l
# 1,203 transcript files

find ~/.openclaw -name "*.bak*" | wc -l
# 156 backup files from repairs

du -sh ~/.openclaw/
# 2.4G total
```

### Nexus

```bash
ls ~/nexus/state/
# nexus.db

du -sh ~/nexus/state/nexus.db
# 1.8G (same data, better compressed)
```

---

## 12. Migration Path

| OpenClaw | Nexus | Migration |
|----------|-------|-----------|
| `config.json` | Split configs in `state/` | Automated transformer |
| `sessions.json` + `*.jsonl` | Agents Ledger | Import script |
| `auth-profiles.json` | `state/credentials/` | Map to vault pointers |
| `identityLinks` | Identity Ledger | Create entities + mappings |
| `MEMORY.md` + `memory/*.md` | Cortex | Ingest as initial episodes |
| Provider credentials | `state/credentials/` | Convert to pointers |

---

## Summary

| Layer | OpenClaw | Nexus | Why It Matters |
|-------|----------|-------|----------------|
| **Format** | Files (JSONL, JSON) | SQLite | Queries, transactions, no sprawl |
| **Sessions** | Per-session files | Tables with relationships | Cross-session analysis |
| **Events** | Not stored | Events Ledger | Foundation for everything |
| **Identity** | Config option | First-class graph | Cross-platform identity |
| **Memory** | Active file writing | Derived from SoR | No agent burden, regenerable |
| **Config** | Monolithic | Domain-split | Clear boundaries |
| **Credentials** | Inline/scattered | Unified vault | Security, health checks |
| **Audit** | None | Pipeline traces | Debuggable, auditable |
| **Visibility** | Hidden | Transparent | Trust, debugging |

**OpenClaw stores conversation logs.**

**Nexus stores your digital life — queryable, auditable, the foundation for intelligence.**

---

## Related Documents

- `SYSTEM_OF_RECORD.md` — Deep dive on JSONL vs SQLite
- `STATE_LAYOUT.md` — Workspace structure comparison
- `MEMORY_SYSTEMS.md` — Memory layer technical comparison
- `MEMORY_PHILOSOPHY.md` — Why derived memory is better
- `specs/data/upstream/DATA_LAYER_COMPLETE.md` — Full OpenClaw data layer reference
- `specs/data/ledgers/` — Nexus ledger schemas
- `specs/data/cortex/` — Cortex specification

---

*The data layer is the foundation. Everything else — IAM, memory, analytics, debugging — flows from having the right data in the right format.*
