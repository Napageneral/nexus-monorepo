# Cutover 05 — Adapter Protocol Update

**Status:** ACTIVE
**Phase:** 6 (parallel with Phases 2–5, depends on Phase 1)
**Target Spec:** [NEXUS_REQUEST_TARGET.md](../NEXUS_REQUEST_TARGET.md) · [ATTACHMENTS.md](../ATTACHMENTS.md)
**Source File:** `src/nex/adapters/protocol.ts`

---

## Summary

Rename `CanonicalFlatAdapterEventSchema` to `AdapterEventSchema`. Update attachment field names to canonical. Rewrite `parseAdapterEventLine()` to produce `{ operation, routing, payload }` instead of `{ operation, event, delivery }`.

---

## Schema Rename

### Current (protocol.ts line 147):
```typescript
const CanonicalFlatAdapterEventSchema = z.object({
  event_id: z.string(),
  timestamp: z.number().int(),
  content: z.string(),
  content_type: z.string(),
  attachments: z.array(LegacyAdapterAttachmentSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  platform: z.string(),
  account_id: z.string(),
  sender_id: z.string(),
  sender_name: z.string().optional(),
  receiver_id: z.string().optional(),
  receiver_name: z.string().optional(),
  space_id: z.string().optional(),
  space_name: z.string().optional(),
  container_id: z.string(),
  container_kind: z.string(),
  container_name: z.string().optional(),
  thread_id: z.string().optional(),
  thread_name: z.string().optional(),
  reply_to_id: z.string().optional(),
  delivery_metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();
```

### Target:
```typescript
const AdapterEventSchema = z.object({
  // Event payload
  event_id: z.string(),
  timestamp: z.number().int(),
  content: z.string(),
  content_type: z.string(),
  attachments: z.array(AdapterAttachmentSchema).optional(),
  recipients: z.array(AdapterRecipientSchema).optional(), // NEW
  metadata: z.record(z.string(), z.unknown()).optional(),

  // Routing context
  adapter: z.string().optional(), // adapter can self-identify
  platform: z.string(),
  account_id: z.string(),
  sender_id: z.string(),
  sender_name: z.string().optional(),
  sender_avatar_url: z.string().optional(), // NEW
  receiver_id: z.string().optional(),
  receiver_name: z.string().optional(),
  space_id: z.string().optional(),
  space_name: z.string().optional(),
  container_id: z.string(),
  container_kind: z.string(),
  container_name: z.string().optional(),
  thread_id: z.string().optional(),
  reply_to_id: z.string().optional(),

  // Adapter-specific opaque data
  routing_metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();
```

**Changes:**
- RENAME: `CanonicalFlatAdapterEventSchema` → `AdapterEventSchema`
- RENAME: `delivery_metadata` → `routing_metadata`
- DROP: `thread_name` (not in spec — untrusted display data not needed)
- ADD: `adapter` field (optional — adapter can self-identify)
- ADD: `sender_avatar_url` (maps to RoutingParticipant.avatar_url)
- ADD: `recipients` field (for email CC, group members)

---

## Attachment Schema: Legacy → Canonical

### Current `LegacyAdapterAttachmentSchema`:
```typescript
// Adapters currently emit:
{
  id: string,
  content_type: string,    // ← should be mime_type
  filename?: string,
  size_bytes?: number,     // ← should be size
  url?: string,
  path?: string,           // ← should be local_path
  metadata?: Record<string, unknown>,
}
```

### Target `AdapterAttachmentSchema`:
```typescript
const AdapterAttachmentSchema = z.object({
  id: z.string(),
  filename: z.string().optional(),
  mime_type: z.string(),                    // was content_type
  media_type: z.string().optional(),
  size: z.number().int().nonnegative().optional(),  // was size_bytes
  url: z.string().optional(),
  local_path: z.string().optional(),        // was path
  content_hash: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
```

**This is a breaking change to the adapter protocol.** All adapters must update their JSONL output to use:
- `mime_type` instead of `content_type`
- `size` instead of `size_bytes`
- `local_path` instead of `path`

### Recipient Schema (NEW):
```typescript
const AdapterRecipientSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  avatar_url: z.string().optional(),
});
```

---

## `parseAdapterEventLine()` — Rewrite transformation

### Current (protocol.ts lines 294-330):
Produces `NexusEvent` = `{ operation, event: EventContext, delivery: DeliveryContext }`

### Target:
Produces `NexusInput` = `{ operation, routing: Routing, payload: EventPayload }`

```typescript
export function parseAdapterEventLine(
  line: string,
  adapterName: string,
): NexusInput {
  const parsed = JSON.parse(line) as unknown;
  const flat = AdapterEventSchema.parse(parsed);

  return {
    operation: "event.ingest",
    routing: {
      adapter: flat.adapter ?? adapterName,
      platform: flat.platform,
      sender: {
        id: flat.sender_id,
        name: flat.sender_name,
        avatar_url: flat.sender_avatar_url,
      },
      receiver: {
        id: flat.receiver_id ?? flat.account_id,
        name: flat.receiver_name,
      },
      space_id: flat.space_id,
      space_name: flat.space_name,
      container_kind: normalizeContainerKind(flat.container_kind),
      container_id: flat.container_id,
      container_name: flat.container_name,
      thread_id: flat.thread_id,
      reply_to_id: flat.reply_to_id,
      metadata: flat.routing_metadata,
    },
    payload: {
      id: flat.event_id,
      content: flat.content,
      content_type: normalizeEventContentType(flat.content_type),
      attachments: flat.attachments,  // already canonical Attachment type
      recipients: flat.recipients,
      timestamp: flat.timestamp,
      metadata: flat.metadata,
    },
  };
}
```

**Key changes:**
- Output shape: `{ routing, payload }` instead of `{ event, delivery }`
- Attachment mapping removed — adapters emit canonical fields directly (no `content_type→type`, `size_bytes→size`, `path→local_path` translation)
- `adapterName` parameter added — the adapter manager knows which adapter produced the line
- `receiver_id` defaults to `account_id` if not explicitly provided by adapter
- `recipients` passed through (new field)
- `content_type` enum normalization: only accept "text", "reaction", "membership" (drop "image", "audio", "video", "file")

---

## Content Type Normalization

### Current `normalizeEventContentType()`:
Probably accepts "image", "audio", "video", "file" and maps them to the EventContext content_type enum.

### Target:
Content types "image", "audio", "video", "file" are NOT valid content types — they are attachment media types. An event with an image attachment has `content_type: "text"` (or empty text) with an attachment that has `media_type: "image"`.

```typescript
function normalizeEventContentType(raw: string): "text" | "reaction" | "membership" {
  const lower = raw.toLowerCase().trim();
  if (lower === "reaction") return "reaction";
  if (lower === "membership") return "membership";
  return "text";  // everything else is text
}
```

---

## Mechanical Checklist

- [ ] Rename `CanonicalFlatAdapterEventSchema` → `AdapterEventSchema`
- [ ] Delete `LegacyAdapterAttachmentSchema`
- [ ] Create `AdapterAttachmentSchema` with canonical field names
- [ ] Create `AdapterRecipientSchema`
- [ ] Update `AdapterEventSchema` fields (rename delivery_metadata, add recipients, add adapter, add sender_avatar_url, drop thread_name)
- [ ] Rewrite `parseAdapterEventLine()` to produce `{ operation, routing, payload }`
- [ ] Update `normalizeEventContentType()` — only "text", "reaction", "membership"
- [ ] Remove attachment field translation (content_type→type, size_bytes→size, path→local_path)
- [ ] Pass `adapterName` parameter through to parseAdapterEventLine
- [ ] Update all callers of parseAdapterEventLine for new signature and return type
- [ ] Document adapter SDK breaking changes for adapter authors
