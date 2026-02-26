# Inbound Event Adapter Interface

**Status:** DESIGN LOCKED
**Last Updated:** 2026-02-25
**Related:** `ADAPTER_SYSTEM.md`, `OUTBOUND_INTERFACE.md`, `../nex/UNIFIED_RUNTIME_OPERATION_MODEL.md`, `../nex/NEXUS_REQUEST.md`

---

## Overview

This document defines inbound behavior for **event adapters** only.

Control-plane runtime operations are specified in `../nex/UNIFIED_RUNTIME_OPERATION_MODEL.md` and are not part of this event-adapter CLI interface.

Inbound event adapters normalize external/platform input to canonical `NexusEvent` records.

---

## Canonical CLI Contract

Inbound event adapters follow the adapter CLI protocol:

1. `info`
2. `monitor --account <id> --format jsonl`
3. optional: `backfill --account <id> --since <iso> --format jsonl`
4. optional: `health --account <id>`
5. optional: `accounts list`

Normative rule:

- `monitor` emits one valid `NexusEvent` per stdout line (JSONL).

See `ADAPTER_SYSTEM.md` for full command details.

---

## NexusEvent Schema (Inbound)

```ts
type NexusEvent = {
  event_id: string; // "{platform}:{source_id}" stable idempotency key
  timestamp: number; // unix ms (adapter timestamp; daemon also records receive timestamp)

  content: string;
  content_type: "text" | "image" | "audio" | "video" | "file" | "reaction";
  attachments?: Attachment[];

  // Delivery/routing context
  platform: string; // "discord", "telegram", "imessage", "openai", "webhook", ...
  account_id: string; // adapter account that received the message
  sender_id: string; // platform-specific sender identifier
  sender_name?: string;
  space_id?: string; // tenant/workspace/guild scope if applicable
  container_id: string; // channel/dm/thread root
  container_kind: "direct" | "group";
  thread_id?: string;
  reply_to_id?: string;

  metadata?: Record<string, unknown>;
};

type Attachment = {
  id: string;
  filename: string;
  content_type: string;
  size_bytes?: number;
  url?: string;
  path?: string;
};
```

---

## Ingress Integrity Rules

Adapters emit canonical data, but runtime remains final authority for integrity-critical fields as defined in `../nex/ingress/INGRESS_INTEGRITY.md`.

Normative constraints:

1. Adapter may supply source timestamp and external sender identifiers.
2. Runtime stamps ingress source/account trust context and receive timestamp.
3. Reserved internal platforms cannot be spoofed by external adapters.
4. For HTTP/OpenAI/OpenResponses/webchat ingress, sender identity is credential/session-derived by daemon.

---

## Normalization Examples

### Discord

```ts
const event: NexusEvent = {
  event_id: "discord:1234567890",
  timestamp: Date.now(),
  content: "Hello world",
  content_type: "text",
  platform: "discord",
  account_id: "bot-account-1",
  sender_id: "user123",
  sender_name: "alice",
  space_id: "guild789",
  container_id: "chan456",
  container_kind: "group",
  metadata: { container_semantics: "workspace_channel" },
};
```

### iMessage

```ts
const event: NexusEvent = {
  event_id: "imessage:abc-def-123",
  timestamp: Date.now(),
  content: "Hey there",
  content_type: "text",
  platform: "imessage",
  account_id: "default",
  sender_id: "+14155551234",
  container_id: "+14155551234",
  container_kind: "direct",
};
```

---

## Runtime Integration

Inbound event adapters feed `NexusEvent` into runtime event processing:

```ts
await nex.processEvent(event);
```

This enters the unified runtime operation flow (`receiveOperation -> resolvePrincipals -> resolveAccess -> executeOperation`), with `event.ingest` selecting the event path.

---

## Existing Adapters (Examples)

| Adapter | Platform | Status |
|------|----------|--------|
| `eve` | iMessage | active |
| `nexus-adapter-discord` | Discord | active |
| `nexus-adapter-gog` | Gmail | active |
| `http-ingress` (internal) | openai/openresponses/webhooks/webchat | active |
| `clock` (internal) | timer/scheduled source | active |
