# System of Record Comparison

**Status:** COMPLETE  
**Last Updated:** 2026-02-04

---

## Overview

This document compares how OpenClaw and Nexus persist data — the fundamental question of "what gets stored and where."

**Key Insight:** OpenClaw stores *agent session transcripts*. Nexus stores *everything that happens* — events, sessions, identity, and pipeline traces — in a queryable, atomic database.

---

## What Gets Stored

### OpenClaw: Session Transcripts Only

OpenClaw's storage is focused on agent conversations:

```
~/.openclaw/agents/<agentId>/sessions/
├── sessions.json           # Index: sessionKey → metadata
├── <sessionId>.jsonl       # Transcript per session
├── <sessionId>-topic-*.jsonl  # Thread-specific transcripts
└── *.bak-*                 # Backup files from repairs
```

**Stored:**
- Session metadata (tokens, model, channel, routing)
- Conversation turns (user/assistant/tool messages)
- Tool calls and results
- Compaction summaries

**NOT Stored:**
- Raw inbound events (they're processed and discarded)
- Identity data (only ad-hoc `identityLinks` in config)
- Pipeline traces (events fire and disappear)
- Audit trail (no record of what happened when)

### Nexus: Complete System of Record

Nexus stores everything in a single SQLite database:

```
~/nexus/state/nexus.db
├── Events Ledger      # ALL inbound/outbound events
├── Agents Ledger      # Sessions, turns, messages, tool calls
├── Identity Ledger    # Contacts, entities, mappings
└── Nexus Ledger       # Pipeline traces (NexusRequest lifecycle)
```

**Stored:**
- Every message received (iMessage, Gmail, Discord, etc.)
- Every response sent
- Complete conversation history with tree structure
- Identity resolution and contact tracking
- Full request traces through the pipeline

---

## The Four Nexus Ledgers

| Ledger | Purpose | Key Tables | Retention |
|--------|---------|------------|-----------|
| **Events** | All inbound/outbound events | `events` | Permanent |
| **Agents** | Conversation history | `sessions`, `turns`, `messages`, `tool_calls` | Permanent |
| **Identity** | Who's involved | `contacts`, `entities`, `identity_mappings` | Permanent |
| **Nexus** | Pipeline traces | `nexus_requests` | 7-30 days |

### Events Ledger

The permanent record of *everything that flows through Nexus*:

```sql
-- Every message, email, reaction becomes a row
INSERT INTO events (id, source, type, content, from_channel, from_identifier, timestamp)
VALUES ('imessage:p:+1555.../123', 'imessage', 'message', 'Hey!', 'imessage', '+15551234567', 1706889600000);
```

### Agents Ledger

Complete conversation history with tree structure for branching:

```sql
-- Sessions contain turns, turns contain messages
-- Tree structure enables forking from any point
SELECT t.*, m.content 
FROM turns t 
JOIN messages m ON m.turn_id = t.id 
WHERE t.session_id = '01HQXYZ001';
```

### Identity Ledger

Tracks *who* is involved across all platforms:

```sql
-- Link a phone number to a known person
INSERT INTO identity_mappings (channel, identifier, entity_id, mapping_type)
VALUES ('imessage', '+15551234567', 'ent_mom', 'confirmed');

-- Query: all channels for one person
SELECT c.channel, c.identifier FROM contacts c
JOIN identity_mappings m ON c.channel = m.channel AND c.identifier = m.identifier
WHERE m.entity_id = 'ent_mom';
```

### Nexus Ledger

Pipeline observability — trace every request through the system:

```sql
-- Debug: why did this message get routed wrong?
SELECT stage, status, principal_id, access_decision, session_key
FROM nexus_requests
WHERE event_id = 'imessage:p:+1555.../123';
```

---

## Comparison Table

| Aspect | OpenClaw | Nexus |
|--------|----------|-------|
| **Storage Format** | JSONL files + JSON index | SQLite database |
| **Location** | `~/.openclaw/agents/*/sessions/` | `~/nexus/state/nexus.db` |
| **Events** | ❌ Not stored | ✅ Events Ledger (permanent) |
| **Sessions** | ✅ `sessions.json` index | ✅ `sessions` table |
| **Transcripts** | ✅ `*.jsonl` per session | ✅ `turns` + `messages` tables |
| **Tool Calls** | ✅ Inline in JSONL | ✅ `tool_calls` table |
| **Identity** | ❌ Only `identityLinks` config | ✅ Identity Ledger (graph) |
| **Pipeline Traces** | ❌ Not stored | ✅ Nexus Ledger |
| **Querying** | ❌ Parse files manually | ✅ SQL queries |
| **Transactions** | ❌ File-based locking | ✅ ACID transactions |
| **Backup** | Many files to sync | Single file |

---

## JSONL Problems

### 1. Query Difficulty

Finding information across sessions requires parsing every file:

```typescript
// OpenClaw: Find messages from a specific sender
// Must scan every .jsonl file, parse each line, filter manually
for (const file of await glob('sessions/*.jsonl')) {
  const lines = await readLines(file);
  for (const line of lines) {
    const entry = JSON.parse(line);
    if (entry.type === 'message' && matchesSender(entry)) {
      results.push(entry);
    }
  }
}
```

```sql
-- Nexus: Same query
SELECT * FROM messages m
JOIN turns t ON t.id = m.turn_id
JOIN sessions s ON s.id = t.session_id
WHERE s.routing_key LIKE 'imessage:+15551234567%';
```

### 2. File Sprawl

Each session creates a new file. Active usage leads to:
- Hundreds of `.jsonl` files
- Thread-specific files multiply the problem
- Backup `.bak-*` files accumulate
- Filesystem operations slow down

```
# Typical OpenClaw sessions folder after months of use
ls ~/.openclaw/agents/atlas/sessions/ | wc -l
# 847 files
```

Nexus: One file. Always.

### 3. Corruption Risk

JSONL files can become malformed:
- Partial writes on crash
- Truncated lines
- Invalid JSON requiring repair

OpenClaw has dedicated repair logic:

```typescript
// session-file-repair.ts
export async function repairSessionFileIfNeeded(params: {
  sessionFile: string;
}): Promise<RepairReport> {
  // Parse each line, drop invalid ones, write backup
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      entries.push(entry);
    } catch {
      droppedLines += 1;  // Data loss!
    }
  }
}
```

SQLite: ACID transactions ensure writes are atomic. No partial states.

### 4. Concurrency Issues

File-based locking is fragile:

```typescript
// OpenClaw: lock file dance
async function withSessionStoreLock<T>(storePath: string, fn: () => Promise<T>) {
  const lockPath = `${storePath}.lock`;
  // Create lock file, check for stale locks, handle timeouts...
  // All the edge cases: EEXIST, stale detection, cleanup on crash
}
```

SQLite: Built-in concurrency with proper isolation levels.

### 5. No Cross-Session Queries

With JSONL, you can't easily answer:
- "How many tokens did I use this week?"
- "What tools does Mom's session use most?"
- "Show me all sessions that mentioned 'project X'"

Each question requires parsing all files.

---

## What Nexus Enables

### 1. Cross-Platform Identity

"Show me all messages from Casey, regardless of platform":

```sql
SELECT e.content, e.source, e.timestamp
FROM events e
JOIN contacts c ON c.channel = e.from_channel AND c.identifier = e.from_identifier
JOIN identity_mappings m ON m.channel = c.channel AND m.identifier = c.identifier
JOIN entities ent ON ent.id = m.entity_id
WHERE ent.name = 'Casey'
ORDER BY e.timestamp DESC;
```

OpenClaw can't do this — events aren't stored, identity isn't tracked.

### 2. Conversation Analytics

"Token usage by persona this month":

```sql
SELECT 
  s.persona,
  SUM(t.total_tokens) as tokens,
  COUNT(DISTINCT s.id) as sessions,
  COUNT(t.id) as turns
FROM sessions s
JOIN turns t ON t.session_id = s.id
WHERE t.started_at > strftime('%s', 'now', 'start of month') * 1000
GROUP BY s.persona;
```

### 3. Pipeline Debugging

"Why did this message get denied?":

```sql
SELECT 
  stage,
  principal_type,
  access_decision,
  access_policy,
  error_message
FROM nexus_requests
WHERE event_id = 'discord:msg:12345';
```

### 4. Contact Discovery

"Who have I talked to most this week?":

```sql
SELECT 
  COALESCE(ent.name, c.identifier) as who,
  c.channel,
  COUNT(e.id) as message_count
FROM events e
JOIN contacts c ON c.channel = e.from_channel AND c.identifier = e.from_identifier
LEFT JOIN identity_mappings m ON m.channel = c.channel AND m.identifier = c.identifier
LEFT JOIN entities ent ON ent.id = m.entity_id
WHERE e.timestamp > strftime('%s', 'now', '-7 days') * 1000
  AND e.from_channel != 'nexus'  -- Exclude outbound
GROUP BY c.channel, c.identifier
ORDER BY message_count DESC
LIMIT 10;
```

### 5. Audit Trail

"What happened at 3:47 PM yesterday?":

```sql
SELECT 
  e.source,
  e.type,
  e.content,
  nr.stage,
  nr.access_decision,
  nr.turn_id
FROM events e
LEFT JOIN nexus_requests nr ON nr.event_id = e.id
WHERE e.timestamp BETWEEN 1706889600000 AND 1706889900000
ORDER BY e.timestamp;
```

### 6. Foundation for Cortex

The System of Record is the foundation. Cortex (derived layer) can:
- Build episode summaries from events
- Extract entity facets from conversations
- Generate embeddings for semantic search
- Produce insights across all data

If Cortex is corrupted or needs rebuilding — regenerate from the SoR.

---

## Example Queries (Impossible in OpenClaw)

```sql
-- 1. Messages mentioning a topic across all platforms
SELECT source, content, timestamp FROM events
WHERE content LIKE '%project nexus%' 
ORDER BY timestamp DESC;

-- 2. Tool usage patterns
SELECT tool_name, COUNT(*) as uses, AVG(
  (completed_at - started_at)
) as avg_ms
FROM tool_calls
WHERE started_at > strftime('%s', 'now', '-30 days') * 1000
GROUP BY tool_name
ORDER BY uses DESC;

-- 3. Session continuity (time between turns)
SELECT 
  s.label,
  AVG(t2.started_at - t1.completed_at) / 60000 as avg_gap_minutes
FROM turns t1
JOIN turns t2 ON t2.parent_turn_id = t1.id
JOIN sessions s ON s.id = t1.session_id
GROUP BY s.id
HAVING COUNT(*) > 5;

-- 4. Failed pipeline stages
SELECT error_stage, error_message, COUNT(*) as failures
FROM nexus_requests
WHERE status = 'failed'
GROUP BY error_stage, error_message
ORDER BY failures DESC;

-- 5. Identity resolution gaps (unknown contacts)
SELECT c.channel, c.identifier, c.message_count
FROM contacts c
LEFT JOIN identity_mappings m ON m.channel = c.channel AND m.identifier = c.identifier
WHERE m.entity_id IS NULL
ORDER BY c.message_count DESC;
```

---

## Summary

| Capability | OpenClaw | Nexus |
|------------|----------|-------|
| Store all events | ❌ | ✅ |
| Query across sessions | ❌ | ✅ |
| Identity resolution | ❌ | ✅ |
| Pipeline audit trail | ❌ | ✅ |
| Atomic transactions | ❌ | ✅ |
| Single file backup | ❌ | ✅ |
| Foundation for AI memory | ❌ | ✅ |

**OpenClaw:** Stores conversation logs.  
**Nexus:** Stores your digital life — queryable, auditable, the foundation for intelligence.

---

## Related Documents

- `specs/data/ledgers/` — Individual ledger schemas
- `specs/data/ledgers/upstream/UPSTREAM_SESSION_STORAGE.md` — OpenClaw JSONL details
- `specs/data/cortex/` — Derived layer built on SoR
- `MEMORY_PHILOSOPHY.md` — Why structured storage matters

