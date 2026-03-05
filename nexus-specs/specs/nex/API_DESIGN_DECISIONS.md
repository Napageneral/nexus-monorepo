# Nex API Design Decisions

**Status:** IN PROGRESS — Batch 1 complete, remaining batches pending discussion
**Last Updated:** 2026-03-03

---

## Purpose

This document captures every design decision made during the API redesign — the domain structure, operation naming, architectural choices, and the reasoning behind each. It serves as the authoritative record of what we decided and why, so nothing is lost between passes.

**Approach:** Medium-level pass over domain batches one at a time (discuss → align → capture), then deep pass with full input/output schemas.

---

## Foundational Principles

These principles govern all design decisions:

1. **Database models ARE the objects.** The ~75 tables across 7 SQLite databases define the real domain objects. The API is a typed projection of those objects, not an abstraction layer above them.

2. **CRUD verbs on objects, not ad-hoc operation names.** Every operation is `{domain}.{verb}` or `{domain}.{sub-object}.{verb}` where verbs are drawn from a small standard set: `list`, `get`, `create`, `update`, `delete`, `search`, plus domain-specific verbs where CRUD doesn't fit (e.g., `fork`, `send`, `abort`).

3. **Ideal end state, not incremental migration.** We're designing the target API. No backwards compatibility constraints. Hard cutover when implementation diverges.

4. **Immutable-first data model.** Append-only where possible. Events are immutable. Sessions are immutable logs. Turns are immutable. Messages are immutable. The turn tree is append-only (like git commits).

5. **Singular vs. plural domain names** — needs final decision. Current code uses plural (`sessions.list`). Under discussion.

---

## Batch 1: Events + Sessions + Chat + PubSub

### Domain: Events

**Database:** `events.db` — 3 tables + FTS (events, events_fts, attachments, attachment_interpretations)

#### Decision: Unified event.ingest

The `event.ingest` operation is a single unified handler. Sync/async behavior is controlled by `request.sync`, not by event origin.

#### Decision: events.emit deferred

Investigate `events.emit` as a separate operation for internal subsystem events. Deferred to deep pass.

#### Operations (target)

| Operation | Verb | Description |
|-----------|------|-------------|
| `events.ingest` | write | Accept and process an inbound event (the primary entry point) |
| `events.list` | read | List events with filters (platform, sender, container, time range) |
| `events.get` | read | Get a single event by ID |
| `events.search` | read | Full-text search across event content (via FTS5) |
| `events.stream` | read | SSE stream of real-time events (currently HTTP-only) |

---

### Domain: PubSub (Internal Event Bus)

The internal event bus — `InMemoryEventBus` — broadcasts real-time events within the runtime process. It is NOT the same as the events ledger. The bus is ephemeral; events.db is persistent.

#### Decision: "pubsub" not "bus"

We chose `pubsub` because "bus" is overloaded and too generic. "pubsub" precisely describes the pattern and clearly distinguishes from the persistent events domain.

#### Operations (target)

| Operation | Verb | Description |
|-----------|------|-------------|
| `pubsub.subscribe` | read | Subscribe to a stream of bus events (filtered by type) |
| `pubsub.publish` | write | Publish an event to the bus |
| `pubsub.unsubscribe` | write | Remove a subscription |

**Open question:** Should `pubsub.publish` be client-facing or internal-only? Exposing it over RPC makes it distributed pub/sub — significant complexity increase.

---

### Domain: Agent Sessions (agents.sessions / agents.turns / agents.messages)

**Database:** `agents.db` — 15 tables

#### Decision: Restructure under agents.* namespace

Sessions, turns, messages, and the session queue all live under `agents.*`. Sessions don't exist independently — they're always scoped to an agent. The hierarchy:

```
agent
  └── session (persistent label → thread binding)
        └── turn (unit of LLM work, DAG via parent_turn_id)
              └── message (user/assistant/system/tool content)
              └── tool_call (tool invocations, may spawn sub-sessions)
```

#### Decision: Sessions are immutable append-only

You cannot modify history, delete turns, or edit messages. The turn tree is append-only like git commits. `session_history` tracks thread rebinds as an append-only log.

**Implications:**
- `sessions.reset` removed — use `sessions.fork` instead
- `sessions.delete` → `sessions.archive` (soft-archive, not destructive)
- `sessions.patch` removed (already disabled in code)
- `sessions.compact` stays ledger-managed (already a no-op)

#### Decision: Fork from turns, not sessions

`agents.sessions.fork` creates a new session branching from a specific turn. The turn tree is the real data structure — you branch from a commit, not from a branch.

#### Decision: chat.inject → parameter on chat.send

Injecting an assistant message is just sending with `role: "assistant"`. No separate operation needed.

#### Operations (target)

**agents.sessions:**

| Operation | Verb | Description |
|-----------|------|-------------|
| `agents.sessions.list` | read | List sessions with filters |
| `agents.sessions.get` | read | Get session details by key/label |
| `agents.sessions.resolve` | read | Resolve a session key to a concrete session |
| `agents.sessions.create` | write | Explicitly create a new session |
| `agents.sessions.fork` | write | Fork a new session from a specific turn |
| `agents.sessions.archive` | write | Soft-archive a session |
| `agents.sessions.transfer` | write | Transfer continuity between sessions |
| `agents.sessions.import` | write | Import external session history |
| `agents.sessions.import.chunk` | write | Chunked upload for large imports |
| `agents.sessions.history` | read | Read session_history (thread rebind log) |
| `agents.sessions.preview` | read | Bulk preview of session contents |

**agents.turns:**

| Operation | Verb | Description |
|-----------|------|-------------|
| `agents.turns.list` | read | List turns in a session/thread |
| `agents.turns.get` | read | Get a single turn with full details |

**agents.messages:**

| Operation | Verb | Description |
|-----------|------|-------------|
| `agents.messages.list` | read | List messages in a turn or across a session |
| `agents.messages.get` | read | Get a single message by ID |

**agents.sessions.queue:**

| Operation | Verb | Description |
|-----------|------|-------------|
| `agents.sessions.queue.list` | read | List queue items for a session |
| `agents.sessions.queue.cancel` | write | Cancel a queued item |

---

### Domain: Chat

Chat is the real-time conversational interface to agents. Separate from agents.sessions because chat is an *action* domain (doing things), while sessions are a *state* domain (persistent data).

#### Operations (target)

| Operation | Verb | Description |
|-----------|------|-------------|
| `chat.send` | write | Send a message (supports sync streaming, async fire-and-forget, assistant injection via role param) |
| `chat.history` | read | Read recent messages (optimized for chat UI, capped, byte-size limited) |
| `chat.abort` | write | Abort an in-progress agent run |

**chat.send key behaviors:**
- `sync: true` → streaming response
- `sync: false` → fire-and-forget
- `role: "assistant"` → inject mode (replaces chat.inject)
- `mode` param controls queue behavior (followup, queue, interrupt, steer, collect)

---

### Domain: System

| Operation | Verb | Description |
|-----------|------|-------------|
| `system.presence` | write | Report device/node presence (heartbeat, online/offline) |

---

### Cross-Cutting Decisions (Batch 1)

#### Queue modes
The session queue supports 5 modes as a parameter on `chat.send`:

| Mode | Behavior |
|------|----------|
| `followup` | Wait for current run to complete, then process |
| `queue` | Add to queue, process in order |
| `interrupt` | Abort current run, process immediately |
| `steer` | Inject into current run's context without aborting |
| `collect` | Batch with other collected messages, process together |

#### Event deduplication
`events.ingest` supports idempotency via `(platform, event_id)` unique constraint. `chat.send` uses `idempotencyKey` at the session/queue level.
