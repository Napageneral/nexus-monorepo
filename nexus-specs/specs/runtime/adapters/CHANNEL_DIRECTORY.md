# Channel Directory (Targets + Threads)

**Status:** DESIGN SPEC  
**Last Updated:** 2026-02-18  
**Related:** `ADAPTER_SYSTEM.md`, `INBOUND_INTERFACE.md`, `OUTBOUND_TARGETING.md`, `../../data/cortex/v2/UNIFIED_ENTITY_STORE.md`

---

## Overview

Nexus needs two different “directory” concepts:

1. **Identity directory** (global): people/entities and their contact methods across channels.
2. **Channel directory** (per-channel, per-account): the concrete platform targets you can send to (DM peers, group chats, channels, threads/topics).

This document specifies the **channel directory**.

---

## Why This Exists

Replying to the current message does not require any directory: NEX already has a concrete `delivery.*` target from the inbound event.

The channel directory becomes necessary when:

- UI needs to list/select channels/conversations (e.g. “send a message to #general”)
- Agent uses `message` tool to send to a *different* target than the current one
- User wants “broadcast / notify” behavior

---

## Scope

The channel directory is owned by the **NEX Adapter Manager** and is keyed by:

- `delivery.platform`
- `delivery.account_id`

It is not the identity system and should not attempt to infer cross-channel identity.

---

## Data Model (Logical)

```ts
type ChannelDirectoryEntry = {
  platform: string;
  account_id: string;

  container_kind: "dm" | "group" | "channel";
  container_id: string;               // platform-native container id
  thread_id?: string;            // platform-native thread/topic id

  display_name?: string;         // best-effort human name for UI
  handle?: string;               // e.g. "#general" or "@alice" when applicable

  last_seen_at: number;          // unix ms
  last_message_id?: string;      // platform-native message id

  // Channel-specific non-authoritative metadata
  metadata?: Record<string, unknown>;
};
```

**Notes:**

- `container_id` + `thread_id` identify the outbound destination (see `OUTBOUND_TARGETING.md`).
- `display_name` and `handle` are convenience fields for UI; they are untrusted and may change.

---

## Population Strategy (Recommended)

### 1. Passive Population (Required)

On every inbound `NexusEvent`, NEX upserts a channel directory entry using:

- `event.platform`, `event.account_id`
- `event.container_kind`, `event.container_id`, `event.thread_id`
- Best-effort names from `event.metadata`
- `last_seen_at = event.timestamp`
- `last_message_id = source message id` (if available)

This makes the channel directory “just work” without requiring an explicit listing API on day one.

### 2. Active Sync (Optional, Future)

Some platforms can enumerate channels/conversations even if no recent inbound traffic exists.

Adapters MAY implement a directory command surface (exact protocol TBD; preferred shape):

```bash
<command> directory list --account <account_id> --format json
```

Returns a JSON array of `ChannelDirectoryEntry`-like objects.

NEX can call this:

- On-demand from UI
- Periodically to keep directory warm

---

## Querying / UI Use

NEX should expose:

- Recent targets per channel/account
- Filter by `container_kind`
- Search by `display_name` / `handle` (best-effort)

**Important:** Do not inject the full directory into agent prompts. If agent needs to select a destination, provide a tool or a small recent list.

---

## Relationship To Identity Directory

The identity directory can map an entity/person to possible delivery identifiers (e.g. Discord user id, Telegram user id, phone number).

The channel directory maps those identifiers into **sendable targets** and optionally helps resolve:

- Which account can reach that target
- Which container/thread should be used

---

## Security / Trust Model

- Directory fields are derived from external platforms and are **untrusted input**.
- Treat `display_name` and `metadata` as advisory only.
- IAM policies still gate whether inbound events are allowed and whether outbound sends are permitted.
