# Database Architecture — Canonical Spec

**Status:** CANONICAL
> **Bundle:** Cross-cutting (touches Bundle A workspace lifecycle, Bundle B runtime routing, and data layer)
> **Supersedes:** Ad-hoc multi-ledger layout from legacy memory subprocess + nex split
> **Date:** 2025-02-18

---

## 1. Overview

Nexus uses a multi-database SQLite architecture. Each database file has a clear, single-sentence purpose and well-defined ownership boundaries. This spec defines:

- The **7 canonical databases**, their names, locations, and table inventories
- **What gets deleted** from the legacy layout (legacy memory DB duplication, stale tables, sync_watermarks)
- **What gets relocated** (entities → identity.db, legacy agent tables → gone, Go adapter sync → adapter-owned)
- **Migration paths** for each change
- The **adapter sync interface** that replaces centralized sync_watermarks

### Design Principles

1. **Single owner per table.** No table appears in more than one database.
2. **No cross-database foreign keys.** References across DBs use convention (e.g., `entity_id` in identity.db points to `entities.id` in identity.db).
3. **Write contention isolation.** Hot-path writes (events, agent turns, contact upserts) should not block each other.
4. **Adapters own their sync state.** No centralized `sync_watermarks` table. Each adapter manages its own cursor/watermark internally and exposes status via interface.
5. **One bus.** The Nex TypeScript `InMemoryEventBus` (with optional write-through to runtime.db) is the single event bus. The old Go-side `bus_events` is eliminated.

---

## 2. Database Inventory

All databases live under `{workspace}/state/data/`.

| # | File | Purpose (one sentence) | Owner |
|---|------|------------------------|-------|
| 1 | `events.db` | Raw inbound/outbound message events — the canonical event ledger. | Nex TS |
| 2 | `agents.db` | All agent session state: turns, messages, tool calls, artifacts. | Nex TS |
| 3 | `identity.db` | Who sent this, where do they live, can they access this — contacts, directory, entities, auth, ACL. | Nex TS |
| 4 | `memory.db` | What the AI remembers — elements (facts, observations, mental models), sets (episodes, clusters), jobs (retain, consolidate, reflect). | Nex TS |
| 5 | `embeddings.db` | Semantic vector index — shared by all subsystems that need similarity search. | Nex TS |
| 6 | `runtime.db` | How the system is running — request tracking, adapters, automations, bus. | Nex TS |
| 7 | `work.db` | What should happen — task definitions, work items, workflows, sequences for planned and scheduled work. | Nex TS |

### Legacy files to DELETE

| File | Why |
|------|-----|
| `state/cortex/cortex.db` | Legacy path, schema v21, stale columns. Replaced by `memory.db` + `identity.db` + `embeddings.db`. |
| `state/data/cortex.db` | Empty 0-byte artifact. |
| `state/data/cortex/cortex.db` | Replaced by `memory.db` + `embeddings.db` + tables relocated to `identity.db`. After migration, this file is superseded. |

---

## 3. Table Inventories

### 3.1 events.db — Event Ledger

Rebuilt per `nex/workplans/CUTOVER_03_EVENTS_DB.md`. Uses the canonical event schema from `NEXUS_REQUEST_TARGET.md`.

| Table | Purpose |
|-------|---------|
| `events` | Every inbound/outbound message. PK: `id`, UNIQUE: `(platform, event_id)`. Schema: `id, event_id, content, content_type, attachments (JSON), recipients (JSON), timestamp, received_at, platform, sender_id, receiver_id, space_id, container_kind, container_id, thread_id, reply_to_id, request_id, metadata`. |
| `events_fts` | FTS5 full-text search index on event content. |
| `attachments` | Relational attachment rows. PK: `(event_id, id)`. Application-code populated (no SQL triggers). See `ATTACHMENTS.md`. |
| `attachment_interpretations` | Media understanding results (transcriptions, vision descriptions). PK: `(event_id, attachment_id)`. |
| `event_state` | Per-event flags: viewed, archived, pinned, flagged. |
| `event_state_log` | Audit log for event state changes. |
| `tags` | Tag definitions (id, name, normalized). |
| `event_tags` | Many-to-many: events ↔ tags. |

**Removed:** `sync_watermarks` (see §5), `threads` (moved to identity.db), `event_participants` (replaced by `recipients` JSON column on events + `container_participants` in identity.db), `document_heads`, `retrieval_log`. Old `UNIQUE(source, source_id)` replaced by `UNIQUE(platform, event_id)`.

**Schema source:** `nex/src/db/events.ts`

---

### 3.2 agents.db — Agent Sessions

No changes from current state. Clean and well-scoped.

| Table | Purpose |
|-------|---------|
| `sessions` | Agent session metadata (label, persona, routing_key, origin, status). |
| `session_history` | Thread-change log per session. |
| `session_aliases` | Alias → session_key mappings. |
| `threads` | Thread state per turn (ancestry, token count, depth). |
| `turns` | Individual LLM turn metadata (model, tokens, status, role). |
| `messages` | All messages within turns (user/assistant/system/tool). |
| `tool_calls` | Tool call records with params/results. |
| `compactions` | Context summarization records. |
| `queue_items` | Message queue for sessions (steer/followup/collect/interrupt). |
| `message_files` | Files referenced by messages. |
| `message_lints` | Lint results associated with messages. |
| `message_codeblocks` | Code blocks extracted from messages. |
| `artifacts` | File artifacts produced by agents. |
| `tool_call_artifacts` | Join table: tool_calls ↔ artifacts. |
| `session_imports` | External session import tracking (source → session mapping). |
| `session_import_requests` | Idempotency tracking for import requests. |
| `session_import_chunk_parts` | Chunked upload state for session imports. |

**Schema source:** `nex/src/db/agents.ts`

---

### 3.3 identity.db — Identity, Directory, Entities, Auth, ACL

This is the largest change from the legacy layout. It unifies:
- **Contacts + Delivery Directory** (from Bundle B / RUNTIME_ROUTING + DELIVERY_DIRECTORY_SCHEMA)
- **Entities + Knowledge Graph** (relocated from legacy memory DB)
- **Auth** (preserved from old identity.db)
- **Access Control** (relocated from nexus.db)

#### Contacts & Directory

| Table | Purpose |
|-------|---------|
| `contacts` | Pipeline-speed identity resolution: `(platform, space_id, contact_id) → entity_id`. PK: `(platform, space_id, contact_id)`. |
| `spaces` | Server/workspace directory: `(platform, account_id, space_id)`. |
| `containers` | Direct/group container directory: `(platform, account_id, container_id)`. Includes `container_kind` (direct, group). |
| `container_participants` | Observed participants per container/thread. |
| `membership_events` | Explicit join/leave/kick events (when available from platform). |
| `names` | **Unified name-history table** for spaces, containers, and threads. Replaces the three separate `delivery_space_names`, `delivery_container_names`, `delivery_thread_names` tables. |
| `threads` | Sub-container threads: `(platform, account_id, container_id, thread_id)`. |

**`names` table schema:**
```sql
CREATE TABLE IF NOT EXISTS names (
  kind         TEXT NOT NULL,  -- 'space' | 'container' | 'thread'
  platform     TEXT NOT NULL,
  account_id   TEXT NOT NULL,
  target_id    TEXT NOT NULL,  -- space_id, container_id, or thread_id depending on kind
  parent_id    TEXT NOT NULL DEFAULT '',  -- container_id for threads, '' otherwise
  name         TEXT NOT NULL,
  first_seen   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL,
  PRIMARY KEY (kind, platform, account_id, target_id, parent_id, name)
);

CREATE INDEX IF NOT EXISTS idx_names_last_seen ON names(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_names_target ON names(kind, platform, account_id, target_id);
```

**Note:** The `delivery_` prefix is dropped from all table names. Tables are just `spaces`, `containers`, `threads`, etc. The `delivery_` prefix added noise without clarity — the database name (`identity.db`) provides sufficient context.

#### Entities & Knowledge Graph

| Table | Purpose |
|-------|---------|
| `entities` | Named entities (people, orgs, places, concepts). Schema: `(id, name, type, merged_into, normalized, is_user, origin, mention_count, created_at, updated_at)`. Union-find merge chain via `merged_into`. |
| `entity_tags` | Tags on entities. Lifecycle pattern: `(id, entity_id, tag, created_at, deleted_at)`. |
| `merge_candidates` | Potential entity merges awaiting resolution. |

**Key:** `contacts.entity_id` → `entities.id`. Both in the same DB, so JOINs and FK integrity are possible.

#### Auth

| Table | Purpose |
|-------|---------|
| `auth_tokens` | Control-plane + ingress API tokens. SHA-256 hashed. |
| `auth_passwords` | Hashed passwords per entity (Argon2). |

#### Access Control

| Table | Purpose |
|-------|---------|
| `grants` | ACL permission grants. |
| `grant_log` | Audit log for grant changes. |
| `access_log` | Access decision log. |
| `permission_requests` | Pending permission requests from agents/adapters. |

**Note:** The `acl_` prefix is dropped. The table names are self-descriptive within identity.db context.

**Schema source:** `nex/src/db/identity.ts` (contacts, directory, auth — already updated for Bundle B), plus new tables for entities and ACL.

---

### 3.4 memory.db — Memory System

Successor to the legacy memory DB. Uses the **Elements/Sets/Jobs** unified storage model. All derived knowledge lives in a single `elements` table with a `type` discriminator. Collections are modeled as `sets` with polymorphic membership. Processing operations are tracked as `jobs` with typed outputs. See `MEMORY_STORAGE_MODEL.md` for full schema and design rationale.

#### Elements (derived knowledge)

| Table | Purpose |
|-------|---------|
| `elements` | Unified table for all derived knowledge: facts (`type='fact'`), observations (`type='observation'`), mental models (`type='mental_model'`). Version chains via `parent_id`. |
| `elements_fts` | FTS5 full-text search across ALL element types (replaces fact-only `facts_fts`). |
| `element_entities` | Join: elements ↔ entities (entity_id references identity.db by convention). Generalizes old `fact_entities` to all element types. |
| `element_links` | Typed directed links between elements: `causal`, `supports`, `contradicts`, `supersedes`, `derived_from`. Generalizes old `causal_links`. |

#### Sets (collections)

| Table | Purpose |
|-------|---------|
| `sets` | Collections of events/elements/sets. Episodes are sets with `definition_id='retain'`. |
| `set_members` | Polymorphic membership: `member_type` = `'event'`, `'element'`, or `'set'`. Position-ordered. |
| `set_definitions` | Templates describing how sets are constructed (strategy + config). |

#### Jobs (processing operations)

| Table | Purpose |
|-------|---------|
| `job_types` | Processing operation type definitions (e.g., `retain_v1`, `consolidate_v1`). |
| `jobs` | Processing execution records with status tracking, model info, raw output. Idempotent: `UNIQUE(type_id, input_set_id)`. |
| `job_outputs` | Join: jobs ↔ elements. Tracks which elements a job produced (full provenance). |

#### Provenance & tracking

| Table | Purpose |
|-------|---------|
| `processing_log` | Tracks "has target X been processed by job type Y?" — replaces `is_consolidated` boolean. PK: `(target_type, target_id, job_type_id)`. |
| `resolution_log` | Entity resolution audit trail: creation, linking, merging, retyping decisions with evidence. |
| `access_log` | Lightweight access tracking for elements, sets, and jobs. |
| `schema_version` | Schema version tracking. |

**Superseded tables (removed from old schema):**

| Removed Table | Replaced By |
|---------------|-------------|
| `facts` | `elements WHERE type = 'fact'` |
| `fact_entities` | `element_entities` |
| `facts_fts` | `elements_fts` |
| `observation_facts` | `set_members` |
| `mental_models` | `elements WHERE type = 'mental_model'` |
| `causal_links` | `element_links` |
| `facets` | Removed (unused at runtime) |
| `episodes` | `sets` |
| `episode_definitions` | `set_definitions` |
| `episode_events` | `set_members WHERE member_type = 'event'` |
| `analysis_types` | `job_types` |
| `analysis_runs` | `jobs` + `elements WHERE type = 'observation'` |
| `memory_processing_log` | `processing_log` |
| `bus_events` | Nex bus is the single bus. Old Go bus eliminated. |
| `sync_watermarks` | Adapters own their sync state. See §5. |
| `sync_jobs` | Go sync pipeline eliminated. |
| `adapter_state` | Go adapter key-value store eliminated. |
| `agent_sessions/turns/messages/tool_calls` | Duplicates of agents.db. Eliminated. |

**Note on memory pipeline reads:** The memory extraction pipeline reads from `agents.db` (for turn/message data) and `events.db` (for event data) via cross-DB ATTACH. Three meeseeks automations (writer, consolidator, injection) produce and consume elements/sets/jobs.

**Schema source:** `nex/src/db/memory.ts` (TS-owned schema file). Full SQL in `MEMORY_STORAGE_MODEL.md`.

---

### 3.5 embeddings.db — Semantic Vector Index

Split out from the legacy memory DB. Embeddings are a shared resource — multiple subsystems generate and query them.

| Table | Purpose |
|-------|---------|
| `embeddings` | Text embedding metadata: `(id, target_type, target_id, model, dimensions, embedding_json, created_at)`. |
| `vec_embeddings` | sqlite-vec virtual table for vector similarity search. |

**Why separate?**
1. sqlite-vec uses custom virtual tables with specific pragma requirements. Isolating avoids pragma conflicts with other tables.
2. Embeddings serve multiple consumers (memory recall, entity search, event search) — they're a shared index, not owned by one subsystem.
3. Batch embedding writes (during memory processing) don't compete with fact/episode writes.
4. Future: multiple subsystems can embed and query without opening the entire memory DB.

**Schema source:** `nex/src/db/embeddings.ts` (TS-owned schema file).

---

### 3.6 runtime.db — Runtime Operations

Renamed from `nexus.db`. Captures all runtime orchestration state.

| Table | Purpose |
|-------|---------|
| `nexus_requests` | Per-request pipeline tracking (identity → access → session → agent → delivery). |
| `adapter_instances` | Registered adapter instances with supervision state (health, restart_count, backfill_cursor as cached snapshot). |
| `automations` | Hook/automation definitions (was `hooks`, renamed). |
| `hook_invocations` | Hook execution log (per event × hook). |
| `import_jobs` | External data import job tracking (AIX backfill). |
| `bus_events` | Nex event bus write-through persistence (optional, retention-pruned). |

**Removed:** `sync_watermarks` — adapters own their state. See §5.

**Relocated from old nexus.db:**

| Table | Old Name | New Name | Notes |
|-------|----------|----------|-------|
| `acl_grants` | `acl_grants` | → `grants` in identity.db | ACL belongs with identity |
| `acl_grant_log` | `acl_grant_log` | → `grant_log` in identity.db | ACL belongs with identity |
| `acl_access_log` | `acl_access_log` | → `access_log` in identity.db | ACL belongs with identity |
| `acl_permission_requests` | `acl_permission_requests` | → `permission_requests` in identity.db | ACL belongs with identity |
| `aix_import_jobs` | `aix_import_jobs` | `import_jobs` | Dropped `aix_` prefix since it's the only import type |

**Schema sources:** `nex/src/db/nexus.ts` (requests, import_jobs), `nex/src/db/hooks.ts` (automations, hook_invocations), `nex/src/nex/adapters/adapter-state-db.ts` (adapter_instances), `nex/src/nex/bus.ts` (bus_events).

---

### 3.7 work.db — Work Management

Tracks future work: task definitions, work items, workflow definitions, and sequences. See `work-system/CRM_ANALYSIS_AND_WORK_SYSTEM.md` for full schema and design rationale.

| Table | Purpose |
|-------|---------|
| `tasks` | Atom definitions: templates for kinds of work (follow_up, outreach, review, etc.). |
| `workflows` | Collection definitions: templates for sequences of tasks with ordered steps. |
| `workflow_steps` | Ordered task references within a workflow, with dependencies and overrides. |
| `work_items` | Atom instances: specific work to be done, with immutable core + mutable state cache. |
| `work_item_events` | Immutable audit log of all work item state changes. |
| `sequences` | Collection instances: specific sequences of work items, self-referential for nesting (campaigns). |

**Design principles:**
- Immutable core record + mutable state cache + immutable event log (same pattern as events.db `event_state`/`event_state_log`).
- Entity binding is optional — work items can exist independently of entities.
- The clock/cron adapter reads work.db directly as a schedule source, firing due work items as NexusEvents.
- Sequences nest via `parent_sequence_id` for campaigns.

**Schema source:** `work-system/CRM_ANALYSIS_AND_WORK_SYSTEM.md` §4 (to be implemented as `nex/src/db/work.ts`).

---

## 4. Go Memory Subprocess Elimination Plan

### Context

The old Go memory binary (`nex/cortex/`) previously served two roles:
1. **Sync pipeline** — Go adapters (eve, gmail, bird, aix, calendar, contacts, nexus) that pulled data from external sources into events.db and the legacy memory DB.
2. **HTTP serve** — `/recall` and `/search` endpoints for semantic memory retrieval.

All of this has been unified into the single TypeScript nex process. Long-term, the entire system will be ported to Go as a single binary.

### What Gets Eliminated

#### 4.1 Go Sync Adapters — DELETED

All Go memory subprocess adapters are already ported to Nex TS. The following Go adapter code is dead:

| Go Adapter | File | Status |
|------------|------|--------|
| Eve (iMessage) | `cortex/internal/adapters/eve.go` | Replaced by Nex TS adapter |
| Gmail | `cortex/internal/adapters/gmail.go` | Replaced by Nex TS adapter |
| Calendar | `cortex/internal/adapters/calendar.go` | Replaced by Nex TS adapter |
| Google Contacts | `cortex/internal/adapters/contacts.go` | Replaced by Nex TS adapter |
| AIX | `cortex/internal/adapters/aix.go` | Replaced by Nex TS `AixImportRuntime` |
| AIX Events | `cortex/internal/adapters/aix_events.go` | Replaced by Nex TS |
| AIX Agents | `cortex/internal/adapters/aix_agents.go` | Replaced by Nex TS |
| Nexus | `cortex/internal/adapters/nexus.go` | Replaced by Nex TS |
| Bird (Twitter) | `cortex/internal/adapters/bird.go` | Replaced by Nex TS adapter |

The entire `cortex/internal/adapters/` directory, `cortex/internal/sync/` directory, and related legacy CLI commands have been removed.

#### 4.2 Go Bus — DELETED

`cortex/internal/bus/bus.go` — Replaced by Nex `InMemoryEventBus`.

#### 4.3 Go Adapter State — DELETED

`cortex/internal/state/state.go` — Generic key-value store. Not needed; each adapter manages its own state.

#### 4.4 Go Agent Ledger Tables — DELETED

`agent_sessions`, `agent_turns`, `agent_messages`, `agent_tool_calls` in the legacy memory DB schema. These were copies of agents.db data. The memory pipeline now reads from agents.db directly.

### What Gets Ported to TS

#### 4.5 Memory Pipeline — PORT TO TS

The memory extraction pipeline (formerly `cortex/internal/memory/pipeline.go`, now ported to TS) is the high-value logic:
1. Extract entities from episodes
2. Resolve entity references
3. Extract relationships
4. Detect contradictions
5. Generate embeddings
6. Create entity mentions

This must be ported to TypeScript. It currently uses Gemini for extraction — the TS port should use the Nex LLM abstraction layer.

#### 4.6 HTTP Recall/Search — PORT TO TS

`/recall` and `/search` endpoints. These query facts, entities, and embeddings. Port to Nex TS HTTP server endpoints.

### Memory Pipeline Data Flow (Post-Migration)

```
events.db (raw events) ──read──→ Memory Pipeline (TS)
agents.db (agent turns) ──read──→ Memory Pipeline (TS)
                                       │
                                       ├──write──→ memory.db (elements, sets, jobs, processing_log)
                                       ├──write──→ identity.db (entities, entity_tags, merge_candidates)
                                       └──write──→ embeddings.db (vec_embeddings)
```

---

## 5. Sync Watermarks Elimination

### Problem

The legacy system had `sync_watermarks` tables in both events.db and the legacy memory DB. The old Go adapters wrote watermarks into events.db directly, creating cross-process SQLite contention and dual-ownership confusion. The Nex TS adapter supervisor separately tracked `backfill_cursor` on `adapter_instances`.

### Decision

**`sync_watermarks` is removed from ALL databases.** No exceptions.

### How Adapters Track Sync State

Each adapter is responsible for persisting its own sync position. The adapter interface exposes sync status for external querying:

```typescript
interface AdapterSyncStatus {
  last_sync_at: number | null;
  cursor: string | null;
  status: 'idle' | 'syncing' | 'backfilling' | 'error';
  error?: string;
  stats?: {
    events_synced?: number;
    last_event_id?: string;
  };
}

interface Adapter {
  // ... existing methods ...

  /** Adapter reports its self-managed sync position. */
  getSyncStatus(): AdapterSyncStatus;

  /** Adapter manager can request a sync cycle. */
  sync(opts?: { full?: boolean }): Promise<SyncResult>;
}
```

**Where adapters store their watermarks:**
- Each adapter manages its own internal cursor. This may be:
  - A field in the adapter's in-memory state (lost on restart, re-derived from source)
  - A file in the adapter's data directory
  - A row in a small adapter-specific SQLite DB
  - Platform API state (e.g., Gmail historyId, Slack cursor token)
- The choice is adapter-internal. The Nex adapter manager does not prescribe storage.

**The `backfill_cursor` field on `adapter_instances` in runtime.db** becomes a **cached snapshot** of the adapter's self-reported sync position. Updated when the adapter manager polls `getSyncStatus()`. It is NOT the source of truth — the adapter is.

### AIX Import Pipeline

The AIX import pipeline (`AixImportRuntime`) already manages its own sync state via the `import_jobs` table in runtime.db. It does not use `sync_watermarks`. No changes needed for AIX.

### Migration Steps

1. Remove `sync_watermarks` from events.db schema (`nex/src/db/events.ts`).
2. Remove `sync_watermarks` from memory.db schema.
3. Remove all Go adapter code that reads/writes `sync_watermarks` (already dead — Go adapters are eliminated per §4.1).
4. Update adapter interface specs to document `getSyncStatus()` contract.
5. On existing workspaces: the table can be left in place (harmless) or dropped via migration. No data loss — watermarks are ephemeral.

---

## 6. Identity DB — Detailed Migration

### From Old Schema

The old identity.db had:
- `entities` (id, name, type) — local copy of memory system entities → **DROPPED** (entities move to identity.db with the V2 schema)
- `identity_mappings` (channel, identifier → entity_id) — superseded by new `contacts` table → **DROPPED**
- `entity_tags` — local copy → **DROPPED** (entity_tags move to identity.db from legacy memory DB)
- `contacts` (old format) → **REPLACED** by new `contacts` with `(platform, space_id, contact_id)` PK
- `auth_tokens` → **PRESERVED** (data migrated)
- `auth_passwords` → **PRESERVED** (data migrated)

### Migration Code Status

`identity.ts` already implements the migration:
- `isIdentitySchemaV2()` detects old vs new schema
- `ensureIdentitySchema()` backs up auth data, drops old tables, creates new schema, restores auth data
- This runs automatically on next boot

### Additional Migrations Needed

1. **Entities from legacy memory DB → identity.db:** The `entities`, `entity_tags`, `merge_candidates` tables previously lived in the legacy memory DB (schema v22). They have been migrated to identity.db. Entity co-occurrence is derived at query time from `element_entities` in memory.db — no denormalized table needed.

2. **ACL from nexus.db → identity.db:** The `acl_grants`, `acl_grant_log`, `acl_access_log`, `acl_permission_requests` tables move from nexus.db to identity.db, dropping the `acl_` prefix.

3. **Delivery Directory table renames:** The `delivery_` prefix is dropped. `delivery_spaces` → `spaces`, `delivery_containers` → `containers`, etc. The three separate name-history tables (`delivery_space_names`, `delivery_container_names`, `delivery_thread_names`) are consolidated into a single `names` table.

---

## 7. Memory DB — Detailed Migration

### From Legacy Memory DB

`memory.db` is the successor to the legacy `state/data/cortex/cortex.db`.

**Tables that move to memory.db (rewritten as Elements/Sets/Jobs):**
- `elements`, `elements_fts`, `element_entities`, `element_links`
- `sets`, `set_members`, `set_definitions`
- `job_types`, `jobs`, `job_outputs`
- `processing_log`, `resolution_log`, `access_log`
- `schema_version`

Note: The old tables (`facts`, `fact_entities`, `mental_models`, `causal_links`, `episodes`, `episode_events`, `analysis_types`, `analysis_runs`, etc.) are superseded by the unified schema above. See `MEMORY_STORAGE_MODEL.md` for the full mapping.

**Tables that move to identity.db:**
- `entities`, `entity_tags`, `merge_candidates`

**Tables that move to embeddings.db:**
- `embeddings`, `vec_embeddings`

**Tables DELETED (no migration needed — data is duplicated or ephemeral):**
- `bus_events` — old internal bus log, ephemeral
- `sync_watermarks` — ephemeral sync cursors
- `sync_jobs` — ephemeral job state
- `adapter_state` — ephemeral adapter state
- `agent_sessions`, `agent_turns`, `agent_messages`, `agent_tool_calls` — duplicates of agents.db

### Cross-DB Reference Updates

After migration, memory.db tables that reference `entity_id` (e.g., `element_entities.entity_id`, `elements.entity_id`) will reference entities in **identity.db** by convention. No foreign key enforcement across databases — the application layer ensures consistency.

---

## 8. Runtime DB — Detailed Migration

### From nexus.db

`runtime.db` is the successor to `nexus.db`.

**Tables that stay:**
- `nexus_requests` (unchanged)
- `adapter_instances` (unchanged, `backfill_cursor` becomes cached snapshot)
- `automations` (unchanged)
- `hook_invocations` (unchanged)
- `bus_events` (Nex write-through bus, unchanged)

**Tables renamed:**
- `aix_import_jobs` → `import_jobs`

**Tables relocated to identity.db:**
- `acl_grants` → `grants`
- `acl_grant_log` → `grant_log`
- `acl_access_log` → `access_log`
- `acl_permission_requests` → `permission_requests`

**Tables DELETED:**
- `sync_watermarks` — if present, removed per §5

---

## 9. File Layout (Post-Migration)

```
{workspace}/state/data/
├── events.db          # 578 MB — event ledger (11 tables)
├── agents.db          # 8.0 GB — agent sessions (16 tables)
├── identity.db        # ~1 MB  — contacts, directory, entities, auth, ACL (~16 tables)
├── memory.db          # ~2 MB  — elements, sets, jobs (14 tables)
├── embeddings.db      # ~1 MB  — vector index (2 tables + sqlite-vec internals)
├── runtime.db         # ~250 KB — requests, adapters, automations, bus (6 tables)
└── work.db            # ~0 KB  — tasks, work items, workflows, sequences (6 tables)
```

**Deleted:**
```
{workspace}/state/cortex/                  # LEGACY directory — delete
{workspace}/state/data/cortex.db           # EMPTY ARTIFACT — delete
{workspace}/state/data/cortex/             # SUPERSEDED by memory.db + identity.db + embeddings.db — delete
```

---

## 10. Implementation Workplan

### Phase 1: Schema Definitions (TS)

Create or update TypeScript schema files for each database:

| Task | File | Notes |
|------|------|-------|
| Update events.db schema | `nex/src/db/events.ts` | Remove `sync_watermarks` from schema SQL |
| Update identity.db schema | `nex/src/db/identity.ts` | Add entities, entity_tags, merge_candidates, ACL tables, unified `names` table. Rename `delivery_*` tables. |
| Create memory.db schema | `nex/src/db/memory.ts` | New file. Facts, episodes, analysis tables from legacy memory DB schema. |
| Create embeddings.db schema | `nex/src/db/embeddings.ts` | New file. embeddings + vec_embeddings. |
| Update runtime.db schema | `nex/src/db/nexus.ts` | Remove ACL tables (moved to identity). Rename `aix_import_jobs` → `import_jobs`. Remove `sync_watermarks` if present. |
| Update hooks schema | `nex/src/db/hooks.ts` | No changes needed — automations + hook_invocations stay in runtime.db. |
| Create work.db schema | `nex/src/db/work.ts` | New file. Tasks, workflows, workflow_steps, work_items, work_item_events, sequences. See `work-system/CRM_ANALYSIS_AND_WORK_SYSTEM.md` §4. |

### Phase 2: Ledger Manager Updates

Update `nex/src/db/ledgers.ts` to:
- Open 7 databases instead of 5
- Use new file names (`memory.db`, `embeddings.db`, `runtime.db`, `work.db`)
- Add migration logic for existing workspaces (detect old file names, migrate)

### Phase 3: Data Migrations

| Migration | From | To | Strategy |
|-----------|------|----|----------|
| Entities + entity_tags + cooccurrences + merge_candidates | legacy memory DB | identity.db | Copy rows, then drop from legacy DB |
| ACL tables | nexus.db | identity.db | Copy rows, drop from nexus, rename (drop `acl_` prefix) |
| Facts + episodes + analysis | legacy memory DB | memory.db | File rename or row copy |
| Embeddings | legacy memory DB | embeddings.db | Row copy |
| Agent tables | legacy memory DB | (nowhere) | Delete — data exists in agents.db |
| Bus/sync/adapter_state | legacy memory DB | (nowhere) | Delete — ephemeral |
| sync_watermarks | events.db | (nowhere) | Delete — adapters own state |

### Phase 4: Code Updates

| Area | What Changes |
|------|--------------|
| Memory pipeline | Reads from agents.db + events.db. Writes to memory.db + identity.db (entities) + embeddings.db. |
| Identity resolution | Uses contacts + entities from identity.db (same DB = JOINable). |
| Runtime boot | Opens 7 DBs. Seeds owner entity in identity.db. |
| Adapter manager | Queries `getSyncStatus()` on adapters instead of reading `sync_watermarks`. Updates `backfill_cursor` snapshot on `adapter_instances`. |
| ACL checks | Reads from identity.db instead of nexus.db (runtime.db). |
| Recall/search endpoints | Port from Go to TS. Query memory.db + embeddings.db + identity.db (entities). |
| Go memory binary (eliminated) | All Go packages removed. Memory pipeline and HTTP serve ported to TS. |

### Phase 5: Go Memory Subprocess Cleanup (Complete)

1. Deleted `cortex/internal/adapters/` — all adapters are Nex TS now.
2. Deleted `cortex/internal/sync/` — sync is adapter-owned.
3. Deleted `cortex/internal/bus/` — Nex bus is the single bus.
4. Deleted `cortex/internal/state/` — adapters own their state.
5. Removed agent ledger tables from legacy schema.
6. Remove `sync_watermarks`, `sync_jobs`, `bus_events`, `adapter_state` from schema.
7. Update memory pipeline to read agents.db and events.db directly.
8. Update `/recall` and `/search` to query new DB locations.

### Phase 6: Adapter Interface Update

1. Define `AdapterSyncStatus` type and `getSyncStatus()` method on adapter interface.
2. Update each Nex TS adapter to implement self-managed sync state.
3. Update adapter manager to poll `getSyncStatus()` and cache to `adapter_instances.backfill_cursor`.
4. Remove any remaining `sync_watermarks` references from adapter specs/SDKs.
5. Update adapter documentation/specs.

---

## 11. Conceptual Groupings Reference

For comprehension purposes, here are the high-level conceptual groupings of all tables:

| Group | What it is | DB |
|-------|-----------|-----|
| **Events** | Raw message log | events.db |
| **Agents** | AI session execution | agents.db |
| **Contacts & Directory** | Who sent this, from where | identity.db |
| **Auth** | Tokens + passwords | identity.db |
| **Access Control** | Grants + audit | identity.db |
| **Entities & Knowledge Graph** | Named entities, merges, co-occurrence | identity.db |
| **Memory / Elements** | Derived knowledge (facts, observations, mental models) | memory.db |
| **Memory Pipeline** | Sets (episodes, clusters) + jobs (retain, consolidate, reflect) | memory.db |
| **Embeddings** | Semantic vector index | embeddings.db |
| **Runtime Operations** | Request tracking, adapters, automations, bus | runtime.db |
| **Work Management** | Task definitions, work items, workflows, sequences | work.db |

---

## 12. Stale Documentation to Update

| Document | Location | What Changes |
|----------|----------|--------------|
| Legacy SCHEMA.md | `state/meeseeks/memory-writer/skills/cortex/SCHEMA.md` | Completely stale (pre-V2 schema with persons, contacts, etc.). Must be rewritten for memory.db schema. |
| RUNTIME_ROUTING.md | `nexus-specs/specs/runtime/RUNTIME_ROUTING.md` | Still uses old `(channel, identifier)` terminology. Update to `(platform, space_id, sender_id)` per delivery taxonomy. |
| DELIVERY_DIRECTORY_SCHEMA.md | `nexus-specs/specs/runtime/DELIVERY_DIRECTORY_SCHEMA.md` | Update to reflect dropped `delivery_` prefix and unified `names` table. |
| IDENTITY_GRAPH.md | `nexus-specs/specs/data/ledgers/IDENTITY_GRAPH.md` | Update to reflect entities now in identity.db, old identity_mappings eliminated. |
| EVENTS_LEDGER.md | `nexus-specs/specs/data/ledgers/EVENTS_LEDGER.md` | Update to remove `sync_watermarks` from documented schema. |
| NEXUS_LEDGER.md | `nexus-specs/specs/data/ledgers/NEXUS_LEDGER.md` | Update for rename to runtime.db, ACL tables relocated, import_jobs rename. |
| BUS_ARCHITECTURE.md | `nexus-specs/specs/runtime/nex/BUS_ARCHITECTURE.md` | Update to state single Nex bus, old Go bus eliminated. |
| CORTEX_NEX_MIGRATION.md | `nexus-specs/specs/data/_archive/CORTEX_NEX_MIGRATION.md` | Archived. Superseded by this spec's migration plan. |
| Event ledger unification | `docs/refactor/event-ledger-unification.md` | May need updates re: memory.db reading events.db. |
