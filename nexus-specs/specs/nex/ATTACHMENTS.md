# Attachments — Unified Schema

**Status:** DESIGN (authoritative target)
**Last Updated:** 2026-03-01
**Related:** [NEXUS_REQUEST_TARGET.md](./NEXUS_REQUEST_TARGET.md)

---

## Core Principle

One attachment schema used everywhere — adapter protocol, NexusRequest bus, events table JSON, relational attachments table. Zero translation between layers. The same field names flow from the adapter all the way through to agent context and memory.

---

## Canonical Attachment Type

```typescript
type Attachment = {
  id: string;                    // unique attachment identifier
  filename?: string;             // original filename
  mime_type: string;             // full MIME type: "image/png", "audio/mp3", "application/pdf"
  media_type?: string;           // canonical kind: "image", "video", "audio", "document", "file"
  size?: number;                 // bytes
  url?: string;                  // remote URL
  local_path?: string;           // local filesystem path
  content_hash?: string;         // content hash for dedup/integrity
  metadata?: Record<string, unknown>;
};
```

### Field Semantics

| Field | Description |
|---|---|
| `id` | Adapter-assigned unique identifier for this attachment |
| `filename` | Original filename from the platform (untrusted, for display) |
| `mime_type` | Full MIME type string. Always present. Adapters must provide this. |
| `media_type` | Canonical media category. Computed from `mime_type` if not provided. One of: `image`, `video`, `audio`, `document`, `file` |
| `size` | File size in bytes. Optional — not all platforms provide this up front. |
| `url` | Remote URL where the content can be fetched. May be ephemeral (platform CDN links expire). |
| `local_path` | Absolute local filesystem path after download. Set by the attachment processing pipeline. |
| `content_hash` | Content-based hash (SHA-256) for dedup. Set after content is available locally. |
| `metadata` | Adapter-specific opaque data (e.g., WhatsApp media key, Telegram file_id, Discord CDN params) |

### media_type Inference

When `media_type` is not explicitly provided, it is inferred from `mime_type` in application code:

```typescript
function inferMediaType(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower.startsWith("image/")) return "image";
  if (lower.startsWith("video/")) return "video";
  if (lower.startsWith("audio/")) return "audio";
  if (lower.startsWith("text/")) return "document";
  if (lower.startsWith("application/pdf")) return "document";
  if (lower.startsWith("application/msword")) return "document";
  if (lower.startsWith("application/vnd.openxmlformats-officedocument")) return "document";
  if (lower.startsWith("application/vnd.ms-")) return "document";
  return "file";
}
```

This replaces the ~100-line SQL CASE statement in the current INSERT trigger.

---

## Schema Across All Layers

### Layer 1: Adapter Protocol

Adapters emit the canonical `Attachment` type in their JSONL event output:

```json
{
  "event_id": "msg-123",
  "content": "Check out this photo",
  "attachments": [
    {
      "id": "att-456",
      "filename": "photo.jpg",
      "mime_type": "image/jpeg",
      "size": 245760,
      "url": "https://cdn.platform.com/photo.jpg"
    }
  ]
}
```

**Breaking change from current adapter protocol**: Adapters must use `mime_type` (not `content_type`), `size` (not `size_bytes`), and `local_path` (not `path`). All adapters need updating.

### Layer 2: NexusRequest Bus (EventPayload)

The `EventPayload.attachments` field carries the same `Attachment[]` type:

```typescript
type EventPayload = {
  id: string;
  content: string;
  content_type: "text" | "reaction" | "membership";
  attachments?: Attachment[];
  recipients?: RoutingParticipant[];  // other participants (email CC, small groups)
  timestamp: number;
  metadata?: Record<string, unknown>;
};
```

No transformation between adapter input and bus representation.

### Layer 3: Events Table (JSON Column)

The `events.attachments` TEXT column stores the `Attachment[]` array serialized as JSON. Same schema, same field names.

### Layer 4: Relational Attachments Table

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

PK is `(event_id, id)` — each attachment is unique within its event.

### Layer 5: Attachment Interpretations

```sql
CREATE TABLE IF NOT EXISTS attachment_interpretations (
    event_id TEXT NOT NULL,
    attachment_id TEXT NOT NULL,
    interpretation_text TEXT NOT NULL,
    interpretation_model TEXT,
    interpretation_status TEXT NOT NULL,    -- success | failed | pending
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (event_id, attachment_id),
    FOREIGN KEY (event_id, attachment_id) REFERENCES attachments(event_id, id) ON DELETE CASCADE
);
```

Memory meeseeks agents write interpretations for attachments they encounter during retain/consolidate. The real-time media understanding pipeline (transcription, vision) could also write here in the future.

---

## Write Path (Application Code, No Trigger)

When inserting an event with attachments:

```typescript
function insertEventWithAttachments(db: DatabaseSync, event: InsertEventInput): void {
  // 1. Infer media_type for any attachment that doesn't have it
  const attachments = (event.attachments ?? []).map(att => ({
    ...att,
    media_type: att.media_type ?? inferMediaType(att.mime_type),
  }));

  // 2. Insert the event (with JSON attachments column)
  insertEvent(db, { ...event, attachments });

  // 3. Insert relational attachment rows
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
}
```

Both writes happen in the same transaction. No SQL trigger auto-population.

---

## Read Paths

### Fast event retrieval (JSON column)

When loading events for display or agent context, the `events.attachments` JSON column provides inline attachment data without a JOIN:

```sql
SELECT id, content, content_type, attachments, ...
FROM events WHERE container_id = ? ORDER BY timestamp DESC
```

### Structured queries (relational table)

When querying by attachment properties (find all images, check interpretations):

```sql
SELECT a.*, ai.interpretation_text
FROM attachments a
LEFT JOIN attachment_interpretations ai ON ai.event_id = a.event_id AND ai.attachment_id = a.id
WHERE a.event_id IN (...)
```

### Memory retain/consolidate

The memory pipeline JOINs attachments with interpretations to provide rich context to the meeseeks:

```sql
SELECT e.id, e.content, a.id as att_id, a.filename, a.mime_type, a.media_type,
       ai.interpretation_text, ai.interpretation_status
FROM events e
LEFT JOIN attachments a ON a.event_id = e.id
LEFT JOIN attachment_interpretations ai ON ai.event_id = a.event_id AND ai.attachment_id = a.id
WHERE e.id IN (...)
```

---

## Media Understanding Pipeline

The media understanding pipeline processes attachments before the agent sees them:

1. **Audio**: Transcribed via speech-to-text (OpenAI Whisper, Groq, Deepgram, etc.). Transcript injected into user message.
2. **Images**: Described via vision models (or passed natively if the primary model supports vision). Description injected or image passed as content block.
3. **Video**: Described via video-capable models (Gemini). Description injected.
4. **Documents**: Text extracted (PDF, CSV, plain text). Content wrapped in `<file>` XML blocks.

Results are currently injected into `ctx.Body` (the user message). In the future, interpretations could also be persisted to `attachment_interpretations` for reuse.

---

## Migration from Current Architecture

### Dropped

- `events.source` column (was: adapter name, used in attachment ID generation)
- `events.source_id` column (was: platform event ID)
- `attachments.source` column (was: copied from event.source)
- `attachments.source_attachment_id` column (was: platform attachment ID)
- `attachments.storage_uri` column (was: synthesized fallback of local_path/url)
- `UNIQUE(source, source_attachment_id)` constraint on attachments
- SQL INSERT/UPDATE triggers for attachments (replaced by application code)
- MIME-to-media_type inference in SQL (replaced by application code)

### Renamed

- `AttachmentSchema.type` → `mime_type`
- `AttachmentSchema.size` → `size` (no change, but adapter protocol was `size_bytes`)
- `AttachmentSchema.local_path` → `local_path` (no change, but adapter protocol was `path`)
- Adapter protocol `content_type` → `mime_type`
- Adapter protocol `size_bytes` → `size`
- Adapter protocol `path` → `local_path`

### Added

- `media_type` field promoted to all layers (was DB-only)
- `content_hash` field promoted to all layers (was DB-only)

### Adapter SDK Impact

All adapters need updating to use the new field names. This is a breaking change to the adapter protocol. Provide a migration guide and update the adapter SDK/template.
