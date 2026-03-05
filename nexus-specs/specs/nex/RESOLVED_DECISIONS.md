# Resolved Design Decisions

**Status:** COMPLETE — all decisions locked
**Date:** 2026-03-04
**Context:** Decisions resolved during gap analysis review session

---

## 1. Channel Domain Deduplication

**Decision:** `channels.*` is ONE domain combining data operations (Batch 2) and delivery operations (Batch 5).

**Deduplicated union — 12 operations:**

| Operation | Source | Description |
|-----------|--------|-------------|
| `channels.list` | B2+B5 | List channels with data AND delivery context (adapter/account bindings) |
| `channels.get` | B2 | Get single channel with full record |
| `channels.search` | B2 | Search channels by platform, space, container, participant |
| `channels.history` | B2 | Get naming history for a channel (immutable row pattern) |
| `channels.participants.list` | B2 | List participants in a channel |
| `channels.participants.get` | B2 | Get participant details |
| `channels.status` | B5 | Channel health (delegates to adapter health) |
| `channels.send` | B5 | Send a message on a channel |
| `channels.stream` | B5 | Stream a response on a channel (typing indicators) |
| `channels.react` | B5 | React to a message (stub) |
| `channels.edit` | B5 | Edit a message (stub) |
| `channels.delete` | B5 | Delete a message (stub) |

---

## 2. Plural Domain Names Everywhere

**Decision:** All domain names are plural. No exceptions.

| Old (singular) | New (plural) |
|----------------|-------------|
| `event.ingest` | `events.ingest` |
| `event.backfill` | `events.backfill` |
| `agent.identity.get` | `agents.identity.get` |
| `agent.wait` | `agents.wait` |

This applies to ALL operations across the taxonomy.

---

## 3. `pubsub.publish` is Client-Facing

**Decision:** `pubsub.publish` is exposed as an external API operation, not internal-only.

**Rationale:** The design philosophy is that everything is available as an external API by default, with access controlled through IAM policies and ACL. Internal-only restrictions are applied via policy, not by hiding operations.

All three pubsub operations are client-facing:
- `pubsub.subscribe` — subscribe to event stream
- `pubsub.publish` — publish an event to the bus
- `pubsub.unsubscribe` — remove subscription

---

## 4. `events.emit` Dropped

**Decision:** `events.emit` (for internal subsystem events) is dropped. This IS the pubsub system — it was already renamed.

Internal subsystem notifications (memory processed, job completed, etc.) go through `pubsub.publish` (ephemeral bus). They do NOT write to events.db (which is for external inbound events only).

---

## 5. Channel → Account Resolution: Option C

**Decision:** Channel records carry `account_id` from adapter discovery. The Manager Agent queries channels to find available sender accounts.

### How It Works

When an adapter connects and discovers channels (via monitoring), it writes channel records WITH the `account_id` it used to discover them. The Batch 2 channels schema already has `account_id` as a field on the identity key: `(platform, account_id, container_id, thread_id)`.

If multiple accounts can reach the same channel (e.g., both Tyler and the bot are in a Discord server), there are multiple channel records — one per `(platform, account_id, container_id, thread_id)` tuple.

### The MA's Query Flow

```
MA: "Send Casey a message on Discord"
  → contacts.search("Casey") → Contact with entity_id
  → channels.list({ participant_entity_id: casey_entity_id, platform: "discord" })
  → Returns channels with their account_ids
  → MA picks channel + account, applies sender preference
  → channels.send(channel_id, message, { sender_account_id: ... })
```

### The `channels.send` Implementation

```
channels.send(channel_id, message, { sender_account_id })
  → Look up channel record → get adapter, account_id
  → Find adapter_connection for (adapter, account_id)
  → Get credential_id from adapter_connection
  → Resolve credential via storage provider
  → Spawn adapter binary with delivery.send + injected credential
```

### MA Sender Preferences

The MA handles sender identity decisions (send as user vs. send as agent) per the [MANAGER_AGENT_COMMUNICATIONS.md](./MANAGER_AGENT_COMMUNICATIONS.md) spec. Preferences are stored in the MA's workspace.

---

## 6. Gap Analysis Corrections

### Phantom Operations (removed — not in any spec)
- `agents.sessions.update` — spec says `sessions.patch` is REMOVED (sessions are immutable)
- `agents.sessions.delete` — becomes `agents.sessions.archive` (soft-archive)
- `agents.sessions.context.get` — never in any spec
- `agents.sessions.context.set` — never in any spec

### Missed Operations (added — in specs but missing from gap analysis)
- `agents.sessions.resolve` — Batch 1: resolve session key to concrete session
- `agents.sessions.preview` — Batch 1: bulk preview of session contents
- `agents.sessions.history` — Batch 1: read session_history (thread rebind log)
- `agents.sessions.import.chunk` — Batch 1: chunked upload for large imports
- `events.backfill` — Batch 5: trigger historical event backfill from adapter
- `adapters.connections.upload` — Batch 5: file upload for file-based adapter import

### Corrected Session Operations (11 ops, matching Batch 1 spec)
1. `agents.sessions.list`
2. `agents.sessions.get`
3. `agents.sessions.resolve`
4. `agents.sessions.create`
5. `agents.sessions.fork`
6. `agents.sessions.archive`
7. `agents.sessions.transfer`
8. `agents.sessions.import`
9. `agents.sessions.import.chunk`
10. `agents.sessions.history`
11. `agents.sessions.preview`

---

## 7. `clock.schedule.*` → `cron.*`

**Decision:** Batch 6 wins. The `cron.*` naming is authoritative.

The ADAPTER_INTERFACE_UNIFICATION.md has been updated with a supersession note. The `clock.schedule.*` naming in that document is historical.

---

## 8. `status` Output Shape Alignment

**Decision:** Deferred to the deep pass or implementation phase.

The Batch 5 TypeScript interface for `status` output needs alignment with all Batch 1-6 domains (e.g., references `cron.jobs` old naming, doesn't include DAGs). This is a minor fix that can be done during implementation.
