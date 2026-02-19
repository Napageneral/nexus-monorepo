# Unified Delivery Taxonomy

**Status:** DESIGN SPEC  
**Last Updated:** 2026-02-18  
**Related:**
- `adapters/INBOUND_INTERFACE.md`
- `adapters/OUTBOUND_TARGETING.md`
- `adapters/CHANNEL_DIRECTORY.md`
- `iam/POLICIES.md`
- `iam/ACCESS_CONTROL_SYSTEM.md`
- `RUNTIME_ROUTING.md`
- `broker/SESSION_LIFECYCLE.md`

---

## Goal

Define a single, uniform delivery taxonomy used:

- internally by NEX for routing, IAM, session keys, and outbound delivery
- at the adapter protocol boundary (all external adapters MUST normalize into this taxonomy)

This taxonomy is designed to map cleanly across Discord, Slack, iMessage, Telegram, and Email.

---

## Canonical Hierarchy

Every inbound message is located at:

`platform` -> `account_id` -> optional `space_id` -> `container_kind + container_id` -> optional `thread_id` -> optional `reply_to_id`

Definitions:

- `platform`: the external system (discord/slack/imessage/telegram/gmail) or internal ingress (control-plane/webchat).
- `account_id`: which adapter account/token/bot instance received the message.
- `space_id`: the platform's "server/workspace" identifier when the platform has that concept.
- `container_kind`: the kind of conversation container where messages are posted.
- `container_id`: the platform-native id of that container.
- `thread_id`: a platform-native thread/topic identifier, when applicable.
- `reply_to_id`: the platform-native message identifier being replied to, when applicable.

Important: messages never occur "at the space level" directly. A `space_id` exists to scope and organize containers, not to replace them.

---

## Canonical Delivery Context (Normalized)

This is the normalized delivery context carried on every `NexusEvent` and `NexusRequest`.

```ts
type ContainerKind = "dm" | "group" | "channel" | "direct";

type DeliveryContext = {
  // Platform + account
  platform: string;               // e.g. "discord", "slack", "imessage", "telegram", "gmail", "control-plane", "webchat"
  account_id: string;             // adapter account id / bot id / mailbox id

  // Sender (platform-native)
  sender_id: string;
  sender_name?: string;           // best-effort display name (untrusted)

  // Optional "space" above containers (server/workspace)
  space_id?: string;              // discord server id, slack workspace id, etc
  space_name?: string;            // best-effort (untrusted; for UI only)

  // The actual place messages happen
  container_kind: ContainerKind;  // dm | group | channel | direct (internal-only)
  container_id: string;           // platform-native conversation container id
  container_name?: string;        // best-effort (untrusted; for UI only)

  // Optional sub-container
  thread_id?: string;             // platform-native thread/topic id
  thread_name?: string;           // best-effort (untrusted; for UI only)

  // Optional message reference
  reply_to_id?: string;           // platform-native message id being replied to

  // Platform-specific delivery data. This MUST NOT be used for IAM matching,
  // session keys, dedupe, or identity. It exists to carry non-portable handles
  // needed for outbound responses (example: ephemeral reply tokens).
  metadata?: Record<string, unknown>;
};
```

Notes:

- `direct` is reserved for internal NEX ingress surfaces (control-plane/webchat/runtime). External adapters MUST NOT emit `direct`.
- `*_name` fields are optional and intended for UI/logging/directory display only. Routing and IAM matching MUST be by ids, never by names.

---

## Platform Mappings (Normative)

This section locks how each major platform maps into the taxonomy.

### Control-Plane (Internal Ingress)

- `platform = "control-plane"`
- `account_id = "default"` (or another stable runtime account id; control-plane is not multi-account in the adapter sense)
- `space_id`: none.
- `container_kind = "direct"`
- `container_id`: the control-plane "conversation container" identifier (recommended: the target session label / session key the UI is sending into).
- `thread_id`: none.
- `reply_to_id`: none.

Identity binding (normative):

- `sender_id` MUST be derived from verified control-plane auth (session token), not caller-controlled request JSON.
- In the simplest local-first mode, `sender_id` may be the owner's entity id. In hosted mode, `sender_id` should be a stable per-user subject that is mapped to an entity/principal by identity resolution.

### Webchat (Internal Ingress)

- `platform = "webchat"`
- `account_id = "default"` (or a stable webchat account id)
- `space_id`: none.
- `container_kind = "direct"` (webchat is an ingress surface, not an external adapter platform)
- `container_id`: the webchat conversation id (recommended: a stable session label/room id; if per-visitor, a stable webchat session id).
- `thread_id`: none.
- `reply_to_id`: none.

Identity binding (normative):

- `sender_id` MUST be derived from a daemon-issued webchat session token (or customer auth), not caller-controlled request JSON.
- Anonymous sessions SHOULD use a stable subject (example: `webchat:<session_id>`).
- Logged-in sessions SHOULD use the same stable subject used by other ingress surfaces (`user:<uuid>` or `oidc:<sub>`), enabling unified routing.

### Discord

- `platform = "discord"`
- `space_id`:
  - present for server (guild) traffic (channels + threads inside a server)
  - absent for DMs and group DMs
- `container_kind`:
  - `dm`: 1:1 DM channel
  - `group`: group DM channel
  - `channel`: server channel (e.g. #general)
- `container_id`: Discord channel id for the container (DM channel id, group DM channel id, or server channel id).
- `thread_id`: thread channel id when the message is inside a thread.
- `reply_to_id`: message id referenced by the reply, when present.

Recommended names:
- `space_name`: server name (best-effort)
- `container_name`: channel name (best-effort)
- `thread_name`: thread name (best-effort)

### Slack

- `platform = "slack"`
- `space_id`: Slack workspace/team id (always present for Slack traffic).
- `container_kind`:
  - `dm`: 1:1 DM conversation
  - `group`: multi-person DM conversation
  - `channel`: workspace channel
- `container_id`: Slack conversation id (Slack uses the same identifier class for all three).
- `thread_id`: Slack thread root identifier (the thread key used to reply within a thread).
- `reply_to_id`: optional; if both are available, `thread_id` SHOULD be preferred as the canonical thread routing key.

Recommended names:
- `space_name`: workspace name (best-effort)
- `container_name`: channel name or DM display label (best-effort)

### Telegram

- `platform = "telegram"`
- `space_id`: none (Telegram does not have a server/workspace concept analogous to Discord/Slack).
- `container_kind`:
  - `dm`: private chat
  - `group`: group/supergroup
  - `channel`: broadcast channel
- `container_id`: chat id.
- `thread_id`: forum topic id (`message_thread_id`) when applicable.
- `reply_to_id`: message id being replied to when present.

Recommended names:
- `container_name`: chat title (groups/channels) when available
- `thread_name`: forum topic title when available

### iMessage (EVE / BlueBubbles)

- `platform = "imessage"`
- `space_id`: none.
- `container_kind`:
  - `dm`: 1:1 chat
  - `group`: group chat
- `container_id`: chat guid (conversation identifier).
- `thread_id`: none (no native threads).
- `reply_to_id`: message guid of the referenced message for iMessage "reply bubble" semantics when available.

Named vs unnamed group chats:

- Represent both as `container_kind = "group"`.
- If a group has a name, set `container_name`.
- If a group does not have a name, omit `container_name`.

### Email (Gmail)

- `platform = "gmail"` (provider-specific; a future adapter MAY choose a platform-agnostic `"email"` layer)
- `space_id`: none.
- `container_kind = "group"` (email threads are multi-party and membership can evolve).
- `container_id`: thread id.
- `thread_id`: none (the email thread is already the container).
- `reply_to_id`: message id being replied to, when available (provider id and/or RFC `Message-ID` should be emitted in metadata).

Branching/forking:

- Email threading semantics (References/In-Reply-To, participant changes, branch behavior) should be represented in event metadata and/or the agent ledger.
- The delivery taxonomy only standardizes the stable routing identifiers needed for reply targeting.

---

## IAM Matching Rules (Normative)

IAM policies MUST be able to match on:

- `platform`
- `account_id`
- `space_id` (when present)
- `container_kind`
- `container_id`
- `thread_id` (when present)

IAM policies MUST NOT match on:

- `space_name`, `container_name`, `thread_name` (untrusted display fields)

Examples (illustrative policy intent):

- "Allow owner everywhere" should match principal, not delivery.
- "Ask on unknown Discord DMs" should match `platform=discord` and `container_kind=dm`.
- "Deny all Discord server channels except allowlisted spaces" should match `platform=discord`, `container_kind=channel`, then allow/deny by `space_id`.
- "Deny a single problematic container" should match `platform`, `container_kind`, and `container_id`.

This spec intentionally treats `space_id` as a first-class normalized field rather than hiding it in platform-specific metadata.

---

## Session Routing Guidance (Normative)

Session keys should be built from this taxonomy:

- If `container_kind` is `dm`: route to an identity-based session (see `RUNTIME_ROUTING.md`).
- If `container_kind` is `group` or `channel`: route to a container-based session keyed by `(platform, container_id)` and optionally `thread_id`.
- Internal `direct` ingress is allowed to provide an already-resolved routing override and should not be treated as a container identity for external policy logic.

---

## Directory + Storage Notes (Non-Normative)

This taxonomy supports two different directory systems:

- Contacts directory: delivery endpoints for entities (people/orgs/etc).
- Delivery directory: known `space_id` + `container_id` + `thread_id` targets per adapter account for outbound routing.

The exact database schema for these directories is specified elsewhere:

- `adapters/CHANNEL_DIRECTORY.md` (logical directory model)
- `DELIVERY_DIRECTORY_SCHEMA.md` (physical schema in identity.db)
- `RUNTIME_ROUTING.md` (contacts + identity resolution)

This document only locks the naming and meaning of the delivery identifiers.

---

## Migration Notes (Deprecated Field Names)

Older specs and code may use previous naming. The long-term intent is to rename internal schema and adapter SDKs to the taxonomy in this document.

Deprecated -> canonical:

- `channel` -> `platform`
- `peer_kind` -> `container_kind`
- `peer_id` -> `container_id`
- `guild_id` (Discord) -> `space_id`
- `thread_id` -> `thread_id` (same meaning)
- `reply_to_id` -> `reply_to_id` (same meaning)

---

## Ephemeral Reply Handles (Normative)

Some platforms require an ephemeral capability handle to send a reply (example: LINE `replyToken`).
This handle is not a stable message identifier and must not be treated as one.

Rules:

- `reply_to_id` is reserved for a stable message reference when the platform provides one.
- If the platform requires an ephemeral reply handle, adapters MUST place it in:
  - `delivery.metadata.reply_token` (string)
  - (`delivery.metadata.reply_handle` is a deprecated alias; adapters SHOULD prefer `reply_token`.)
- NEX MUST treat `delivery.metadata.reply_token` as an outbound-only hint:
  - never for IAM matching
  - never for session keys
  - never for dedupe

If a platform has no stable reply message identifier, `reply_to_id` SHOULD be omitted and only the
ephemeral reply handle should be provided in metadata.
