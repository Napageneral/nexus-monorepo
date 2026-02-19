# Outbound Targeting (Threads + Replies)

**Status:** DESIGN SPEC  
**Last Updated:** 2026-02-18  
**Related:** `INBOUND_INTERFACE.md`, `OUTBOUND_INTERFACE.md`, `ADAPTER_SYSTEM.md`

---

## Purpose

Nexus must preserve enough delivery context to:

- Reply into the correct *conversation container* (DM, group, channel)
- Reply into the correct *thread/topic* when the platform supports it
- Reply to a specific message when the user replied to something

This is accomplished via structured delivery fields in `NexusEvent` (inbound) and `DeliveryTarget` (outbound), and by carrying those fields end-to-end through NEX → adapter CLI protocol.

---

## Canonical Fields (Locked)

These are the normalized fields that must exist on inbound events and must be preserved for outbound delivery:

- `delivery.platform`: platform (`discord`, `telegram`, `imessage`, …)
- `delivery.container_kind`: `dm | group | channel`
- `delivery.container_id`: conversation container ID
- `delivery.thread_id`: thread/topic ID (when applicable)
- `delivery.reply_to_id`: message ID being replied to (when applicable)

**Mapping:**

- Inbound adapters emit these fields on `NexusEvent`.
- NEX copies them into `NexusRequest.delivery`.
- Outbound delivery derives `DeliveryTarget` from `NexusRequest.delivery`.

---

## Data Contract

Outbound delivery always targets a `DeliveryTarget` (see `OUTBOUND_INTERFACE.md`):

```ts
interface DeliveryTarget {
  platform: string;      // Platform
  account_id: string;    // Which adapter account to use
  to: string;            // Target identifier (adapter-defined string format)
  thread_id?: string;    // Thread/topic identifier (platform-native)
  reply_to_id?: string;  // Message identifier being replied to (platform-native)
}
```

**Notes:**

- `to` uses the adapter conventions documented in `OUTBOUND_INTERFACE.md` (e.g. `discord channel:123`, `telegram chat:-100...`).
- `thread_id` and `reply_to_id` are **platform-native IDs**. They are not required to be globally unique.
- If NEX happens to have `{platform}:{id}`-style values, adapters **may** strip the prefix, but the canonical value is the platform ID.

---

## Adapter CLI Protocol Requirements

### `send` CLI Flags

Outbound adapters MUST accept the following flags for `send`:

```bash
<command> send \
  --account <account_id> \
  --to <target> \
  [--thread <thread_id>] \
  [--reply-to <reply_to_id>] \
  --text "message content"
```

Media sends follow the same targeting flags:

```bash
<command> send \
  --account <account_id> \
  --to <target> \
  [--thread <thread_id>] \
  [--reply-to <reply_to_id>] \
  --media <path> \
  [--caption "text"]
```

### `stream` Protocol Target

For streaming adapters, `stream_start.target` MUST be a full `DeliveryTarget`:

```jsonl
{"type":"stream_start","runId":"run_abc","sessionLabel":"main","target":{"platform":"discord","account_id":"echo-bot","to":"channel:123","thread_id":"123456789012345678","reply_to_id":"987654321098765432"}}
```

---

## Behavioral Rules

### Destination Selection

- `to` identifies the *primary* outbound container.
- If `thread_id` is present, the adapter MUST route the message into that thread/topic within the container.
- If `thread_id` is absent, the adapter MUST route the message into `to`.

### Reply Semantics

- If `reply_to_id` is present, the adapter MUST send as a reply to that message **for the first created message only**.
- When a single logical send requires multiple chunks, only the **first** chunk uses `reply_to_id`.

### Thread + Reply Together

When both are present:

- Route into the thread/topic (`thread_id`)
- Reply to the message (`reply_to_id`) if the platform supports a “reply inside thread/topic” concept

If the platform cannot satisfy both, the adapter should prefer thread correctness over reply correctness and report a structured warning via `DeliveryResult.error` (type `content_rejected` or `unknown` depending on channel semantics).

---

## Channel Notes

### Discord

Canonical normalization:

- `container_id`: the parent channel ID (or DM channel ID for DMs)
- `thread_id`: the thread channel ID (when the inbound message occurred inside a thread)
- `reply_to_id`: the message ID being replied to (Discord message reference)

Outbound:

- `thread_id` routes delivery into the thread channel.
- `reply_to_id` maps to Discord `message_reference.message_id`.

### Telegram

Canonical normalization:

- `container_id`: the chat ID
- `thread_id`: `message_thread_id` (forum topic id) when applicable
- `reply_to_id`: `reply_to_message_id` when applicable

Outbound:

- `thread_id` maps to Telegram `message_thread_id`.
- `reply_to_id` maps to Telegram `reply_to_message_id`.

---

## Non-Goals

- A global “directory” of all possible targets. That is specified separately in `CHANNEL_DIRECTORY.md`.
- Forcing a single `to` string format across all adapters. The adapter controls `to` formats (but must document them).
