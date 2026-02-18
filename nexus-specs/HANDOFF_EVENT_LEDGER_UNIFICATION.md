# Handoff: Event Ledger Unification

## TL;DR

There are two event tables that should be one. Delete the Cortex one, keep the Nex one, migrate all adapters. This is infrastructure cleanup that unblocks the memory system.

## Read This First

**Primary spec:** `specs/data/cortex/EVENT_LEDGER_UNIFICATION.md` — has the full design, column mappings, table inventories, and implementation order.

**Key code files to understand before starting:**

| File | What it is | Read priority |
|---|---|---|
| `nex/src/db/events.ts` | **The keeper.** Nex events ledger schema + insert/query functions. This is the one true events table. | 1 |
| `nex/src/nex/stages/receiveEvent.ts` | Stage 1 — writes inbound events to events.db | 2 |
| `nex/src/nex/stages/finalize.ts` | Stage 8 — writes outbound events to events.db | 2 |
| `nex/cortex/internal/db/schema.sql` | **The one being removed.** Cortex DB schema. The `events` table and everything in the "EVENTS LEDGER" section is being deleted. Everything in "CORE LEDGER", "ENTITIES", "RELATIONSHIPS", "AGENTS LEDGER" sections stays. | 3 |
| `nex/cortex/internal/adapters/aix.go` | AIX full-fidelity adapter — needs migration to write to events.db | 4 |
| `nex/cortex/internal/adapters/aix_events.go` | AIX trimmed-turns adapter — needs migration | 4 |
| `nex/cortex/internal/adapters/nexus.go` | Nexus event log adapter — needs migration | 4 |
| `nex/cortex/internal/adapters/eve.go` | iMessage adapter — needs migration | 4 |
| `nex/cortex/internal/adapters/gmail.go` | Gmail adapter — needs migration (if exists) | 4 |
| `nex/src/infra/outbound/deliver.ts` | Outbound delivery — needs outbound event capture added | 5 |
| `nex/src/infra/outbound/outbound-send-service.ts` | Agent-initiated sends — needs outbound event capture added | 5 |

## What You're Doing (in order)

### Step 1: Add FTS5 to events.db

Add full-text search to the Nex events table. This is independent and immediately useful.

**File to modify:** `nex/src/db/events.ts`

Add to `EVENTS_SCHEMA_SQL`:
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
    event_id UNINDEXED,
    content,
    tokenize='porter unicode61'
);

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
```

Also add a `sync_watermarks` table for adapter sync tracking:
```sql
CREATE TABLE IF NOT EXISTS sync_watermarks (
    adapter TEXT PRIMARY KEY,
    last_sync_at INTEGER NOT NULL,
    last_event_id TEXT
);
```

### Step 2: Close outbound event capture gaps

The pipeline already captures inbound (Stage 1) and outbound (Stage 8 finalize) events. But agent-initiated sends and other outbound paths don't write to events.db.

**Add `insertEvent` calls for outbound events at these locations:**

1. **`nex/src/infra/outbound/outbound-send-service.ts`** — `executeSendAction` function. After a successful send, insert an outbound event. This covers agent message tool sends.

2. **`nex/src/infra/outbound/deliver.ts`** — `deliverOutboundPayloads` function. After successful delivery, insert an outbound event. This covers routeReply and other delivery paths.

**Be careful not to double-write** — the pipeline path already writes via `finalize.ts`. Either:
- Check for existing event by `source + source_id` before inserting (the UNIQUE constraint + ON CONFLICT DO NOTHING handles this)
- Or use different source IDs for pipeline vs non-pipeline paths

The outbound event should capture: content, channel, recipient, timestamp, and any available context (session_key, agent_id, request_id).

### Step 3: Migrate Go adapters to write to events.db

Each Go adapter in `nex/cortex/internal/adapters/` currently opens `cortex.db` and writes to the Cortex events table. They need to open `events.db` and write with the Nex schema instead.

**Column mapping (Cortex → Nex):**

| Cortex column | Nex column | How to map |
|---|---|---|
| `id` | `id` | Same |
| `timestamp` | `timestamp` | Same |
| `channel` | `from_channel` | Same value |
| `content_types` | `content_type` | Take first from JSON array, usually `"text"` |
| `content` | `content` | Same |
| `direction` | `direction` | `"sent"` → `"outbound"`, `"received"` → `"inbound"`, `"observed"` → `"observed"` |
| `thread_id` | `thread_id` | Same |
| `reply_to` | → put in `metadata` | `{"reply_to": value}` |
| `source_adapter` | `source` | Same |
| `source_id` | `source_id` | Same |
| `metadata_json` | `metadata` | Same |
| *(junction table)* | `from_identifier` | **New.** Set to sender identifier: email address, phone number, AI model name, etc. The adapters already resolve this for `event_participants` — just inline it. |
| *(junction table)* | `to_recipients` | **New.** JSON: `[{"channel": "imessage", "identifier": "+1234567890"}]`. Same data currently written to `event_participants`. |
| *(none)* | `received_at` | Set to `timestamp` for historical imports, current time for live sync |
| *(none)* | `type` | `"message"` for most. `"tool_invocation"` for tool events in AixAdapter. |

**events.db location:** `~/nexus/state/data/events.db` — resolve via `resolveStateDir()` + `/data/events.db`. The Go adapters need the path. You can either:
- Pass it as a parameter alongside the cortex DB path
- Resolve it from the same state dir conventions

**Each adapter needs:**
1. Open `events.db` (in addition to cortex.db — they still write contacts/persons/facets to cortex.db)
2. Replace INSERT statements targeting cortex events table with INSERTs targeting events.db events table
3. Remove `event_participants` INSERT statements — replace with inline `from_identifier` and `to_recipients` columns
4. Update sync watermarks to write to `events.db` sync_watermarks table (for event sync) instead of cortex.db

**Order:** Start with `AixEventsAdapter` (simplest — 2 events per turn, no tool events), then `AixAdapter`, then `eve.go`, then others.

### Step 4: Update episode_events linking

`episode_events` in `cortex.db` links episodes to events. After migration, event IDs reference `events.db` instead of the cortex events table.

**File:** `nex/cortex/internal/chunk/chunk.go` (and related episode creation code)

Changes:
1. Drop the FK constraint on `episode_events.event_id` — it can't reference across databases
2. When the chunking code needs to read events, ATTACH `events.db` to the cortex connection: `ATTACH DATABASE 'path/to/events.db' AS events_ledger`
3. Update queries that join events to use the attached database

### Step 5: Remove Cortex events infrastructure

Once all adapters write to events.db and episodes reference the new IDs:

**From `schema.sql`, remove these table definitions and their indexes/triggers:**
- `events`
- `events_fts` (virtual table + triggers)
- `event_participants`
- `event_state`
- `event_tags`
- `tags`
- `threads`
- `attachments`
- `document_heads`
- `retrieval_log`

**From Go code, remove:**
- Any code that creates/queries the old events table
- The `event_participants` INSERT logic in adapters (replaced by inline columns)
- Any thread sync logic (threads are now just `thread_id` strings on events)

**Keep in `cortex.db`:** Everything in CORE LEDGER, ENTITIES, RELATIONSHIPS, AGENTS LEDGER sections. See the full spec for the complete table inventory.

## Key Design Decisions (don't second-guess these)

1. **One events ledger** — `events.db` is the single source of truth. No Cortex events table.
2. **Inline participants** — `from_identifier` + `to_recipients` on the event row. No junction table.
3. **Direction values** — `"inbound"`, `"outbound"`, `"observed"`. Not sent/received.
4. **Cross-database episode linking** — `episode_events` stays in cortex.db, references events.db IDs by convention (no FK).
5. **FTS5 on events.db** — Porter stemming, auto-synced via triggers.
6. **Nex captures its own outbound** — Nex infrastructure writes outbound events. Not the memory writer's job.

## What NOT to Touch

- The agents ledger (`agent_sessions`, `agent_messages`, `agent_turns`, `agent_tool_calls`) — these are separate and stay as-is
- The knowledge graph tables (`entities`, `relationships`, `entity_aliases`, etc.) — unrelated
- The memory pipeline Go code — it's being replaced by the meeseeks system (separate workstream)
- The `persons`, `contacts`, `person_facts` tables — these stay, just remove their FK references to the old events table

## Testing

1. After FTS5 addition: verify `INSERT INTO events` auto-populates `events_fts`, verify `SELECT * FROM events_fts WHERE content MATCH 'search term'` works
2. After each adapter migration: run `mnemonic sync --adapter <name>` and verify events appear in events.db with correct schema
3. After outbound capture: send a message via agent tool, verify outbound event appears in events.db
4. After episode linking: verify episodes can be created that reference events.db event IDs
5. After cortex events removal: verify cortex.db no longer has the old events table, verify all Cortex operations still work
