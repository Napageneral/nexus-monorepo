# Event Ledger Unification

**Status:** DESIGN SPEC
**Last Updated:** 2026-02-13
**Related:** MEMORY_SYSTEM.md, CORTEX_AGENT_INTERFACE.md, roles/MEMORY_WRITER.md, ../../runtime/broker/MEESEEKS_PATTERN.md

---

## Problem

There are currently **two separate event systems** with different schemas, different databases, and different write paths:

1. **Nex Events Ledger** (`~/nexus/state/data/events.db`) — TypeScript, managed by `nex/src/db/events.ts`. Written by pipeline stages (`receiveEvent`, `finalize`). Has inbound and outbound events with `from_channel`, `from_identifier`, `to_recipients`.

2. **Cortex Events Table** (`cortex.db` → `events` table) — Go, managed by `nex/cortex/internal/db/schema.sql`. Written by adapters (AIX, Gmail, iMessage, Nexus logs). Has `source_adapter`, `direction`, `event_participants`, FTS5, and episode linking.

The Cortex events table is a bad port. There should be **one events ledger** — the Nex one. All adapters should write to it. All downstream consumers (episodes, memory, search) should read from it.

---

## Decision

**Delete the Cortex events table and everything that depends on it. Unify around the Nex events ledger (`events.db`).**

---

## Current State: What Writes Where

### Nex Events Ledger (`events.db`)

| Writer | When | Direction | What |
|--------|------|-----------|------|
| `receiveEvent.ts` (Stage 1) | Pipeline start | `inbound` | Every incoming user message from any channel |
| `finalize.ts` (Stage 8) | Pipeline end | `outbound` | Nexus response when delivery succeeds |

Schema (from `nex/src/db/events.ts`):
```sql
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    source_id TEXT NOT NULL,
    type TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'inbound',  -- 'inbound' | 'outbound'
    thread_id TEXT,
    content TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'text',
    attachments TEXT,                            -- JSON
    from_channel TEXT NOT NULL,
    from_identifier TEXT NOT NULL,
    to_recipients TEXT,                          -- JSON
    timestamp INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    metadata TEXT,                               -- JSON
    UNIQUE(source, source_id)
);
```

### Cortex Events Table (`cortex.db`) — TO BE REMOVED

| Writer | When | Direction | What |
|--------|------|-----------|------|
| `AixAdapter` (aix.go) | Sync | sent/received/observed | Every AIX message (full fidelity) |
| `AixEventsAdapter` (aix_events.go) | Sync | sent/received | Trimmed turns (2 events per turn: consolidated user + stripped assistant) |
| `NexusAdapter` (nexus.go) | Sync | observed | Nexus JSONL event logs |
| `eve.go` | Sync | sent/received | iMessage events |
| `gmail.go` | Sync | sent/received | Gmail events |

Schema (from `nex/cortex/internal/db/schema.sql`):
```sql
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    channel TEXT NOT NULL,
    content_types TEXT NOT NULL,     -- JSON array
    content TEXT,
    direction TEXT NOT NULL,         -- sent/received/observed/created/updated/deleted
    thread_id TEXT,
    reply_to TEXT,
    source_adapter TEXT NOT NULL,
    source_id TEXT NOT NULL,
    metadata_json TEXT,
    UNIQUE(source_adapter, source_id)
);
```

---

## What Needs to Happen

### Phase 1: Migrate Adapters to Write to Nex Events Ledger

Every Go adapter that currently writes to the Cortex events table needs to write to `events.db` instead. This means either:

**Option A: Adapters call into Nex's events.db directly via SQLite**
- Adapters open `events.db` and write with the Nex schema
- Straightforward but requires Go code to know about the Nex schema

**Option B: Adapters write via a shared interface**
- Create a common event insertion interface used by both Go and TypeScript
- Cleaner long-term but more infrastructure

**Recommended: Option A.** The adapters already do direct SQLite writes. Just point them at `events.db` and map the columns.

#### Column Mapping (Cortex → Nex)

| Cortex column | Nex column | Mapping |
|---|---|---|
| `id` | `id` | Keep as-is |
| `timestamp` | `timestamp` | Keep as-is |
| `channel` | `from_channel` | For sent: `from_channel = channel`. For received: needs sender identifier resolution |
| `content_types` | `content_type` | JSON array → single string (take first, usually `"text"`) |
| `content` | `content` | Keep as-is |
| `direction` | `direction` | `"sent"` → `"outbound"`, `"received"` → `"inbound"`, `"observed"` → `"inbound"` (or add `"observed"`) |
| `thread_id` | `thread_id` | Keep as-is |
| `reply_to` | `metadata.reply_to` | Move to metadata JSON |
| `source_adapter` | `source` | Keep as-is |
| `source_id` | `source_id` | Keep as-is |
| `metadata_json` | `metadata` | Keep as-is |
| *(none)* | `from_identifier` | **New** — needs to be set. For AIX: user/AI contact identifier. For iMessage/Gmail: sender address. |
| *(none)* | `to_recipients` | **New** — needs to be set. JSON array of `{channel, identifier}`. |
| *(none)* | `received_at` | Set to `timestamp` (or current time for sync operations) |
| *(none)* | `type` | Set to `"message"` (or derive from context: `"message"`, `"tool_invocation"`, etc.) |

#### Adapters to Migrate

1. **`AixAdapter` (aix.go)** — Full fidelity AIX messages. Currently writes every message. Maps user→outbound, assistant→inbound, tool→inbound (observed).

2. **`AixEventsAdapter` (aix_events.go)** — Trimmed turns. Currently writes 2 events per turn. This is the memory-focused import — consolidated user message + stripped assistant response.

3. **`NexusAdapter` (nexus.go)** — Nexus JSONL event logs. Currently writes raw log entries as events.

4. **`eve.go` (iMessage)** — iMessage adapter. Currently writes sent/received messages.

5. **`gmail.go`** — Gmail adapter. Currently writes sent/received emails.

6. **Any other adapters** — Check for bird.go or other adapters.

#### Migration Notes for `from_identifier` and `to_recipients`

The Cortex schema uses a separate `event_participants` junction table for sender/recipient info. The Nex schema inlines `from_identifier` and `to_recipients` directly on the event row.

The adapters already resolve contacts and write to `event_participants`. The migration needs to **inline** this:
- `from_identifier`: The sender's identifier (email, phone, AI model, etc.)
- `to_recipients`: JSON array of `{channel, identifier}` for recipients

This is actually simpler — no junction table needed.

### Phase 2: Add Missing Capabilities to Nex Events Ledger

The Cortex events table has features the Nex events table doesn't:

#### Must Add

1. **FTS5 full-text search** — The Cortex schema has `events_fts` with porter stemming. The memory reader needs text search over events. Add to `events.db`:
   ```sql
   CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
       event_id UNINDEXED,
       content,
       tokenize='porter unicode61'
   );
   -- Plus insert/update/delete triggers to keep in sync
   ```

2. **Embeddings support** — Events need to be embeddable for semantic search. The Cortex `embeddings` table is generic (`target_type` + `target_id`). This stays in `cortex.db` — it's not an events-specific table. The embeddings table just needs to reference Nex event IDs.

#### Nice to Have (Can Defer)

3. **Threads table** — The Cortex schema has a `threads` table grouping events. The Nex schema just has `thread_id` as a string column. This is fine for now — threads can be derived from `thread_id` values.

4. **Event state** (read/unread, flagged, archived) — The Cortex `event_state` table. Not needed for memory. Can add later.

5. **Attachments table** — The Nex schema has an `attachments` JSON column. The Cortex schema has a full `attachments` table with storage URIs, MIME types, content hashes. The JSON column is sufficient for now.

6. **Event tags** — The Cortex `event_tags` and `tags` tables. Not needed for memory writer. Can add later.

### Phase 3: Migrate Episode Linking

The Cortex `episode_events` junction table links episodes to events by event ID:

```sql
CREATE TABLE IF NOT EXISTS episode_events (
    episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY (episode_id, event_id)
);
```

Currently `event_id` references the Cortex events table. After migration, it needs to reference Nex events ledger IDs.

**Two options:**
1. **Cross-database reference** — `episode_events` stays in `cortex.db`, references `events.db` event IDs by convention (no FK enforcement across databases).
2. **Move episode tables to `events.db`** — Episodes are fundamentally about event grouping. They could live in the events database.

**Recommended: Option 1.** Episodes involve entities and relationships (which live in `cortex.db`), so keeping them in `cortex.db` makes sense. The `event_id` column becomes a logical reference (no FK enforcement since it's cross-database), and the chunking code ATTACHes `events.db` when it needs to read events.

### Phase 4: Remove Cortex Events Infrastructure

Once adapters write to `events.db` and episode linking uses Nex event IDs:

#### Tables to Remove from `cortex.db` schema.sql

| Table | Why it can go |
|---|---|
| `events` | Replaced by `events.db` |
| `events_fts` | Replaced by FTS5 on `events.db` |
| `event_participants` | Replaced by `from_identifier` + `to_recipients` on event row |
| `event_state` | Not used by memory system. Can re-add later if needed. |
| `event_tags` | Not used by memory system. Can re-add later if needed. |
| `tags` | References events. Remove with events. |
| `threads` | Replaced by `thread_id` column on events. Can re-derive. |
| `attachments` | Replaced by `attachments` JSON column on event row |
| `document_heads` | References events. Needs analysis — may need to reference new event IDs. |
| `retrieval_log` | References events and document_heads. Same treatment. |

#### Tables to Keep in `cortex.db`

| Table | Why it stays |
|---|---|
| `episodes` | Core memory infrastructure |
| `episode_events` | Links episodes to Nex events (cross-db reference) |
| `episode_definitions` | Episode chunking configuration |
| `entities` | Core knowledge graph |
| `entity_aliases` | Identity resolution |
| `relationships` | Knowledge graph edges |
| `episode_entity_mentions` | Provenance |
| `episode_relationship_mentions` | Provenance |
| `embeddings` | Unified embeddings (references targets by type+id) |
| `merge_candidates` | Entity dedup |
| `entity_merge_events` | Merge audit trail |
| `persons` | Person identity |
| `person_facts` | Person knowledge |
| `contacts` | Communication endpoints |
| `contact_identifiers` | Contact details |
| `person_contact_links` | Person-contact mapping |
| `analysis_types` | Analysis configuration |
| `analysis_runs` | Analysis results |
| `facets` | Extracted values |
| `sync_watermarks` | Adapter sync state (adapters still sync to cortex.db for non-event tables) |
| `adapter_state` | Adapter-specific state |
| `bus_events` | Automation event stream |
| `sync_jobs` | Sync progress |

#### Adapter Sync State

`sync_watermarks` currently tracks sync progress per adapter for both event sync and non-event sync. After migration:
- Event sync watermarks should move to `events.db` (or a new watermarks table there)
- Non-event sync watermarks (for entities, analysis, etc.) stay in `cortex.db`

---

## Outbound Event Capture: Current Coverage

### Pipeline Path (covered ✅)

The pipeline already captures both sides:

1. **Inbound:** `receiveEvent.ts` (Stage 1) writes to `events.db` with `direction: "inbound"`
2. **Outbound:** `finalize.ts` (Stage 8) writes to `events.db` with `direction: "outbound"` when `delivery_result.success && response.content`

The outbound event includes: `request_id`, `turn_id`, `persona`, `in_reply_to` (event_id of incoming), `delivery_message_ids`.

### Agent-Initiated Sends (partially covered ⚠️)

When agents use the message tool to send messages on behalf of the user:

1. `message-action-runner.ts` → `outbound-send-service.ts` → `executeSendAction`
2. `executeSendAction` calls `appendAssistantMessageToLedger` (writes to the **agents ledger** session transcript, NOT to `events.db`)
3. The actual delivery goes through channel-specific send functions

**Gap:** Agent-initiated sends (e.g., "send Mom a text saying I'll be late") write to the agents session ledger but NOT to `events.db`. The events ledger doesn't know about messages Nexus sent on behalf of the user outside the pipeline.

### Other Outbound Paths

1. **`deliverOutboundPayloads`** (deliver.ts) — Used by `routeReply` and direct delivery. Has `mirror` param that calls `appendAssistantMessageToLedger`. Does NOT write to `events.db`.

2. **`routeReply`** (route-reply.ts) — Routes replies back to originating channels. Calls `deliverOutboundPayloads`. No `events.db` write.

3. **Chat server** (`server-methods/chat.ts`) — Calls `appendAssistantMessageToLedger` for session transcript. No `events.db` write.

### What Needs Fixing

**Add `events.db` writes for all outbound paths**, not just the pipeline:

| Path | Currently writes to events.db? | Fix needed |
|---|---|---|
| Pipeline finalize (Nexus responding to user) | ✅ Yes | None |
| Agent message tool (send on behalf of user) | ❌ No | Add insertEvent call |
| `deliverOutboundPayloads` (all outbound delivery) | ❌ No | Add insertEvent call |
| `routeReply` (reply routing) | ❌ No | Covered if deliverOutboundPayloads writes |
| Chat server (web UI responses) | ❌ No | Add insertEvent call |

**Recommended approach:** Add event capture at `deliverOutboundPayloads` level — this is the common delivery function all paths funnel through. One insertion point covers most paths. The pipeline's finalize already handles the direct pipeline path.

Alternatively, the agent message tool path (`executeSendAction`) could also write directly, since those sends may not go through `deliverOutboundPayloads`.

---

## Direction Values

The Nex schema currently uses `"inbound"` / `"outbound"`. The Cortex schema uses `"sent"` / `"received"` / `"observed"` / etc.

**Decision: Keep Nex's `"inbound"` / `"outbound"`, add `"observed"`.**

| Direction | Meaning |
|---|---|
| `inbound` | Message received by Nexus (user→Nexus, or external→Nexus) |
| `outbound` | Message sent by Nexus (Nexus→user, or Nexus on behalf of user) |
| `observed` | Event observed but not directed at or from Nexus (e.g., tool invocations, system events, imported AI tool calls) |

---

## AIX Import: No Changes Needed

The AIX adapters are already solid. After migration they just need to:
1. Write to `events.db` instead of `cortex.db`
2. Map columns to the Nex schema (see column mapping above)
3. Set `from_identifier` and `to_recipients` (currently handled via `event_participants` junction table — needs to be inlined)

The two-adapter model is correct:
- **`AixAdapter`** — full fidelity (every message) — for the agents ledger and complete event record
- **`AixEventsAdapter`** — trimmed turns (memory-focused) — for episodic memory construction

---

## Implementation Order

1. **Add FTS5 to `events.db`** — Small, independent, immediately useful
2. **Add `"observed"` direction to Nex events schema** — Small schema change
3. **Add outbound event capture to `deliverOutboundPayloads`** — Close the outbound gap for non-pipeline paths
4. **Migrate AIX adapters** — Write to `events.db` instead of `cortex.db`
5. **Migrate iMessage/Gmail adapters** — Same treatment
6. **Migrate NexusAdapter** — Same treatment
7. **Migrate episode_events linking** — Reference Nex event IDs, cross-db
8. **Add sync watermarks to `events.db`** — For adapter sync state
9. **Remove Cortex events infrastructure** — Drop tables, remove Go code
10. **Migrate `document_heads` and `retrieval_log`** — If still needed, point at new event IDs

---

## Schema Changes Summary

### Add to `events.db`

```sql
-- FTS5 full-text search index
CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
    event_id UNINDEXED,
    content,
    tokenize='porter unicode61'
);

-- Triggers to keep FTS in sync
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

-- Sync watermarks (for adapter sync tracking)
CREATE TABLE IF NOT EXISTS sync_watermarks (
    adapter TEXT PRIMARY KEY,
    last_sync_at INTEGER NOT NULL,
    last_event_id TEXT
);
```

### Modify `events.db` events table

Add `"observed"` as valid direction (no schema change needed — it's just a TEXT column, but document the convention).

### Remove from `cortex.db`

All tables listed in "Tables to Remove" above, plus their indexes and triggers.

---

## Open Questions

1. **`document_heads` and `retrieval_log`** — These track document-type events (skills, tools, memory). Do they stay in `cortex.db` referencing Nex event IDs, or move to `events.db`? They're not directly memory-related — more of a document management concern.

2. **`bus_events`** — The automation event stream. It references `mnemonic_event_id`. After migration, these reference Nex event IDs. Does it stay in `cortex.db` or move?

3. **Adapter sync for non-event data** — Adapters that sync both events AND non-event data (contacts, persons, facets) currently track sync progress in `cortex.db` `sync_watermarks`. Event sync watermarks move to `events.db`. Non-event sync watermarks stay. Need two watermark tables or one with a `ledger` column?

4. **`contacts` and `persons` tables** — These are referenced by `event_participants` (being removed). After removal, contacts/persons still exist for the knowledge graph. No change needed — just remove the `event_participants` junction table.

---

## Related Documents

- `MEMORY_SYSTEM.md` — Tripartite memory model
- `CORTEX_AGENT_INTERFACE.md` — Cortex tool/API surface
- `roles/MEMORY_WRITER.md` — Memory writer role spec
- `roles/MEMORY_READER.md` — Memory reader role spec
- `../../runtime/broker/MEESEEKS_PATTERN.md` — Meeseeks pattern
