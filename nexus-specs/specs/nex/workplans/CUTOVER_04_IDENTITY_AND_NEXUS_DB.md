# Cutover 04 — Identity DB & Nexus DB Changes

**Status:** ACTIVE
**Phase:** 4–5 (parallel with Phases 2–3, depends on Phase 1)
**Target Spec:** [NEXUS_REQUEST_TARGET.md](../NEXUS_REQUEST_TARGET.md)
**Source Files:**
- `src/db/identity.ts` (large — targeted changes)
- `src/db/nexus.ts` (334 lines of schema — significant rewrite)

---

## Part A: Identity DB Changes

### 1. entity_tags — Immutable Row Pattern

**Current schema** (identity.ts IDENTITY_SCHEMA_SQL):
```sql
CREATE TABLE IF NOT EXISTS entity_tags (
  entity_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  tag         TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  deleted_at  INTEGER,
  PRIMARY KEY (entity_id, tag)
);
```

**Target schema:**
```sql
CREATE TABLE IF NOT EXISTS entity_tags (
  id          TEXT PRIMARY KEY,
  entity_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  tag         TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  deleted_at  INTEGER,

  UNIQUE(entity_id, tag) WHERE deleted_at IS NULL
);

CREATE INDEX IF NOT EXISTS idx_entity_tags_entity ON entity_tags(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_tags_active ON entity_tags(entity_id) WHERE deleted_at IS NULL;
```

**Changes:**
- ADD `id TEXT PRIMARY KEY` — each row is a unique immutable fact
- CHANGE PK from `(entity_id, tag)` to `id`
- ADD partial unique index `UNIQUE(entity_id, tag) WHERE deleted_at IS NULL` — only one active row per entity+tag
- ADD index `idx_entity_tags_active` for fast active-row queries

**Behavioral change:**
- When a tag is removed: `UPDATE entity_tags SET deleted_at = ? WHERE id = ?` (soft delete)
- When a tag is re-added: `INSERT INTO entity_tags (id, entity_id, tag, created_at) VALUES (...)` (new row)
- Full history: `SELECT * FROM entity_tags WHERE entity_id = ? ORDER BY created_at`
- Current tags: `SELECT tag FROM entity_tags WHERE entity_id = ? AND deleted_at IS NULL`

**Functions to update:**
- Tag add: INSERT new row (don't upsert on PK)
- Tag remove: UPDATE existing active row to set deleted_at
- Tag hydration: SELECT WHERE deleted_at IS NULL

### 2. entity_tag_events — DROP

**Current schema:**
```sql
CREATE TABLE IF NOT EXISTS entity_tag_events (
  id          TEXT PRIMARY KEY NOT NULL,
  entity_id   TEXT NOT NULL,
  tag         TEXT NOT NULL,
  action      TEXT NOT NULL,   -- 'added' | 'removed'
  actor       TEXT,
  reason      TEXT,
  created_at  INTEGER NOT NULL
);
```

**Action:** DELETE this table entirely. History is captured by the immutable row pattern on `entity_tags` itself. Each row in `entity_tags` IS the historical record — `created_at` = when added, `deleted_at` = when removed.

### 3. persona_bindings → entity_persona

**Current schema:**
```sql
CREATE TABLE IF NOT EXISTS persona_bindings (
  id                  TEXT PRIMARY KEY,
  receiver_entity_id  TEXT NOT NULL,
  sender_entity_id    TEXT,
  agent_id            TEXT NOT NULL,        -- DELETE
  persona_ref         TEXT NOT NULL,
  priority            INTEGER NOT NULL DEFAULT 0,
  active              INTEGER NOT NULL DEFAULT 1,  -- DELETE (use deleted_at)
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL      -- DELETE (immutable rows)
);
```

**Target schema:**
```sql
CREATE TABLE IF NOT EXISTS entity_persona (
  id                  TEXT PRIMARY KEY,
  receiver_entity_id  TEXT NOT NULL,
  sender_entity_id    TEXT,              -- NULL = default for all senders
  persona_ref         TEXT NOT NULL,     -- persona folder name
  priority            INTEGER NOT NULL DEFAULT 0,
  created_at          INTEGER NOT NULL,
  deleted_at          INTEGER,

  UNIQUE(receiver_entity_id, sender_entity_id, persona_ref) WHERE deleted_at IS NULL
);

CREATE INDEX IF NOT EXISTS idx_entity_persona_receiver ON entity_persona(receiver_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_persona_active ON entity_persona(receiver_entity_id) WHERE deleted_at IS NULL;
```

**Changes:**
- RENAME table: `persona_bindings` → `entity_persona`
- DROP `agent_id` column — the entity itself carries its type; persona_ref resolves to a folder
- DROP `active` column — replaced by `deleted_at` (NULL = active)
- DROP `updated_at` column — rows are immutable facts
- ADD `deleted_at` column
- ADD partial unique index
- Same immutable row pattern as entity_tags

**Functions to update:**
- `PersonaBindingRow` interface → rename to `EntityPersonaRow`, update fields
- All functions that query/upsert persona_bindings → update table name and column names
- Persona resolution query: `SELECT persona_ref FROM entity_persona WHERE receiver_entity_id = ? AND (sender_entity_id = ? OR sender_entity_id IS NULL) AND deleted_at IS NULL ORDER BY CASE WHEN sender_entity_id IS NOT NULL THEN 0 ELSE 1 END, priority DESC LIMIT 1`

### 4. persona_binding_events — DROP

**Current schema:**
```sql
CREATE TABLE IF NOT EXISTS persona_binding_events (
  id                  TEXT PRIMARY KEY,
  binding_id          TEXT,
  receiver_entity_id  TEXT NOT NULL,
  sender_entity_id    TEXT,
  old_agent_id        TEXT,
  old_persona_ref     TEXT,
  new_agent_id        TEXT,
  new_persona_ref     TEXT,
  actor               TEXT,
  reason              TEXT,
  created_at          INTEGER NOT NULL
);
```

**Action:** DELETE entirely. History captured by immutable rows on `entity_persona`.

### 5. entities table — One addition

The current entities table schema already matches the target, with one addition:
```sql
CREATE TABLE IF NOT EXISTS entities (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  type            TEXT,
  merged_into     TEXT REFERENCES entities(id),
  normalized      TEXT,
  is_user         BOOLEAN DEFAULT FALSE,
  mention_count   INTEGER DEFAULT 0,
  first_seen      INTEGER,
  last_seen       INTEGER,
  origin          TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
```

**Changes:**
- ADD `origin TEXT` — tracks who created the entity. Values: `'adapter'`, `'writer'`, `'manual'`.

The rest of the entities table stays the same. This maps directly to the canonical Entity type.

**Note:** `persona_path` is NOT a column on the entities table. It's hydrated from the `entity_persona` table during `resolvePrincipals` and placed on the Entity object in memory.

### 6. contacts table — Schema rewrite

**Current schema:**
```sql
CREATE TABLE IF NOT EXISTS contacts (
  platform       TEXT NOT NULL,
  space_id       TEXT NOT NULL DEFAULT '',
  sender_id      TEXT NOT NULL,
  entity_id      TEXT NOT NULL,
  source         TEXT NOT NULL,
  first_seen     INTEGER NOT NULL,
  last_seen      INTEGER NOT NULL,
  message_count  INTEGER NOT NULL DEFAULT 0,
  sender_name    TEXT,
  avatar_url     TEXT,
  label          TEXT,
  owner_id       TEXT REFERENCES entities(id),
  PRIMARY KEY (platform, space_id, sender_id)
);
```

**Target schema:**
```sql
CREATE TABLE contacts (
    id            TEXT PRIMARY KEY,
    entity_id     TEXT NOT NULL REFERENCES entities(id),
    platform      TEXT NOT NULL,
    space_id      TEXT NOT NULL DEFAULT '',
    contact_id    TEXT NOT NULL,           -- raw platform identifier (no prefix)
    contact_name  TEXT,                    -- display name from the platform/contact list
    avatar_url    TEXT,                    -- avatar URL from the platform
    origin        TEXT NOT NULL,           -- 'adapter' | 'writer' | 'manual'
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER,
    metadata      TEXT,
    UNIQUE(platform, space_id, contact_id)
);

CREATE INDEX idx_contacts_entity ON contacts(entity_id);
CREATE INDEX idx_contacts_platform ON contacts(platform, space_id, contact_id);
```

**Changes:**
- ADD `id TEXT PRIMARY KEY` (synthetic PK instead of composite)
- RENAME `sender_id` → `contact_id`
- RENAME `sender_name` → `contact_name`
- RENAME `source` → `origin`
- KEEP `avatar_url`
- DROP `first_seen`, `last_seen` (derivable from events)
- DROP `message_count` (derivable from events)
- DROP `label` (unused)
- DROP `owner_id` (entity_id is the single FK)
- ADD `metadata TEXT`
- PK changes from `(platform, space_id, sender_id)` to `id`

**Functions to update:**
- `ContactRow` interface (or equivalent) — update for new column names
- All functions that query/write contacts — update for new column names and PK
- Ripple `sender_id` → `contact_id` rename through all files that reference contacts table columns (NOT event-level `sender_id` which stays)

### 7. Location hierarchy — Verify existing tables

The identity.db should already have `spaces`, `containers`, `threads` tables (from the current schema). Verify they match the spec:

```sql
-- Workspaces, servers, teams
CREATE TABLE spaces (
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  current_name TEXT,
  metadata_json TEXT,
  PRIMARY KEY (platform, account_id, space_id)
);

-- Channels, DMs, group chats
CREATE TABLE containers (
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,
  container_id TEXT NOT NULL,
  container_kind TEXT NOT NULL,
  space_id TEXT NOT NULL DEFAULT '',
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  current_name TEXT,
  metadata_json TEXT,
  PRIMARY KEY (platform, account_id, container_id)
);

-- Sub-threads within containers
CREATE TABLE threads (
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,
  container_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  current_name TEXT,
  metadata_json TEXT,
  PRIMARY KEY (platform, account_id, container_id, thread_id)
);
```

### 8. container_participants — Verify existing table

Should already exist with this shape:
```sql
CREATE TABLE container_participants (
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,
  container_id TEXT NOT NULL,
  thread_id TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  status_changed_at INTEGER,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  last_sender_name TEXT,
  last_avatar_url TEXT,
  PRIMARY KEY (platform, account_id, container_id, thread_id, entity_id)
);
```

---

## Part B: Nexus DB Changes

### 1. nexus_requests — Simplify

**Current schema** (nexus.ts lines 202-239):
30+ denormalized columns including sender_entity_id, sender_type, sender_is_user, access_decision, access_policy, session_key, session_agent, permissions, hooks_matched, hooks_fired, hooks_handled, hooks_context, turn_id, agent_model, agent_tokens_prompt, agent_tokens_completion, agent_tokens_total, agent_tool_calls, delivery_channel, delivery_message_ids, delivery_success, delivery_error, stage_timings, error_stage, error_message, error_stack, request_snapshot.

**Target schema:**
```sql
CREATE TABLE IF NOT EXISTS nexus_requests (
    id TEXT PRIMARY KEY,
    operation TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    request_snapshot TEXT
);

CREATE INDEX IF NOT EXISTS idx_nexus_requests_status ON nexus_requests(status);
CREATE INDEX IF NOT EXISTS idx_nexus_requests_started ON nexus_requests(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_nexus_requests_operation ON nexus_requests(operation);
```

**Rationale:** The full NexusRequest is stored in `request_snapshot` as JSON. Individual fields don't need to be queryable columns — the request is the unit of querying. If we need to query by sender or session later, we add columns then. For now: keep it simple.

**Changes:**
- DROP: `event_id`, `event_type`, `event_source` (no separate event concept — it's routing + payload)
- DROP: `stage` (captured in request_snapshot stages array)
- DROP: `sender_entity_id`, `sender_type`, `sender_is_user` (in request_snapshot.principals)
- DROP: `access_decision`, `access_policy` (in request_snapshot.access)
- DROP: `session_key`, `session_agent`, `permissions` (in request_snapshot)
- DROP: `hooks_matched`, `hooks_fired`, `hooks_handled`, `hooks_context` (in request_snapshot.automations)
- DROP: `turn_id`, `agent_model`, `agent_tokens_prompt`, `agent_tokens_completion`, `agent_tokens_total`, `agent_tool_calls` (broker-internal, in agents.db)
- DROP: `delivery_channel`, `delivery_message_ids`, `delivery_success`, `delivery_error` (agent-driven delivery, tracked in events table)
- DROP: `stage_timings`, `error_stage`, `error_message`, `error_stack` (in request_snapshot.stages)
- KEEP: `id`, `status`, `started_at`, `completed_at`, `request_snapshot`
- ADD: `operation`

### 2. `NexusRequestRow` interface — Simplify

```typescript
export interface NexusRequestRow {
  id: string;
  operation: string;
  status: string;
  started_at: number;
  completed_at: number | null;
  request_snapshot: string | null;
}
```

### 3. `createNexusRequest()` in nexus.ts — Simplify

```typescript
export function createNexusRequest(db: DatabaseSync, input: {
  id: string;
  operation: string;
  status?: string;
  started_at: number;
}): void {
  db.prepare(`
    INSERT INTO nexus_requests (id, operation, status, started_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      operation = excluded.operation,
      status = excluded.status,
      started_at = excluded.started_at,
      completed_at = NULL,
      request_snapshot = NULL
  `).run(input.id, input.operation, input.status ?? "processing", input.started_at);
}
```

### 4. `updateNexusRequest()` — Simplify

```typescript
export function updateNexusRequest(
  db: DatabaseSync,
  requestId: string,
  updates: {
    status?: string;
    completed_at?: number;
    request_snapshot?: unknown;
  },
): void {
  const entries = Object.entries(updates).filter(([_, v]) => v !== undefined);
  if (entries.length === 0) return;

  const assignments = entries.map(([key]) => `${key} = ?`).join(", ");
  const values = entries.map(([key, value]) =>
    key === "request_snapshot" ? JSON.stringify(value) : value
  );
  db.prepare(`UPDATE nexus_requests SET ${assignments} WHERE id = ?`)
    .run(...values, requestId);
}
```

### 5. DELETE `UPDATEABLE_COLUMNS`, `JSON_COLUMNS`, `BOOLEAN_COLUMNS` sets

These 30+ column tracking sets are no longer needed with the simplified schema.

### 6. DELETE all migration functions

- `hasColumn()`, `tableExists()`, `renameColumnIfNeeded()`, `ensureColumn()`
- `ensureNexusRequestSenderColumns()` (the principal→sender column rename migration)

### 7. backfill_runs — Extend

**Current schema:**
```sql
CREATE TABLE IF NOT EXISTS backfill_runs (
    id TEXT PRIMARY KEY,
    platform TEXT,
    from_time INTEGER,
    to_time INTEGER,
    total_episodes INTEGER,      -- DELETE
    status TEXT NOT NULL CHECK(status IN ('running', 'paused', 'completed', 'failed')),
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    created_at INTEGER NOT NULL
);
```

**Target schema:**
```sql
CREATE TABLE IF NOT EXISTS backfill_runs (
    id TEXT PRIMARY KEY,
    adapter TEXT NOT NULL,
    account TEXT NOT NULL,
    platform TEXT,
    from_time INTEGER,
    to_time INTEGER,
    events_processed INTEGER DEFAULT 0,
    contacts_seeded INTEGER DEFAULT 0,
    last_checkpoint TEXT,
    status TEXT NOT NULL DEFAULT 'running'
      CHECK(status IN ('running', 'paused', 'completed', 'failed')),
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_backfill_runs_status_started_at
  ON backfill_runs(status, started_at DESC);
```

**Changes:**
- ADD `adapter TEXT NOT NULL`
- ADD `account TEXT NOT NULL`
- ADD `events_processed INTEGER DEFAULT 0`
- ADD `contacts_seeded INTEGER DEFAULT 0`
- ADD `last_checkpoint TEXT` (timestamp cursor for resume)
- DROP `total_episodes`

### 8. backfill_episodes — DROP entirely

```sql
-- DELETE this table:
CREATE TABLE IF NOT EXISTS backfill_episodes (...);
CREATE INDEX IF NOT EXISTS idx_backfill_episodes_run ON backfill_episodes(run_id);
CREATE INDEX IF NOT EXISTS idx_backfill_episodes_status ON backfill_episodes(status);
```

And delete `BackfillEpisodeRow` interface.

### 9. Other tables in runtime.db — KEEP as-is

- `import_jobs` — keep (used by adapter import orchestration)
- `memory_filters` — keep (used by memory system)
- `pending_retain_triggers` — update (add `set_id` column)

#### `pending_retain_triggers` — Add `set_id`

**Target schema:**
```sql
CREATE TABLE pending_retain_triggers (
    platform        TEXT NOT NULL,
    container_id    TEXT NOT NULL,
    thread_id       TEXT NOT NULL DEFAULT '',
    set_id          TEXT NOT NULL,
    first_event_at  INTEGER NOT NULL,
    last_event_at   INTEGER NOT NULL,
    token_estimate  INTEGER NOT NULL DEFAULT 0,
    event_count     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(platform, container_id, thread_id)
);
```

**Note:** The episode detection mechanism uses this table to track open episodes. The `set_id` references a set in memory.db.

---

## Mechanical Checklist

### Identity DB
- [ ] Add `id TEXT PRIMARY KEY` to `entity_tags`, change from composite PK to `id` PK
- [ ] Add partial unique index `UNIQUE(entity_id, tag) WHERE deleted_at IS NULL`
- [ ] Add `idx_entity_tags_active` index
- [ ] Drop `entity_tag_events` table from schema SQL
- [ ] Rename `persona_bindings` → `entity_persona` in schema SQL
- [ ] Drop `agent_id` column from entity_persona
- [ ] Drop `active` column from entity_persona (replace with deleted_at pattern)
- [ ] Drop `updated_at` column from entity_persona
- [ ] Add `deleted_at` column to entity_persona
- [ ] Add partial unique index on entity_persona
- [ ] Drop `persona_binding_events` table from schema SQL
- [ ] Update `PersonaBindingRow` → `EntityPersonaRow` interface
- [ ] Update all tag add/remove functions for immutable row pattern
- [ ] Update all persona query/upsert functions for new table name and columns
- [ ] Add `origin TEXT` to entities schema
- [ ] Rename `sender_id` → `contact_id` in contacts schema
- [ ] Rename `sender_name` → `contact_name` in contacts schema
- [ ] Rename `source` → `origin` in contacts schema
- [ ] Add `id TEXT PRIMARY KEY` to contacts
- [ ] Drop `first_seen`, `last_seen`, `message_count`, `label`, `owner_id` from contacts
- [ ] Add `metadata TEXT` to contacts
- [ ] Change contacts PK from composite to `id`
- [ ] Update `ContactRow` interface (or equivalent) for new column names
- [ ] Update all functions that query/write contacts for new column names
- [ ] Ripple `sender_id` → `contact_id` rename through all files that reference contacts table columns (NOT event-level sender_id which stays)
- [ ] Verify spaces/containers/threads tables match spec
- [ ] Verify container_participants table matches spec

### Nexus DB
- [ ] Rewrite `NEXUS_SCHEMA_SQL` with simplified nexus_requests table
- [ ] Delete all 30+ denormalized columns from nexus_requests
- [ ] Simplify `NexusRequestRow` interface
- [ ] Simplify `createNexusRequest()` function
- [ ] Simplify `updateNexusRequest()` function
- [ ] Delete `UPDATEABLE_COLUMNS`, `JSON_COLUMNS`, `BOOLEAN_COLUMNS` sets
- [ ] Delete all migration functions
- [ ] Extend `backfill_runs` with adapter, account, events_processed, contacts_seeded, last_checkpoint
- [ ] Drop `total_episodes` from backfill_runs
- [ ] Drop `backfill_episodes` table entirely
- [ ] Delete `BackfillEpisodeRow` interface
- [ ] Update `BackfillRunRow` interface for new columns
- [ ] Add `set_id TEXT NOT NULL` to `pending_retain_triggers`
