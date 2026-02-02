# System of Record

**Status:** DESIGN COMPLETE  
**Last Updated:** 2026-02-02

---

## Overview

The **System of Record** is Nexus's primary data layer — the source of truth for everything that happens. It consists of four stores in `~/nexus/state/nexus.db` (SQLite):

| Store | Purpose | Mutability |
|-------|---------|------------|
| **Events Ledger** | What happened (all inbound/outbound events) | Append-only |
| **Agents Ledger** | AI conversations (sessions, turns, messages) | Append-only |
| **Identity Graph** | Who is involved (entities, identities, relationships) | Mutable primary data |
| **Nexus Ledger** | Pipeline traces (NexusRequest lifecycle) | Append + prune |

**Key insight:** The System of Record stores *facts*. Cortex stores *understanding*.

---

## Events Ledger

The permanent record of all events flowing through Nexus.

**Schema:** See `EVENTS_LEDGER.md`

**Contents:**
- Inbound messages (iMessage, email, Discord, etc.)
- Outbound responses from agents
- System events (timer ticks, webhooks, etc.)
- All normalized to `NormalizedEvent` format

**Properties:**
- Append-only (events are never deleted or modified)
- Deterministic IDs: `{source}:{source_id}`
- Enables replay, audit, and time-travel debugging

---

## Agents Ledger

The permanent record of all agent conversations and actions.

**Schema:** See `AGENTS_LEDGER.md`

**Contents:**
- Sessions (conversation containers)
- Turns (user message + agent response pairs)
- Messages (individual messages within turns)
- Tool calls (what agents executed)

**Properties:**
- Append-only (history is never rewritten)
- Tree structure (turns can branch via forking)
- Broker writes directly (no sync loops)

---

## Identity Graph

Three-layer system for managing **who** we interact with.

**Schema:** See `IDENTITY_GRAPH.md`

**The Three Layers:**

| Layer | What It Is | Mutability |
|-------|------------|------------|
| **Contacts** | All unique (channel, identifier) pairs we've seen | Derived from events |
| **Entities** | People, personas, organizations we know about | User-defined, mutable |
| **Identity Mappings** | Links contacts → entities | Fuzzy (confirmed/inferred/pending) |

**Key insight:** Contacts are hard facts derived from events. Entities are user-defined. The *mapping* between them is the fuzzy part.

**Properties:**
- Contacts are aggregated from Events Ledger (first_seen, last_seen, message_count)
- Entities can exist without linked contacts (e.g., a persona not yet used)
- Identity mappings have confidence levels (confirmed > inferred > pending > unknown)
- Cortex can suggest mappings; user confirms

---

## Design Principles

### 1. Append-Only for History

Events and agent turns are never deleted. This enables:
- Complete audit trail
- Replay for debugging
- Context retrieval without data loss

### 2. Single Database

All three stores live in one SQLite file (`nexus.db`):
- Simpler transactions
- Single backup/restore
- Easy to move between machines

### 3. Cortex Reads, Rarely Writes

Cortex derives from the System of Record but rarely writes back:
- Cortex reads events to build episodes
- Cortex reads turns to extract facets
- Cortex *may* suggest identity enrichments (low-confidence → human review)

### 4. Foreign Keys to Universal IDs

All stores reference each other via deterministic IDs:
- Events reference entities via `from`/`to` participant refs
- Turns reference events via `source_event_id`
- Everything links back to the source of truth

---

## Nexus Ledger

The observability layer — traces every NexusRequest through the pipeline.

**Schema:** See `NEXUS_LEDGER.md`

**Contents:**
- Request ID and source event
- Stage progression and timing
- Principal, permissions, session routing
- Hooks matched and fired
- Agent execution details
- Delivery results
- Error tracking

**Properties:**
- Upsert pattern (same row updated through lifecycle)
- Full snapshot stored only at finalize
- Can be pruned (unlike Events/Agents ledgers)

---

## Related Documents

- `EVENTS_LEDGER.md` — Events schema and examples
- `AGENTS_LEDGER.md` — Sessions, turns, messages schema
- `IDENTITY_GRAPH.md` — Entities and identity mapping
- `NEXUS_LEDGER.md` — Pipeline trace schema
- `../cortex/` — Derived layer (episodes, facets, embeddings)
- `../nex/INTERFACES.md` — Interface contracts between components
