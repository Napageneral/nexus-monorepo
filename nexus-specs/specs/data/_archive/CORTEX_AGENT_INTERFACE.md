# Cortex Agent Interface

**Status:** DESIGN SPEC
**Last Updated:** 2026-02-13
**Related:** MEMORY_SYSTEM.md, roles/MEMORY_READER.md, roles/MEMORY_WRITER.md, ../../runtime/broker/MEESEEKS_PATTERN.md

---

## Overview

This document defines how agents (and meeseeks roles) interact with the Cortex memory system.

**Design principle: Skills + direct SQLite, not structured tools.** Instead of a thick HTTP API or a set of bespoke tool_use tools, agents get skill files containing database schemas, query patterns, and helper scripts. They interact with the database directly via `sqlite3` CLI and skill scripts. This maximizes composability — the agent writes any query it can imagine.

**Design principle: Code mode.** Memory agents operate with bash/filesystem access. They compose arbitrarily complex queries via CTEs, joins, aggregations, and window functions. The database is just another resource in their workspace.

**Design principle: Skills are the interface, not tools.** Skills evolve independently from runtime code. Update a skill file, not a tool implementation. Skills can include scripts. The agent gets better at using skills over time via self-improvement. Skills are a floor (agent starts there and grows), not a ceiling (agent can only do what the tool allows).

---

## Database Access

### Cortex Database

All memory data lives in a single SQLite database in WAL mode:

```
Path: ~/.nexus/data/cortex.db
Mode: WAL (concurrent readers, single writer)
```

The database path is stored in the skill folder at `skills/cortex/DB_PATH`. The full schema is at `skills/cortex/SCHEMA.md`.

### Schema Reference

The Cortex database contains three logical ledgers in one file:

#### Events Ledger (human communications + trimmed AI turns)

| Table | Purpose |
|-------|---------|
| `events` | All communication + document events across channels |
| `events_fts` | FTS5 full-text search index over event content |
| `event_participants` | Who was involved in each event (sender, recipient, cc, observer) |
| `event_state` | Mutable state: read/unread, flagged, archived, status |
| `event_tags` | Tags on events from various sources |
| `threads` | Grouping containers (chats, email threads, channels, sessions) |
| `attachments` | Media/file metadata for events |
| `document_heads` | Stable pointers for document-style events (skills, docs, memory, tools) |
| `bus_events` | Append-only event stream for downstream automation |

#### Core Ledger (knowledge graph + episodes)

| Table | Purpose |
|-------|---------|
| `entities` | Canonical, deduplicated entities (people, companies, projects, etc.) |
| `entity_aliases` | Identity markers: email, phone, handles, name variants |
| `relationships` | **Observation log** — every relationship observation, append-only |
| `episodes` | Episode instances (time-bounded conversation chunks) |
| `episode_definitions` | HOW to chunk events into episodes (strategy config) |
| `episode_events` | Which events belong to which episode (junction) |
| `episode_entity_mentions` | Which episodes mention which entities (junction) |
| `episode_relationship_mentions` | Relationship provenance across episodes |
| `embeddings` | Unified embedding storage for events, episodes, entities, relationships |
| `persons` | People with unified identity |
| `contacts` / `contact_identifiers` | Communication endpoints |
| `person_contact_links` | Links between persons and contacts |
| `person_facts` | Rich identity graph data (PII, professional, etc.) with attribution |
| `merge_candidates` | Suspected duplicate entities for review |
| `entity_merge_events` | Audit log for entity merges |
| `analysis_types` / `analysis_runs` / `facets` | Structured analysis outputs |

#### Agents Ledger (full fidelity AI sessions)

| Table | Purpose |
|-------|---------|
| `agent_sessions` | Session records from AIX (source, model, project, subagent linking) |
| `agent_messages` | All messages from AI sessions |
| `agent_turns` | Query + response exchanges for smart forking |
| `agent_tool_calls` | Tool invocations within messages |

---

## Skill Folder Structure

Each memory meeseeks gets a `skills/cortex/` folder in its workspace containing everything it needs to interact with the database:

```
skills/
  cortex/
    DB_PATH               # Just the path: ~/.nexus/data/cortex.db
    SCHEMA.md             # Full CREATE TABLE statements for all three ledgers
    QUERIES.md            # Common query patterns with examples
    cortex-search.sh      # Semantic + FTS5 hybrid search script
    cortex-write.sh       # Write helper with side-effect coordination
```

### SCHEMA.md

Contains the complete `CREATE TABLE` statements for every table in `cortex.db`. This is the agent's reference for composing queries. Automatically regenerated if the schema changes.

### QUERIES.md

Pre-built query patterns the agent can adapt:

```sql
-- Find all relationships for an entity (observation log)
SELECT r.*, e.canonical_name as source_name, e2.canonical_name as target_name
FROM relationships r
JOIN entities e ON r.source_entity_id = e.id
LEFT JOIN entities e2 ON r.target_entity_id = e2.id
WHERE r.source_entity_id = ?
ORDER BY r.created_at DESC;

-- Find entity by alias
SELECT e.* FROM entities e
JOIN entity_aliases ea ON e.id = ea.entity_id
WHERE ea.normalized = lower(?)
  AND e.merged_into IS NULL;

-- Recent episodes mentioning an entity
SELECT ep.*, eem.mention_count
FROM episodes ep
JOIN episode_entity_mentions eem ON ep.id = eem.episode_id
WHERE eem.entity_id = ?
ORDER BY ep.end_time DESC
LIMIT 10;

-- Person facts for identity data
SELECT * FROM person_facts
WHERE person_id = ?
  AND category = 'contact'
ORDER BY confidence DESC;

-- Full-text search over events
SELECT e.* FROM events e
JOIN events_fts fts ON e.id = fts.event_id
WHERE events_fts MATCH ?
ORDER BY rank
LIMIT 20;

-- Recent agent sessions about a topic
SELECT s.*, COUNT(m.id) as message_count
FROM agent_sessions s
JOIN agent_messages m ON s.id = m.session_id
WHERE m.content LIKE '%' || ? || '%'
GROUP BY s.id
ORDER BY s.created_at DESC
LIMIT 5;

-- Relationship observation history between two entities
SELECT r.fact, r.confidence, r.created_at,
       erm.source_type, erm.extracted_fact
FROM relationships r
LEFT JOIN episode_relationship_mentions erm ON r.id = erm.relationship_id
WHERE r.source_entity_id = ? AND r.target_entity_id = ?
ORDER BY r.created_at ASC;

-- Group entity detection: entities that co-occur in 3+ episodes
SELECT e1.id as entity_a, e2.id as entity_b,
       COUNT(DISTINCT m1.episode_id) as co_occurrences
FROM episode_entity_mentions m1
JOIN episode_entity_mentions m2
  ON m1.episode_id = m2.episode_id AND m1.entity_id < m2.entity_id
JOIN entities e1 ON m1.entity_id = e1.id
JOIN entities e2 ON m2.entity_id = e2.id
GROUP BY e1.id, e2.id
HAVING co_occurrences >= 3
ORDER BY co_occurrences DESC;
```

The agent uses these as starting points and composes its own queries as needed.

### cortex-search.sh

Semantic + FTS5 hybrid search. The one operation that requires more than raw SQL — it needs to:
1. Compute query embeddings via an embedding service
2. Compute vector similarity against the `embeddings` table
3. Cross-reference with FTS5 BM25 scores from `events_fts`
4. Rank across heterogeneous result types (entities, episodes, events, persons)
5. Join `entity_aliases` for alias-based matching

```bash
# Usage: cortex-search.sh "query text" [--scope entities,episodes,events] [--limit 10]
# Returns: JSON results with scores and match reasons
```

This could alternatively be implemented as a single structured `cortex_search` tool_use tool. The skill script approach is more consistent with the overall model; the tool approach is more ergonomic for the LLM. Both remain valid — the right choice depends on implementation experience.

### cortex-write.sh

Write helper that handles INSERT operations with side-effect coordination:

```bash
# Entity creation with alias handling
cortex-write.sh entity --name "Sarah Chen" --type Person \
  --alias "Sarah:name" --alias "sarah.chen@company.com:email"

# Relationship observation append
cortex-write.sh relationship \
  --source entity-123 --target entity-456 \
  --type WORKS_AT --fact "Sarah works at Anthropic" \
  --source-type self_disclosed --confidence 1.0

# Episode creation with event linking
cortex-write.sh episode \
  --channel imessage --start "2026-02-13T10:00:00Z" --end "2026-02-13T10:30:00Z" \
  --summary "Discussion about project timeline" \
  --events event-1,event-2,event-3 \
  --entities entity-123,entity-456
```

**Side effects handled by the script:**
- Alias normalization (lowercase, cleaned) for matching
- Background embedding generation trigger
- Merge candidate detection for new entities
- `episode_entity_mentions` / `episode_relationship_mentions` junction table rows
- UUID generation for new IDs

**Why a script instead of raw SQL?** Writes need coordination beyond simple INSERTs. The script encapsulates this plumbing so the agent stays focused on extraction intelligence.

---

## What Changed from Previous Design

### Removed: structured tool_use tools

| Old Tool | Replacement |
|----------|-------------|
| `cortex_entity_search` | `cortex-search.sh` or direct SQL on entities + entity_aliases |
| `cortex_entity_get` | SQL: `SELECT * FROM entities WHERE id = ?` + joins |
| `cortex_entity_create` | `cortex-write.sh entity` |
| `cortex_relationship_query` | SQL: `SELECT * FROM relationships WHERE ...` |
| `cortex_relationship_create` | `cortex-write.sh relationship` |
| `cortex_episode_search` | `cortex-search.sh` or direct SQL on episodes |
| `cortex_episode_get` | SQL: `SELECT * FROM episodes WHERE id = ?` + joins |
| `cortex_episode_create` | `cortex-write.sh episode` |
| `cortex_memory_pipeline` | **Removed** — Agent IS the pipeline. No single-call extraction. |
| `cortex_stats` | SQL: `SELECT COUNT(*) FROM entities; ...` |
| `cortex_merge_candidates_list` | SQL: `SELECT * FROM merge_candidates WHERE status = 'pending'` |
| `cortex_merge_resolve` | SQL: `UPDATE merge_candidates SET status = ?, resolved_at = ...` |
| `cortex_search` (tool) | `cortex-search.sh` (skill script) |
| `cortex_write_entity` (tool) | `cortex-write.sh entity` (skill script) |
| `cortex_write_relationship` (tool) | `cortex-write.sh relationship` (skill script) |
| `cortex_write_episode` (tool) | `cortex-write.sh episode` (skill script) |
| `memory_search` | `cortex-search.sh` |
| `memory_get` | Direct SQL on any table |
| `workspace_search` | Bash: `grep -r "pattern" workspace/` |
| `workspace_read` | Bash: `cat workspace/file.md` |

### Removed concepts

| Old Concept | Why Removed |
|-------------|-------------|
| HTTP API endpoints | Direct SQLite eliminates HTTP round-trip. Agent writes SQL directly. |
| `CortexClient` TypeScript class | No intermediary needed. Agent talks to DB directly via skills. |
| Structured tool_use tools for reads | Skills + raw SQL is more composable. No ceiling on what the agent can query. |
| Structured tool_use tools for writes | Skill scripts (`cortex-write.sh`) handle the same operations with side-effect coordination. |
| Relationship deduplication | Observation-log model. Every observation stored. |
| Contradiction detection at write time | Happens at read time. Reader interprets relationship history. |
| Identity promotion stage | Agent writes aliases directly in one pass. |

### New concepts

| New Concept | Purpose |
|-------------|---------|
| Skill files (SCHEMA.md, QUERIES.md) | Agent's reference for composing queries. Evolve independently from runtime. |
| Skill scripts (cortex-search.sh, cortex-write.sh) | Encapsulate operations needing coordination. Agent calls via bash. |
| Direct SQLite via `sqlite3` CLI | Maximum composability. Agent writes any query. |
| Observation-log model | Append-only relationships. No dedup, no invalidation at write. |
| Read-time interpretation | Reader synthesizes current truth from observation history. |
| Background embedding triggers | Write scripts trigger embedding generation asynchronously. Agent doesn't think about it. |

---

## Background Embedding System

Write scripts trigger background embedding generation. The agent doesn't need to think about embeddings — it writes entities, relationships, and episodes via `cortex-write.sh`, and embeddings happen automatically.

```
cortex-write.sh entity       → background: embed entity (canonical_name + summary)
cortex-write.sh relationship → background: embed relationship (fact text)
cortex-write.sh episode      → background: embed episode (summary + linked event content)
```

Embeddings are stored in the unified `embeddings` table:

```sql
SELECT * FROM embeddings WHERE target_type = 'entity' AND target_id = ?;
SELECT * FROM embeddings WHERE target_type = 'relationship' AND target_id = ?;
```

Re-embedding (when content changes) uses `source_text_hash` for change detection.

---

## Design Considerations

### Agentic Search Pattern

Skills are designed for **iterative, agentic use**. The memory reader doesn't make a single search call — it makes multiple calls, following leads:

1. `cortex-search.sh "Sarah project timeline"` → finds entity + episodes
2. SQL: `SELECT * FROM relationships WHERE source_entity_id = ?` → observation log
3. SQL: `SELECT * FROM person_facts WHERE person_id = ?` → identity data
4. SQL: `SELECT * FROM episode_entity_mentions WHERE entity_id IN (?, ?)` → cross-reference
5. SQL: `SELECT * FROM agent_turns WHERE ...` → recent AI session context

Each call returns enough context for the agent to decide what to search next. The agent learns better search strategies over time via self-improvement.

### Read-Time Relationship Interpretation

The reader interprets the observation log, not just returning raw rows:

```sql
SELECT fact, confidence, created_at FROM relationships
WHERE source_entity_id = 'tyler' AND relation_type = 'WORKS_AT'
ORDER BY created_at ASC;
```

Returns:
```
"Tyler works at Google" (0.8, 2024-03-15)
"Tyler left Google" (0.9, 2025-01-10)
"Tyler works at Anthropic" (1.0, 2025-02-01)
"Tyler is building Nexus at Anthropic" (1.0, 2026-02-10)
```

The reader synthesizes: "Tyler currently works at Anthropic (building Nexus). Previously at Google." This is richer than a binary valid/invalid state.

### Skills Evolve

The skill files in the workspace are living documents. Through self-improvement:
- The agent discovers new query patterns and adds them to QUERIES.md
- The agent learns about entity naming conventions and adds them to SKILLS.md
- The agent encounters edge cases and documents them in ERRORS.md
- Skill scripts can be updated (though this requires care — runtime-seeded scripts may need versioning)

### Extensibility

Entity types, relationship types, and fact types are all free-form strings. The skill scripts never reject an unknown type — just pass it through. New patterns emerge organically as the writer encounters new information.

---

## Open Questions

1. **cortex-search.sh vs cortex_search tool:** Should semantic search be a skill script the agent calls via bash, or a structured tool_use tool? Skill script is more consistent with the model. Structured tool is more ergonomic for LLM tool calling. Implementation experience will decide.

2. **Write script complexity:** How much coordination logic should `cortex-write.sh` handle? Minimal (just INSERT + embedding trigger) vs. comprehensive (alias normalization, merge candidate detection, mention junction tables). Start minimal, expand as needed.

3. **Skill file versioning:** When the schema changes, skill files need updating. Should this be automatic (regenerate SCHEMA.md on migration) or manual? Automatic is safer.

---

## Related Documents

- `MEMORY_SYSTEM.md` — Tripartite memory model
- `roles/MEMORY_READER.md` — Memory reader meeseeks role
- `roles/MEMORY_WRITER.md` — Memory writer meeseeks role
- `../../runtime/broker/MEESEEKS_PATTERN.md` — Meeseeks pattern and automation system
