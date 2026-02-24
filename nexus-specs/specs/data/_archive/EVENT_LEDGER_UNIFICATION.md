# Event Ledger Unification

**Status:** COMPLETE
**Last Updated:** 2026-02-18
**Related:** ../../_archive/MEMORY_SYSTEM.md, ../../_archive/CORTEX_AGENT_INTERFACE.md, ../../_archive/MEMORY_WRITER.md, ../../runtime/broker/MEESEEKS_PATTERN.md

> **Canonical reference:** See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md) for the authoritative database layout.
>
> **Note:** This unification is now complete. The legacy memory events table has been eliminated. All Go adapters have been ported to TypeScript and write to the Nex events ledger (`events.db`). The document below is retained for historical context on the design decisions.

---

## Problem

There are currently **two separate event systems** with different schemas, different databases, and different write paths:

1. **Nex Events Ledger** (`~/nexus/state/data/events.db`) — TypeScript, managed by `nex/src/db/events.ts`. Written by pipeline stages (`receiveEvent`, `finalize`). Has inbound and outbound events with `platform`, `sender_id`, `to_recipients`.

2. **Legacy Memory Events Table** (`cortex.db` (now split into memory.db/identity.db/embeddings.db) → `events` table) — ~~Go, managed by `nex/cortex/internal/db/schema.sql`. Written by adapters (AIX, Gmail, iMessage, Nexus logs).~~ **ELIMINATED.** All Go adapters have been ported to TS. Had `source_adapter`, `direction`, `event_participants`, FTS5, and episode linking.

The legacy memory events table was a bad port. There should be **one events ledger** — the Nex one. All adapters should write to it. All downstream consumers (episodes, memory, search) should read from it.

---

## Decision

**Delete the legacy memory events table and everything that depends on it. Unify around the Nex events ledger (`events.db`).**

---

## Current State: What Writes Where

### Nex Events Ledger (`events.db`)

| Writer | When | Direction | What |
|--------|------|-----------|------|
| `receiveEvent.ts` (Stage 1) | Pipeline start | `inbound` | Every incoming user message from any platform |
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
    platform TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    to_recipients TEXT,                          -- JSON
    timestamp INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    metadata TEXT,                               -- JSON
    UNIQUE(source, source_id)
);
```

### Legacy Memory Events Table (`cortex.db`, now memory.db/identity.db/embeddings.db) -- REMOVED

> **Eliminated.** All Go adapters (`aix.go`, `aix_events.go`, `nexus.go`, `eve.go`, `gmail.go`, `bird.go`) have been ported to TypeScript and now write directly to `events.db`. The Go adapter code (`cortex/internal/adapters/`) is deleted. See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md) section 4.

---

## What Needs to Happen

### Phase 1: Migrate Adapters to Write to Nex Events Ledger — COMPLETE

> **Done.** All Go adapters have been ported to TypeScript and write directly to `events.db`. The Go adapter code is eliminated. See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md) section 4.

#### Column Mapping (Legacy → Nex) -- Historical Reference

| Legacy column | Nex column | Mapping |
|---|---|---|
| `id` | `id` | Keep as-is |
| `timestamp` | `timestamp` | Keep as-is |
| `channel` | `platform` | Platform identifier |
| `content_types` | `content_type` | JSON array → single string (take first, usually `"text"`) |
| `content` | `content` | Keep as-is |
| `direction` | `direction` | `"sent"` → `"outbound"`, `"received"` → `"inbound"`, `"observed"` → `"inbound"` (or add `"observed"`) |
| `thread_id` | `thread_id` | Keep as-is |
| `reply_to` | `metadata.reply_to` | Move to metadata JSON |
| `source_adapter` | `source` | Keep as-is |
| `source_id` | `source_id` | Keep as-is |
| `metadata_json` | `metadata` | Keep as-is |
| *(none)* | `sender_id` | Set from platform-specific sender identifier. |
| *(none)* | `to_recipients` | JSON array of `{platform, sender_id}`. |
| *(none)* | `received_at` | Set to `timestamp` (or current time for sync operations) |
| *(none)* | `type` | Set to `"message"` (or derive from context: `"message"`, `"tool_invocation"`, etc.) |

#### Migration Notes for `sender_id` and `to_recipients`

The legacy schema used a separate `event_participants` junction table for sender/recipient info. The Nex schema inlines `sender_id` and `to_recipients` directly on the event row. This is simpler -- no junction table needed.

### Phase 2: Add Missing Capabilities to Nex Events Ledger

The legacy memory events table had features the Nex events table doesn't:

#### Must Add

1. **FTS5 full-text search** — The legacy schema had `events_fts` with porter stemming. The memory reader needs text search over events. Add to `events.db`:
   ```sql
   CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
       event_id UNINDEXED,
       content,
       tokenize='porter unicode61'
   );
   -- Plus insert/update/delete triggers to keep in sync
   ```

2. **Embeddings support** — Events need to be embeddable for semantic search. The `embeddings` table is generic (`target_type` + `target_id`) and lives in `embeddings.db` — it's not an events-specific table. The embeddings table just needs to reference Nex event IDs.

#### Nice to Have (Can Defer)

3. **Threads table** — The legacy schema had a `threads` table grouping events. The Nex schema just has `thread_id` as a string column. This is fine for now — threads can be derived from `thread_id` values.

4. **Event state** (read/unread, flagged, archived) — The legacy `event_state` table. Not needed for memory. Can add later.

5. **Attachments table** — The Nex schema has an `attachments` JSON column. The legacy schema had a full `attachments` table with storage URIs, MIME types, content hashes. The JSON column is sufficient for now.

6. **Event tags** — The legacy `event_tags` and `tags` tables. Not needed for memory writer. Can add later.

### Phase 3: Migrate Episode Linking

The legacy `episode_events` junction table links episodes to events by event ID:

```sql
CREATE TABLE IF NOT EXISTS episode_events (
    episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY (episode_id, event_id)
);
```

Currently `event_id` references the legacy events table. After migration, it needs to reference Nex events ledger IDs.

**Decision: Cross-database reference.** `episode_events` lives in `memory.db`, referencing `events.db` event IDs by convention (no FK enforcement across databases). The `event_id` column is a logical reference, and the chunking code ATTACHes `events.db` when it needs to read events.

### Phase 4: Remove Legacy Events Infrastructure

Once adapters write to `events.db` and episode linking uses Nex event IDs:

#### Tables Removed from legacy memory DB (now in events.db)

| Table | Why it was removed |
|---|---|
| `events` | Replaced by `events.db` |
| `events_fts` | Replaced by FTS5 on `events.db` |
| `event_participants` | Replaced by `sender_id` + `to_recipients` on event row |
| `event_state` | Now in `events.db` |
| `event_tags` | Now in `events.db` |
| `tags` | Now in `events.db` |
| `threads` | Now in `events.db` |
| `attachments` | Now in `events.db` |
| `document_heads` | Now in `events.db` |
| `retrieval_log` | Now in `events.db` |

#### Tables now in memory.db (successor to legacy memory DB for facts/episodes)

| Table | Notes |
|---|---|
| `episodes` | Core memory infrastructure |
| `episode_events` | Links episodes to Nex events (cross-db reference) |
| `episode_definitions` | Episode chunking configuration |
| `facts`, `fact_entities`, `facts_fts` | V2 fact store |
| `observation_facts` | Observation-fact linkage |
| `mental_models` | High-level reports |
| `causal_links` | Causal relationships |
| `analysis_types` | Analysis configuration |
| `analysis_runs` | Analysis results |
| `facets` | Extracted values |
| `memory_processing_log` | Event processing tracking |
| `schema_version` | Schema version tracking |

#### Tables now in identity.db (entities relocated from legacy memory DB)

| Table | Notes |
|---|---|
| `entities` | V2 unified entity store |
| `entity_tags` | Entity classification |
| `entity_cooccurrences` | Co-occurrence stats |
| `merge_candidates` | Entity dedup |

> **Note:** The following V1 tables from the legacy memory DB have been eliminated entirely: `persons`, `contacts`, `contact_identifiers`, `person_contact_links`, `person_facts`, `entity_aliases`, `relationships`, `episode_entity_mentions`, `episode_relationship_mentions`, `entity_merge_events`. See MEMORY_SYSTEM.md for the V2 schema.

#### Tables eliminated (no migration)

| Table | Why |
|---|---|
| `sync_watermarks` | **Eliminated.** Adapters own their sync state. See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md) section 5. |
| `adapter_state` | **Eliminated.** Go adapter key-value store removed. |
| `bus_events` | **Eliminated.** Single Nex bus replaces the old Go bus. |
| `sync_jobs` | **Eliminated.** Go sync pipeline removed. |

#### Embeddings now in embeddings.db

Embeddings (`embeddings`, `vec_embeddings`) have been split into their own database. See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md) section 3.5.

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
3. The actual delivery goes through platform-specific send functions

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

The Nex schema currently uses `"inbound"` / `"outbound"`. The legacy schema used `"sent"` / `"received"` / `"observed"` / etc.

**Decision: Keep Nex's `"inbound"` / `"outbound"`, add `"observed"`.**

| Direction | Meaning |
|---|---|
| `inbound` | Message received by Nexus (user→Nexus, or external→Nexus) |
| `outbound` | Message sent by Nexus (Nexus→user, or Nexus on behalf of user) |
| `observed` | Event observed but not directed at or from Nexus (e.g., tool invocations, system events, imported AI tool calls) |

---

## AIX Import: No Changes Needed

The AIX adapters are already solid. They now write to `events.db` (migration from the legacy memory DB is complete):
1. Write to `events.db` directly
2. Columns mapped to the Nex schema (see column mapping above)
3. `sender_id` and `to_recipients` set inline on the event row (no junction table)

The two-adapter model is correct:
- **`AixAdapter`** — full fidelity (every message) — for the agents ledger and complete event record
- **`AixEventsAdapter`** — trimmed turns (memory-focused) — for episodic memory construction

---

## Implementation Order

1. **Add FTS5 to `events.db`** — Small, independent, immediately useful
2. **Add `"observed"` direction to Nex events schema** — Small schema change
3. **Add outbound event capture to `deliverOutboundPayloads`** — Close the outbound gap for non-pipeline paths
4. ~~**Migrate AIX adapters**~~ — **DONE.** Ported to TS, writes to `events.db`.
5. ~~**Migrate iMessage/Gmail adapters**~~ — **DONE.** Ported to TS.
6. ~~**Migrate NexusAdapter**~~ — **DONE.** Ported to TS.
7. **Migrate episode_events linking** — Reference Nex event IDs, cross-db (episodes now in memory.db)
8. ~~**Add sync watermarks to `events.db`**~~ — **Eliminated.** Adapters own their sync state.
9. ~~**Remove legacy events infrastructure**~~ -- **DONE.** Go adapter code eliminated.
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

-- Note: sync_watermarks eliminated — adapters own their sync state.
-- See DATABASE_ARCHITECTURE.md section 5.
```

### Modify `events.db` events table

Add `"observed"` as valid direction (no schema change needed — it's just a TEXT column, but document the convention).

### Removed from old legacy memory DB

All tables listed in "Tables Removed" above, plus their indexes and triggers. The legacy memory DB file is superseded by memory.db + identity.db + embeddings.db.

---

## Open Questions — Resolved

1. **`document_heads` and `retrieval_log`** — Moved to `events.db`. They track document-type events and belong with the event ledger.

2. **`bus_events`** — Old Go bus eliminated. The single Nex `InMemoryEventBus` (with optional write-through to `runtime.db`) is the only bus. See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md) section 3.6.

3. **Adapter sync for non-event data** — `sync_watermarks` eliminated entirely. Each adapter owns its sync state internally. See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md) section 5.

4. **`contacts` and `persons` tables** — V1 `persons`, `contacts`, `contact_identifiers` tables eliminated. Replaced by unified entity store in `identity.db` with `contacts` table using `(platform, space_id, sender_id)` as PK. See UNIFIED_ENTITY_STORE.md.

---

## Related Documents

- `../../_archive/MEMORY_SYSTEM.md` — Tripartite memory model
- `../../_archive/CORTEX_AGENT_INTERFACE.md` — Memory System tool/API surface
- `../../_archive/MEMORY_WRITER.md` — Memory writer role spec
- `../../_archive/MEMORY_READER.md` — Memory reader role spec
- `../../runtime/broker/MEESEEKS_PATTERN.md` — Meeseeks pattern
