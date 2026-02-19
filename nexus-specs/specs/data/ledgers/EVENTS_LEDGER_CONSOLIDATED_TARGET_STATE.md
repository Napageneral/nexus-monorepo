# Events Ledger Consolidated Target State

**Status:** DESIGN SPEC (REFINED)
**Last Updated:** 2026-02-18
**Related:** `EVENTS_LEDGER.md`, `../cortex/EVENT_LEDGER_UNIFICATION.md`, `../cortex/CORTEX_NEX_MIGRATION.md`

> **Canonical Reference:** See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md) for the
> authoritative 6-database inventory, table ownership, and migration plan.

---

## Purpose

Define the refined end state for Nexus communications data:

1. `events.db` is the single source of truth for communications events.
2. Useful Cortex-era event features (threads, normalized attachments, event state/tags, reply links, document indexing) move into `events.db`.
3. `memory.db` (successor to `cortex.db`) does not own communications infrastructure; it contains the memory system (facts, episodes, analysis).

---

## Final Decisions

1. There is exactly one canonical communications event table: `events.db.events`.
2. `threads` are first-class in `events.db`.
3. Participants are tracked per-event (not as a static thread roster); thread membership is reconstructed over time from event-level data.
4. Attachments are both:
   - Inline on event rows (`events.attachments` JSON, canonical payload), and
   - Normalized in `events.db.attachments` for queryability/dedupe.
5. `reply_to` is a first-class event column (not metadata-only).
6. Event state/tags remain in the primary event system (`events.db`), including event-time metadata (`viewed_at`, `archived_at`, etc.).
7. `document_heads` and `retrieval_log` belong with the event ledger, not Cortex.
8. Existing diagnostic tools are kept, but rewritten against the unified `events.db` schema (no compatibility shims as production behavior).
9. All adapters (Nex TS) write into the same unified ledger schema.
10. Language/runtime consolidation is out of scope for this spec.

---

## Ownership Boundary

### `events.db` owns

- Raw communications events
- Communication organization/indexes
- Communication annotations/state
- Procedural document index pointers and retrieval telemetry (until re-homed)

### `memory.db` owns (successor to cortex.db)

- Episodes and episode relationships
- Facts, mental models, causal links, facets
- Analysis pipeline outputs

### `identity.db` owns

- Entity graph (entities, entity_tags, cooccurrences, merge_candidates)

### `embeddings.db` owns

- Embeddings and derived search artifacts (sqlite-vec)

### Explicit non-goal

None of the above databases are a second communications ledger.

---

## Target `events.db` Data Model

### Canonical table

#### `events`

Single canonical event row per source event.

```sql
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    source_id TEXT NOT NULL,
    type TEXT NOT NULL,                  -- message, email, reaction, membership, document, etc.
    direction TEXT NOT NULL DEFAULT 'inbound',  -- inbound | outbound | observed
    thread_id TEXT,
    reply_to TEXT,                       -- event id (logical link; can reference cross-source ids)

    content TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'text',
    attachments TEXT,                    -- JSON array (canonical payload form)

    -- NOTE: from_channel/from_identifier use legacy names for backward compatibility.
    -- Canonical terminology per the Unified Delivery Taxonomy:
    --   from_channel    → platform
    --   from_identifier → sender_id
    from_channel TEXT NOT NULL,           -- platform of sender
    from_identifier TEXT NOT NULL,        -- sender_id on that platform
    to_recipients TEXT,                  -- JSON array of participant refs

    timestamp INTEGER NOT NULL,          -- unix ms at source
    received_at INTEGER NOT NULL,        -- unix ms seen by nexus
    metadata TEXT,                       -- source-specific JSON

    UNIQUE(source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
CREATE INDEX IF NOT EXISTS idx_events_thread ON events(thread_id);
CREATE INDEX IF NOT EXISTS idx_events_reply_to ON events(reply_to);
CREATE INDEX IF NOT EXISTS idx_events_from ON events(from_channel, from_identifier);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
```

### Search/index table

#### `events_fts`

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
    event_id UNINDEXED,
    content,
    tokenize='porter unicode61'
);
```

Kept synchronized via insert/update/delete triggers on `events`.

### Organization/index tables

> **Note:** The `sync_watermarks` table has been removed. Adapters own their
> sync state internally. See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md) section 5.

#### `threads`

First-class conversation grouping keyed by the same `thread_id` used on events.

```sql
CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,                 -- canonical thread_id
    channel TEXT NOT NULL,               -- platform (legacy column name)
    name TEXT,
    is_group INTEGER NOT NULL DEFAULT 0,

    source_adapter TEXT,                 -- optional source owner for stable lookup
    source_id TEXT,                      -- optional external thread id

    first_event_at INTEGER,
    last_event_at INTEGER,
    last_event_id TEXT,
    event_count INTEGER NOT NULL DEFAULT 0,

    metadata_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    UNIQUE(source_adapter, source_id)
);

CREATE INDEX IF NOT EXISTS idx_threads_channel ON threads(channel);
CREATE INDEX IF NOT EXISTS idx_threads_last_event_at ON threads(last_event_at DESC);
```

#### `event_participants`

Event-level normalized participant rows for query speed and dedupe.
Not a static thread membership table. The `channel`/`identifier` columns here
correspond to `platform`/`sender_id` in the Unified Delivery Taxonomy.

```sql
CREATE TABLE IF NOT EXISTS event_participants (
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    role TEXT NOT NULL,                  -- sender | recipient | member | mentioned
    channel TEXT NOT NULL,
    identifier TEXT NOT NULL,
    position INTEGER,                    -- optional stable ordering for recipients
    metadata_json TEXT,

    PRIMARY KEY (event_id, role, channel, identifier)
);

CREATE INDEX IF NOT EXISTS idx_event_participants_event ON event_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_event_participants_lookup ON event_participants(channel, identifier);
```

#### `attachments`

Normalized attachment table for retrieval, dedupe, and media workflows.

```sql
CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,

    source TEXT NOT NULL,
    source_attachment_id TEXT,

    filename TEXT,
    mime_type TEXT,
    media_type TEXT,
    size_bytes INTEGER,
    content_hash TEXT,

    storage_uri TEXT,                    -- canonical pointer for retrieval
    local_path TEXT,                     -- local cache path if present
    url TEXT,                            -- remote URL if present

    metadata_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    UNIQUE(source, source_attachment_id)
);

CREATE INDEX IF NOT EXISTS idx_attachments_event ON attachments(event_id);
CREATE INDEX IF NOT EXISTS idx_attachments_hash ON attachments(content_hash);
CREATE INDEX IF NOT EXISTS idx_attachments_mime ON attachments(mime_type);
```

### Event annotation/state tables

#### `event_state`

Current state snapshot per event.

```sql
CREATE TABLE IF NOT EXISTS event_state (
    event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,

    is_viewed INTEGER NOT NULL DEFAULT 0,
    viewed_at INTEGER,
    is_archived INTEGER NOT NULL DEFAULT 0,
    archived_at INTEGER,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    pinned_at INTEGER,
    is_flagged INTEGER NOT NULL DEFAULT 0,
    flagged_at INTEGER,

    updated_at INTEGER NOT NULL,
    metadata_json TEXT
);
```

#### `event_state_log`

Append-only state transitions with timestamps.

```sql
CREATE TABLE IF NOT EXISTS event_state_log (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    state_key TEXT NOT NULL,             -- viewed | archived | pinned | flagged | custom
    state_value INTEGER NOT NULL,        -- 0 | 1 (or enum-compatible integer)
    changed_at INTEGER NOT NULL,
    changed_by TEXT,
    source TEXT,
    metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_event_state_log_event_time ON event_state_log(event_id, changed_at DESC);
```

#### `tags` and `event_tags`

```sql
CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    normalized TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS event_tags (
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    tagged_at INTEGER NOT NULL,
    tagged_by TEXT,
    source TEXT,
    metadata_json TEXT,

    PRIMARY KEY (event_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_event_tags_tag ON event_tags(tag_id);
```

### Procedural document index tables (moved from Cortex)

#### `document_heads`

Stable pointer from procedural key (`skill:*`, `doc:*`, etc.) to current document event id.
The `channel` column here corresponds to `platform` in the Unified Delivery Taxonomy.

#### `retrieval_log`

Per-query retrieval telemetry for document lookups.

```sql
CREATE TABLE IF NOT EXISTS document_heads (
    doc_key TEXT PRIMARY KEY,
    channel TEXT NOT NULL,
    current_event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    content_hash TEXT NOT NULL,
    title TEXT,
    description TEXT,
    metadata_json TEXT,
    updated_at INTEGER NOT NULL,
    retrieval_count INTEGER NOT NULL DEFAULT 0,
    last_retrieved_at INTEGER
);

CREATE TABLE IF NOT EXISTS retrieval_log (
    id TEXT PRIMARY KEY,
    doc_key TEXT NOT NULL REFERENCES document_heads(doc_key) ON DELETE CASCADE,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    query_text TEXT,
    score REAL,
    retrieved_at INTEGER NOT NULL
);
```

---

## Canonical vs Derived Rules

1. `events` is canonical communications truth.
2. `threads`, `event_participants`, and normalized `attachments` are index/operational tables in the same database.
3. Inline event fields remain required even when normalized tables exist:
   - `events.thread_id`
   - `events.from_identifier` (canonical: `sender_id`)
   - `events.to_recipients`
   - `events.attachments`
4. Rebuild tools may re-derive index tables from canonical event rows.

---

## Write Path Requirements

All official ingestion paths (pipeline + adapters) must:

1. Upsert canonical event into `events`.
2. Maintain `threads` aggregates when `thread_id` is present.
3. Maintain `event_participants` from sender/recipient/member data.
4. Maintain normalized `attachments` from `events.attachments` payload where available.
5. Persist `reply_to` in the explicit column whenever source data provides it.

State/tag/document tables are maintained by higher-level workflows, not raw channel adapters.

---

## Reader Requirements

1. Readers query `events.db` directly (Nex TS) or via attached `events_ledger`.
2. Diagnostic/validation tools are retained but rewritten to unified schema.
3. No runtime path may depend on resurrecting removed legacy Cortex comms tables.

---

## Memory System Integration

> **Note:** `cortex.db` has been superseded by `memory.db`, `identity.db` (entities),
> and `embeddings.db`. See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md).

1. `memory.db` keeps episodes, facts, mental models, and analysis pipeline.
2. `identity.db` keeps entities, entity_tags, cooccurrences, and merge_candidates.
3. `embeddings.db` keeps vector embeddings (sqlite-vec).
4. `episode_events.event_id` logically references `events.db.events.id`.
5. Memory system readers join events through attached `events_ledger`.
6. `document_heads` and `retrieval_log` live in `events.db`.

---

## Migration Plan (Implementation Contract)

### Phase 1: Schema expansion in `events.db`

- Add `reply_to` to `events`.
- Add all new tables defined above in TS (`src/db/events.ts`) schema definitions.
- Keep migrations additive and idempotent.

### Phase 2: Writer updates

- Update adapters and pipeline paths to populate new columns/tables.
- Ensure attachments are emitted as structured payloads and normalized rows.

### Phase 3: Reader updates

- Rewrite diagnostic tools (`encode-imessage-samples`, `verify-memory-live`) to unified schema.
- Remove temporary compatibility view behavior.

### Phase 4: Memory system boundary cleanup

- Ensure no communications ownership remains in `memory.db` (successor to `cortex.db`).
- Move procedural document index usage (`document_heads`, `retrieval_log`) to `events.db`.

### Phase 5: Validation and hardening

- Backfill/rebuild index tables from canonical `events` where needed.
- Validate parity on representative adapters and channels.

---

## Validation Matrix

1. Event ingest parity:
   - same source event maps to one canonical row (`UNIQUE(source, source_id)`).
2. Thread integrity:
   - events grouped correctly by `thread_id`; thread aggregates update deterministically.
3. Participant integrity:
   - sender/recipient/member lookups work over event timelines.
4. Attachment integrity:
   - normalized attachment lookup/dedupe works and links back to canonical event.
5. Reply integrity:
   - `reply_to` links are populated and queryable.
6. State/tag integrity:
   - state transitions have timestamps; tags can be queried by tag or event.
7. Document retrieval integrity:
   - `document_heads` resolves latest doc event; `retrieval_log` records accesses.
8. Memory system integration:
   - episode and search flows succeed via attached `events_ledger` without legacy comms tables.

---

## Out of Scope

1. Runtime/language consolidation (TS vs Go vs Rust) beyond schema and behavior compatibility.
2. ~~Moving episodes/entities/embeddings out of `cortex.db`.~~ **Done.** Entities are now in `identity.db`, embeddings in `embeddings.db`, and episodes/facts in `memory.db`. See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md).
3. Product UI policy decisions for state/tag semantics beyond storage contracts.

