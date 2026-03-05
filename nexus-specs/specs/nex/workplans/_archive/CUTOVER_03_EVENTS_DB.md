# Cutover 03 — Events DB Nuke & Rebuild

**Status:** COMPLETE (ARCHIVED)
**Phase:** 3 (parallel with Phase 2, depends on Phase 1)
**Target Spec:** [NEXUS_REQUEST_TARGET.md](../NEXUS_REQUEST_TARGET.md) · [ATTACHMENTS.md](../ATTACHMENTS.md)
**Source File:** `src/db/events.ts` (1112 lines → rewrite entirely)

---

## Summary

Nuke the entire events.db schema and rebuild from scratch. No migration — fresh schema. Delete ~900 lines of SQL triggers. Drop 4 auxiliary tables. Rewrite all TypeScript interfaces and functions.

---

## Tables to DROP

| Table | Lines in current schema | Why |
|-------|------------------------|-----|
| `threads` | 232-247 | Location hierarchy moves to identity.db (spaces/containers/threads) |
| `event_participants` | 252-260 | Replaced by `recipients` JSON column + `container_participants` in identity.db |
| `event_state` | 299-311 | Not part of canonical spec — can be rebuilt later if needed |
| `event_state_log` | 313-324 | Same |
| `tags` | 326-331 | Event-level tags not in canonical spec |
| `event_tags` | 333-343 | Same |
| `document_heads` | 345-358 | Not part of canonical spec |
| `retrieval_log` | 360-371 | Same |

## SQL Triggers to DELETE (all of them)

| Trigger | Approx Lines | What it does |
|---------|-------------|-------------|
| `events_index_insert` | 373-619 | Auto-populates threads, event_participants, attachments on INSERT (~250 lines) |
| `events_index_update` | 621-911 | Same for UPDATE (~290 lines) |
| `events_index_delete` | 913-959 | Thread cleanup on DELETE (~50 lines) |
| `events_fts_insert` | 217-220 | FTS auto-populate (keep concept, rewrite) |
| `events_fts_update` | 222-226 | FTS auto-populate (keep concept, rewrite) |
| `events_fts_delete` | 228-230 | FTS auto-populate (keep concept, rewrite) |

Total trigger code deleted: ~600 lines of SQL.

---

## Events Table: Current → Target

### Current schema (lines 179-200):
```sql
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,           -- DELETE
    source_id TEXT NOT NULL,        -- DELETE (replaced by event_id)
    type TEXT NOT NULL,             -- DELETE
    direction TEXT NOT NULL DEFAULT 'inbound',  -- DELETE
    thread_id TEXT,                 -- KEEP
    reply_to TEXT,                  -- RENAME to reply_to_id
    content TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'text',
    attachments TEXT,
    platform TEXT NOT NULL,
    from_identifier TEXT NOT NULL,  -- RENAME to sender_id
    to_recipients TEXT,             -- RENAME to recipients
    timestamp INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    metadata TEXT,
    is_retained INTEGER NOT NULL DEFAULT 0,  -- DELETE
    UNIQUE(source, source_id)      -- REPLACE with UNIQUE(platform, event_id)
);
```

### Target schema:
```sql
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,

    -- Content (from payload)
    content TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'text',
    attachments TEXT,                     -- JSON: Attachment[]
    recipients TEXT,                      -- JSON: RoutingParticipant[]
    timestamp INTEGER NOT NULL,
    received_at INTEGER NOT NULL,

    -- Routing context
    platform TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    space_id TEXT,
    container_kind TEXT NOT NULL DEFAULT 'direct',
    container_id TEXT NOT NULL,
    thread_id TEXT,
    reply_to_id TEXT,

    -- Pipeline link
    request_id TEXT,

    metadata TEXT,

    UNIQUE(platform, event_id)
);
```

### Column-by-column mapping:

| Current Column | Target Column | Action |
|---------------|--------------|--------|
| `id` | `id` | KEEP (generated UUID, primary key) |
| `source` | — | DELETE (was adapter name) |
| `source_id` | `event_id` | RENAME + semantic change (adapter's original event ID) |
| `type` | — | DELETE (was "message"/"system"/"reaction") |
| `direction` | — | DELETE (inbound/outbound determined by sender_id vs receiver_id) |
| `thread_id` | `thread_id` | KEEP |
| `reply_to` | `reply_to_id` | RENAME |
| `content` | `content` | KEEP |
| `content_type` | `content_type` | KEEP (but enum narrowed: only "text", "reaction", "membership") |
| `attachments` | `attachments` | KEEP (but JSON uses canonical Attachment type with new field names) |
| `platform` | `platform` | KEEP |
| `from_identifier` | `sender_id` | RENAME |
| — | `receiver_id` | NEW (who received this event) |
| `to_recipients` | `recipients` | RENAME (JSON: RoutingParticipant[] instead of ParticipantRef[]) |
| `timestamp` | `timestamp` | KEEP |
| `received_at` | `received_at` | KEEP |
| `metadata` | `metadata` | KEEP |
| `is_retained` | — | DELETE (memory system tracks its own state) |
| `UNIQUE(source, source_id)` | `UNIQUE(platform, event_id)` | REPLACE |
| — | `space_id` | NEW |
| — | `container_kind` | NEW ("direct" or "group") |
| — | `container_id` | NEW (was overloaded onto thread_id in some code paths) |
| — | `request_id` | NEW (links event to its pipeline NexusRequest) |

---

## Indexes: Current → Target

### DELETE all current indexes:
```sql
DROP INDEX idx_events_timestamp;
DROP INDEX idx_events_source;
DROP INDEX idx_events_thread;
DROP INDEX idx_events_reply_to;
DROP INDEX idx_events_platform;
DROP INDEX idx_events_type;
DROP INDEX idx_events_unretained;
```

### CREATE new indexes:
```sql
CREATE INDEX idx_events_timestamp ON events(timestamp DESC);
CREATE INDEX idx_events_platform_sender ON events(platform, sender_id);
CREATE INDEX idx_events_platform_receiver ON events(platform, receiver_id);
CREATE INDEX idx_events_container ON events(platform, container_id);
CREATE INDEX idx_events_thread ON events(thread_id);
CREATE INDEX idx_events_request ON events(request_id);
```

---

## FTS: Rewrite triggers for new column names

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
    event_id UNINDEXED,
    content,
    tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS events_fts_insert AFTER INSERT ON events BEGIN
    INSERT INTO events_fts(event_id, content)
    VALUES (new.id, COALESCE(new.content, ''));
END;

CREATE TRIGGER IF NOT EXISTS events_fts_update AFTER UPDATE ON events BEGIN
    DELETE FROM events_fts WHERE event_id = old.id;
    INSERT INTO events_fts(event_id, content)
    VALUES (new.id, COALESCE(new.content, ''));
END;

CREATE TRIGGER IF NOT EXISTS events_fts_delete AFTER DELETE ON events BEGIN
    DELETE FROM events_fts WHERE event_id = old.id;
END;
```

Note: `event_id` in the FTS table refers to `events.id` (the primary key), NOT `events.event_id`. This naming is inherited and slightly confusing but harmless.

---

## Attachments Table: Current → Target

### Current (lines 265-282):
```sql
CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    source TEXT NOT NULL,                    -- DELETE
    source_attachment_id TEXT,               -- DELETE
    filename TEXT,
    mime_type TEXT,
    media_type TEXT,
    size_bytes INTEGER,                      -- RENAME to size
    content_hash TEXT,
    storage_uri TEXT,                        -- DELETE
    local_path TEXT,
    url TEXT,
    metadata_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(source, source_attachment_id)     -- DELETE
);
```

### Target (from ATTACHMENTS.md):
```sql
CREATE TABLE IF NOT EXISTS attachments (
    id TEXT NOT NULL,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    filename TEXT,
    mime_type TEXT,
    media_type TEXT,
    size INTEGER,
    url TEXT,
    local_path TEXT,
    content_hash TEXT,
    metadata_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (event_id, id)
);

CREATE INDEX idx_attachments_event ON attachments(event_id);
CREATE INDEX idx_attachments_mime ON attachments(mime_type);
CREATE INDEX idx_attachments_media_type ON attachments(media_type);
CREATE INDEX idx_attachments_hash ON attachments(content_hash);
```

**Key changes:**
- PK changes from `id` alone to `(event_id, id)` — each attachment unique within its event
- DROP `source`, `source_attachment_id`, `storage_uri`
- DROP `UNIQUE(source, source_attachment_id)` constraint
- RENAME `size_bytes` → `size`

### Attachment Interpretations (minor update):

```sql
CREATE TABLE IF NOT EXISTS attachment_interpretations (
    event_id TEXT NOT NULL,
    attachment_id TEXT NOT NULL,
    interpretation_text TEXT NOT NULL,
    interpretation_model TEXT,
    interpretation_status TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (event_id, attachment_id),
    FOREIGN KEY (event_id, attachment_id) REFERENCES attachments(event_id, id) ON DELETE CASCADE
);
```

**Change from current:** PK becomes `(event_id, attachment_id)` with composite FK to match new attachments PK.

---

## TypeScript Interfaces: Current → Target

### `EventRow` (current lines 20-38):
```typescript
// DELETE entirely, replace with:
export interface EventRow {
  id: string;
  event_id: string;
  content: string;
  content_type: string;
  attachments: Attachment[] | null;  // canonical Attachment type
  recipients: RoutingParticipant[] | null;
  timestamp: number;
  received_at: number;
  platform: string;
  sender_id: string;
  receiver_id: string;
  space_id: string | null;
  container_kind: string;
  container_id: string;
  thread_id: string | null;
  reply_to_id: string | null;
  request_id: string | null;
  metadata: Record<string, unknown> | null;
}
```

### `InsertEventInput` (current lines 40-57):
```typescript
// DELETE entirely, replace with:
export interface InsertEventInput {
  id: string;
  event_id: string;
  content: string;
  content_type?: string;
  attachments?: Attachment[] | null;
  recipients?: RoutingParticipant[] | null;
  timestamp: number;
  received_at: number;
  platform: string;
  sender_id: string;
  receiver_id: string;
  space_id?: string | null;
  container_kind?: string;
  container_id: string;
  thread_id?: string | null;
  reply_to_id?: string | null;
  request_id?: string | null;
  metadata?: Record<string, unknown> | null;
}
```

### `AttachmentRef` (current lines 10-18) and `ParticipantRef` (lines 5-8):
DELETE both. Use canonical `Attachment` and `RoutingParticipant` from `request.ts`.

---

## Functions to REWRITE

### `insertEvent()` (current lines 1051-1083)

Rewrite the INSERT statement for new columns:

```typescript
export function insertEvent(db: DatabaseSync, event: InsertEventInput): boolean {
  const stmt = db.prepare(`
    INSERT INTO events (
      id, event_id, content, content_type, attachments, recipients,
      timestamp, received_at, platform, sender_id, receiver_id,
      space_id, container_kind, container_id, thread_id, reply_to_id,
      request_id, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(platform, event_id) DO NOTHING
  `);
  const result = stmt.run(
    event.id, event.event_id, event.content,
    event.content_type ?? "text",
    event.attachments ? JSON.stringify(event.attachments) : null,
    event.recipients ? JSON.stringify(event.recipients) : null,
    event.timestamp, event.received_at, event.platform,
    event.sender_id, event.receiver_id,
    event.space_id ?? null,
    event.container_kind ?? "direct",
    event.container_id,
    event.thread_id ?? null,
    event.reply_to_id ?? null,
    event.request_id ?? null,
    event.metadata ? JSON.stringify(event.metadata) : null,
  );
  return result.changes > 0;
}
```

**Key change:** `ON CONFLICT(platform, event_id) DO NOTHING` instead of `ON CONFLICT(source, source_id) DO NOTHING`.

### NEW: `insertEventWithAttachments()` (from ATTACHMENTS.md)

```typescript
export function insertEventWithAttachments(
  db: DatabaseSync,
  event: InsertEventInput,
): boolean {
  const attachments = (event.attachments ?? []).map(att => ({
    ...att,
    media_type: att.media_type ?? inferMediaType(att.mime_type),
  }));

  const inserted = insertEvent(db, { ...event, attachments });
  if (!inserted) return false;

  for (const att of attachments) {
    insertAttachment(db, {
      id: att.id,
      event_id: event.id,
      filename: att.filename,
      mime_type: att.mime_type,
      media_type: att.media_type,
      size: att.size,
      url: att.url,
      local_path: att.local_path,
      content_hash: att.content_hash,
      metadata_json: att.metadata ? JSON.stringify(att.metadata) : null,
      created_at: event.received_at,
      updated_at: event.received_at,
    });
  }

  return true;
}
```

### NEW: `insertAttachment()`

```typescript
export function insertAttachment(db: DatabaseSync, att: {
  id: string;
  event_id: string;
  filename?: string | null;
  mime_type?: string | null;
  media_type?: string | null;
  size?: number | null;
  url?: string | null;
  local_path?: string | null;
  content_hash?: string | null;
  metadata_json?: string | null;
  created_at: number;
  updated_at: number;
}): void {
  db.prepare(`
    INSERT INTO attachments (
      id, event_id, filename, mime_type, media_type, size,
      url, local_path, content_hash, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    att.id, att.event_id, att.filename ?? null,
    att.mime_type ?? null, att.media_type ?? null, att.size ?? null,
    att.url ?? null, att.local_path ?? null, att.content_hash ?? null,
    att.metadata_json ?? null, att.created_at, att.updated_at,
  );
}
```

### `getEventById()` and `listRecentEvents()` (current lines 1085-1111)

Rewrite SELECT columns to match new schema. Update `mapEventRow()` for new field names.

### `ensureEventsSchema()` (current lines 1036-1049)

Simplify drastically — no more migration functions:

```typescript
export function ensureEventsSchema(db: DatabaseSync): void {
  if (ENSURED_EVENTS_DBS.has(db)) return;
  db.exec(EVENTS_TABLE_SQL);
  ENSURED_EVENTS_DBS.add(db);
}
```

No `ensureEventsColumns()`, no `ensureEventsPlatformColumns()`, no `ensureEventsIndexTriggers()`, no `refreshEventsIndexTriggers()`. Fresh schema, no migration.

---

## Functions/Code to DELETE

| Function | Lines | Why |
|----------|-------|-----|
| `tableExists()` | 62-71 | Migration helper, no migration |
| `hasColumn()` | 73-81 | Migration helper |
| `getTriggerSQL()` | 84-89 | Migration helper |
| `refreshEventsIndexTriggers()` | 91-101 | Migration helper |
| `ensureEventsIndexTriggers()` | 103-117 | Migration helper |
| `ensureEventsPlatformColumns()` | 119-177 | Migration helper |
| `hasEventsReplyToColumn()` | 987-990 | Migration helper |
| `hasEventsIsRetainedColumn()` | 992-995 | Migration helper |
| `ensureEventsColumns()` | 997-1007 | Migration helper |
| `EVENTS_AUX_SCHEMA_SQL` | 202-960 | All triggers + auxiliary tables (~760 lines of SQL) |

---

## Mechanical Checklist

- [ ] Delete `EVENTS_AUX_SCHEMA_SQL` constant (lines 202-960 — ~760 lines)
- [ ] Rewrite `EVENTS_TABLE_SQL` constant with new schema
- [ ] Delete all migration functions (tableExists, hasColumn, getTriggerSQL, etc.)
- [ ] Delete `ParticipantRef` and `AttachmentRef` interfaces
- [ ] Rewrite `EventRow` interface for new columns
- [ ] Rewrite `InsertEventInput` interface for new columns
- [ ] Rewrite `insertEvent()` for new columns and `ON CONFLICT(platform, event_id)`
- [ ] Create `insertEventWithAttachments()` function
- [ ] Create `insertAttachment()` function
- [ ] Rewrite `mapEventRow()` for new field names
- [ ] Rewrite `getEventById()` SELECT columns
- [ ] Rewrite `listRecentEvents()` SELECT columns
- [ ] Simplify `ensureEventsSchema()` — no migration, just exec SQL
- [ ] Add `inferMediaType()` utility (or import from request.ts)
- [ ] Verify FTS triggers reference correct column names
