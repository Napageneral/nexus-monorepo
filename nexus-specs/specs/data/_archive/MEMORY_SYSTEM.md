# Memory System

**Status:** DESIGN SPEC
**Last Updated:** 2026-02-13
**Related:** README.md, CORTEX_AGENT_INTERFACE.md, roles/MEMORY_READER.md, roles/MEMORY_WRITER.md, ../../runtime/broker/MEESEEKS_PATTERN.md

---

## Overview

Nexus uses a **tripartite memory model**: declarative, episodic, and procedural. Each type has a distinct storage layer, distinct purpose, and distinct access patterns. Together they replace OpenClaw's flat file-based memory system (`MEMORY.md`, `memory/*.md`, pre-compaction flush, session-memory hook).

Memory is read and written by dedicated meeseeks roles (see `../../runtime/broker/MEESEEKS_PATTERN.md`). Agents do not need to "remember to remember" — memory operations are automatic.

---

## The Three Memory Types

| Type | Storage | What It Captures | Query Pattern |
|------|---------|-----------------|---------------|
| **Declarative** | Cortex knowledge graph | Facts, preferences, attributes, identity, behavioral patterns | Entity search, relationship traversal, temporal queries |
| **Episodic** | Cortex episodes (derived from ledgers) | What happened, when, with whom | Episode search (FTS + embeddings), entity mention queries |
| **Procedural** | Filesystem (workspace documents) | How-to, workflows, instructions, derived reports/dossiers | Document search, file read |

```
┌──────────────────────────────────────────────────────────────────┐
│                          CORTEX DATABASE                          │
│                                                                   │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐   │
│  │   DECLARATIVE MEMORY    │  │      EPISODIC MEMORY        │   │
│  │                         │  │                              │   │
│  │   entities              │  │   episodes                   │   │
│  │   relationships         │  │   episode_events             │   │
│  │   entity_aliases        │  │   episode_entity_mentions    │   │
│  │   embeddings            │  │   episode_relationship_      │   │
│  │   merge_candidates      │  │     mentions                 │   │
│  │                         │  │   events (derived)           │   │
│  │   "What I know"         │  │   "What happened"            │   │
│  └─────────────────────────┘  └─────────────────────────────┘   │
│                                                                   │
│            ▲ provenance links ▲                                   │
│            └──────────────────┘                                   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                          FILESYSTEM                               │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              PROCEDURAL MEMORY                           │    │
│  │                                                          │    │
│  │   ~/nexus/state/workspace/                               │    │
│  │     DEPLOY.md, ARCHITECTURE.md, TOOLS.md, ...           │    │
│  │     dossiers/mom.md, dossiers/tyler.md                   │    │
│  │                                                          │    │
│  │   "What I know how to do" + "Derived reports"           │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Declarative Memory

### What It Is

Structured facts about entities and their relationships. The knowledge graph.

### Storage

Cortex SQLite database tables:
- `entities` — People, companies, projects, locations, events, documents, pets
- `relationships` — Directed edges between entities (or entity → literal). **Observation-log model: append-only, no dedup.**
- `entity_aliases` — Alternative names, emails, phone numbers, handles for identity resolution. Identity relationships (HAS_EMAIL, HAS_PHONE, etc.) are written here directly, not to the relationships table.
- `embeddings` — Vector representations for semantic search
- `merge_candidates` — Proposed entity merges awaiting human review

### Examples

| Knowledge | Representation |
|-----------|---------------|
| "Tyler works at Anthropic" | `Tyler --WORKS_AT--> Anthropic` (observation appended with created_at timestamp) |
| "Mom's birthday is May 15" | `Mom --BORN_ON--> "1968-05-15"` (target_literal) |
| "Tyler's favorite color changed" | Multiple observation rows: `PREFERS "purple"` (2026-01) + `PREFERS "blue"` (2026-02). Reader synthesizes current state. |
| "Mom usually texts at 9pm" | `Mom --TYPICALLY_CONTACTS_AT--> "21:00"` (source_type: inferred, confidence: 0.8) |
| "Tyler and Sarah know each other" | `Tyler --KNOWS--> Sarah` |

### Key Properties

- **Observation-log model:** Every relationship observation is appended. No deduplication, no contradiction detection at write time. The **reader** interprets relationship history at read time to synthesize current truth (see Read-Time Interpretation below).
- **Append-only relationships:** Shows how relationships grow, expand, and change over time. Each observation carries its own `fact`, `confidence`, `created_at` — rich provenance. Bi-temporal fields (`valid_at`, `invalid_at`) are available but not enforced for write-time contradiction resolution.
- **Free-form relationship types:** SCREAMING_SNAKE_CASE strings with no FK constraint. The writer agent can create new types.
- **Arbitrary entity types:** Currently 8 code-defined types, extensible by adding to `DefaultEntityTypes`.
- **Behavioral patterns live here:** Inferred patterns like communication frequency and preferred channels are stored as relationships with `source_type: 'inferred'` and confidence scores.
- **Identity resolution:** Entity aliases, merge candidates, embedding similarity, and context scoring handle the same person appearing across channels.
- **Identity relationships promoted:** HAS_EMAIL, HAS_PHONE, HAS_HANDLE, etc. go directly to `entity_aliases` table — no separate IdentityPromoter stage.

### Relationship Type Categories

| Category | Types | Storage |
|----------|-------|---------|
| **Identity** | HAS_EMAIL, HAS_PHONE, HAS_HANDLE, HAS_USERNAME, ALSO_KNOWN_AS | **`entity_aliases`** (not relationships table) |
| **Personal** | BORN_IN, LIVES_IN, HAS_PET | `relationships` |
| **Professional** | WORKS_AT, OWNS, FOUNDED, CUSTOMER_OF, USES, ATTENDED | `relationships` |
| **Social** | KNOWS, FRIEND_OF, SPOUSE_OF, PARENT_OF, CHILD_OF, SIBLING_OF, DATING | `relationships` |
| **Projects** | CREATED, BUILDING, WORKING_ON, CONTRIBUTED_TO | `relationships` |
| **Temporal** | BORN_ON, ANNIVERSARY_ON, OCCURRED_ON, SCHEDULED_FOR, STARTED_ON, ENDED_ON | `relationships` |
| **Preferences** | PREFERS, DISLIKES, INTERESTED_IN | `relationships` |
| **Behavioral** | TYPICALLY_CONTACTS_AT, PREFERS_CHANNEL, COMMUNICATION_FREQUENCY | `relationships` |
| **Financial** | HAS_ACCOUNT_NUMBER, HAS_ROUTING_NUMBER, HAS_COMPENSATION | `relationships` |

These are soft categories. The writer agent can create new relationship types at will.

### Read-Time Interpretation

The reader synthesizes current truth from the observation log at query time. This replaces the old pipeline stages for contradiction detection and edge resolution:

```
Observation log for Tyler WORKS_AT:
  2026-01-15: "Tyler works at Anthropic" (confidence: 1.0)
  2026-02-01: "Tyler is building Nexus at Anthropic" (confidence: 1.0)
  2026-02-10: "Tyler used to work at Google" (confidence: 0.8)

Reader synthesis: Tyler currently works at Anthropic (building Nexus).
Previously worked at Google.
```

The reader's intelligence is better at interpreting relationship history than rigid invalidation rules. A relationship doesn't become "false" — it becomes part of a richer understanding.

---

## Episodic Memory

### What It Is

Temporal narrative chunks — what happened, when, with whom. Episodes group related events into meaningful units of experience.

### Storage

Cortex SQLite database tables:
- `episodes` — Temporal chunks with start/end times, channel, summary
- `episode_events` — Links episodes to events in the Events Ledger
- `episode_entity_mentions` — Which entities appear in each episode (provenance)
- `episode_relationship_mentions` — Which relationships were mentioned in each episode (provenance)
- `events` (Events Ledger) — Raw events (iMessages, emails, etc.) + derived events (decisions, action items)

### Examples

| Knowledge | Representation |
|-----------|---------------|
| "Tuesday's standup discussed the auth refactor" | Episode with linked events, entity mentions for attendees and project |
| "Mom texted about dinner plans" | Episode derived from iMessage events, entity mentions for Mom |
| "We decided to use PostgreSQL" | Episode + derived `decision` event in the Events Ledger |
| "The migration failed, we tried X, Y worked" | Episode with multiple linked events spanning the incident |

### Key Properties

- **Derived from ledgers:** Episodes are built from the Events Ledger (raw communications) and the Agents Ledger (agent sessions/turns). Cortex groups events into meaningful episodes.
- **Derived events:** Not all events are raw communications. Agent sessions produce implicit events (decisions, action items, commitments) that the episodic writer makes explicit and writes to the Events Ledger.
- **Provenance links:** Episode mentions connect episodes to the declarative graph. "This episode is where we learned Tyler works at Anthropic" — the episode_relationship_mention links the episode to the WORKS_AT relationship.
- **Searchable:** Episodes are searchable via FTS5 (text content) and embeddings (semantic similarity).

### Derived Event Types

| Type | Example |
|------|---------|
| `decision` | "We decided to use PostgreSQL" |
| `action_item` | "I'll send the report by Friday" |
| `commitment` | "Let's meet at 3pm tomorrow" |
| `preference_stated` | "I prefer dark mode" |
| `correction` | "Actually, it's not X, it's Y" |

These derived events live in the Events Ledger alongside raw communication events and are linked to their source episode.

---

## Procedural Memory

### What It Is

How-to knowledge, workflows, instructions, and **derived documents** synthesized from the other two memory types.

### Storage

Filesystem — workspace documents:
- `~/nexus/state/workspace/` — Main agent workspace (shared with user)
- `nexus/state/workspaces/{role-name}/` — Role-specific workspaces

### Examples

| Knowledge | Representation |
|-----------|---------------|
| "How to deploy the app" | `~/nexus/state/workspace/DEPLOY.md` |
| "Git workflow for PRs" | `~/nexus/state/workspace/GIT_WORKFLOW.md` |
| "Project architecture overview" | `~/nexus/state/workspace/ARCHITECTURE.md` |
| "Career history report on Tyler" | `~/nexus/state/workspace/dossiers/tyler.md` (derived document) |
| "Mom dossier" | `~/nexus/state/workspace/dossiers/mom.md` (derived document) |

### Key Properties

- **Narrative form:** Documents are human-readable, step-by-step, full prose. Unlike graph query results, they can be read as complete documents.
- **Includes derived documents:** Some procedural documents are synthesized from the declarative graph and episodic store. A "dossier on Mom" is produced by querying the graph for Mom's relationships, querying episodes where Mom appears, and weaving a narrative. The resulting document is a snapshot — the graph is authoritative, but the authored document may contain editorial choices and narrative structure that a raw query wouldn't produce.
- **Regenerable:** Derived documents can be regenerated at any time by re-querying the source data. But the existing version is also valuable as-is.
- **Stable:** Procedural knowledge (workflows, instructions) changes rarely. Derived documents are snapshots that go stale as the graph evolves.

### Derived Documents

Derived documents are a key concept. They bridge the gap between structured graph data and readable prose:

1. Agent (or user) requests a synthesis: "Give me everything we know about Mom"
2. Agent queries declarative memory: all entities/relationships for Mom
3. Agent queries episodic memory: recent episodes mentioning Mom
4. Agent weaves a narrative across the results
5. Agent writes to filesystem: `~/nexus/state/workspace/dossiers/mom.md`

The document is now a procedural reference. Other agents can read it as a full document. But the knowledge graph remains the source of truth — if Mom's phone number changes, the graph is updated, and the dossier becomes stale until regenerated.

---

## How They Intersect

A single event touches multiple memory types. Example: "We decided to use PostgreSQL instead of MySQL."

| Memory Type | What Gets Stored |
|-------------|-----------------|
| **Episodic** | The conversation episode where the decision was made — who participated, what was discussed, when |
| **Declarative** | `Project --USES--> PostgreSQL` appended as new observation. Previous `Project --USES--> MySQL` observation remains — the reader synthesizes "Project switched from MySQL to PostgreSQL" at read time. |
| **Procedural** | If the decision has implementation implications — "how to set up Postgres locally, migration steps" → workspace document |

Three views of the same event. No overlap, no gaps. Each type serves a different query pattern.

---

## Classification Guide

| Knowledge | Type | Reasoning |
|-----------|------|-----------|
| "Tyler works at Anthropic" | **Declarative** | Entity relationship |
| "How to deploy the app" | **Procedural** | Workflow document |
| "Tuesday's standup discussed the auth refactor" | **Episodic** | What happened, when |
| "Mom usually texts around 9pm" | **Declarative** | Inferred behavioral pattern (relationship with source_type: inferred) |
| "The migration failed, we tried X, Y worked" | **Episodic + Procedural** | Episode captures narrative; reusable fix becomes procedural doc |
| "Career history report on Tyler" | **Procedural** (derived) | Synthesized from declarative + episodic, written as document |
| "We decided to use PostgreSQL" | **All three** | Episode (conversation), declarative (relationships), procedural (setup docs) |
| "Luna needs medication at 8am" | **Declarative** | Entity (Pet) + relationship (HAS_SCHEDULE) + temporal literal |
| "Sarah mentioned she's moving to NYC" | **Episodic + Declarative** | Episode (conversation), declarative (Sarah --MOVING_TO--> NYC) |

---

## What Replaces OpenClaw

| OpenClaw Component | Nexus Replacement |
|-------------------|-------------------|
| `MEMORY.md` file | Declarative memory (Cortex knowledge graph) |
| `memory/*.md` daily files | Episodic memory (Cortex episodes) + declarative extraction |
| Pre-compaction memory flush | Memory writer meeseeks (configurable frequency, default: every turn) |
| Session-memory hook (on /new) | Memory writer meeseeks (continuous, not just on session boundaries) |
| `memory_search` tool | Memory reader meeseeks (automatic, not agent-initiated) |
| `memory_get` tool | Skills + direct SQLite (SCHEMA.md, QUERIES.md, cortex-search.sh) |
| System prompt "search memory before answering" | Memory reader injects context automatically — no instruction needed |

## What Replaces the Go Pipeline

The 7-stage Go memory pipeline is replaced by the memory writer meeseeks — a single intelligent agent pass:

| Old Pipeline Stage | New Behavior |
|--------------------|-------------|
| 1. EntityExtractor (Gemini LLM) | Writer agent extracts entities in single pass, using full conversation context |
| 2. EntityResolver (alias + embedding) | Writer agent resolves via `cortex-search.sh` + raw SQL. Makes judgment calls. |
| 3. RelationshipExtractor (Gemini LLM) | Writer agent extracts in same pass. 1:1 relationships as primitive. |
| 4. IdentityPromoter | **Collapsed** — Writer writes aliases directly to `entity_aliases`. |
| 5. EdgeResolver (dedup) | **Removed** — Observation-log model. Every observation appended. |
| 6. ContradictionDetector | **Removed** — Reader interprets relationship history at read time. |
| 7. EntityEmbedder | **Background** — Triggered automatically on write via skill scripts. |

The old pipeline: 7 rigid stages, two Gemini LLM calls, strict dedup/contradiction rules.
The new model: one intelligent agent pass that reads deeply, makes judgment calls, and accumulates skill over time via self-improvement.

---

## Identity Coalescing

### Identity Relationships

Identity relationships (HAS_EMAIL, HAS_PHONE, HAS_HANDLE, etc.) are written directly to `entity_aliases` by the writer agent — no separate IdentityPromoter stage. The writer makes this determination in a single pass during extraction.

### Merge Flow

When the writer agent encounters ambiguous entity matches during extraction:
1. Creates a **new entity** (prefer duplicates over false merges)
2. Creates a **merge candidate** record with confidence and evidence
3. Merge candidates are proposed to the user for review

### Security

Merge candidates are **always proposed to the user** for confirmation:
- **Impersonation risk:** Attacker-crafted messages could trigger false merges
- **Data corruption:** False merges are harder to undo than duplicates
- **Philosophy:** "Prefer duplicates over false merges"

### Auto-Eligible Merges

Extremely high-confidence merges (exact email/phone match, >0.99) are flagged `auto_eligible = TRUE` and can be auto-applied.

---

## Cross-Session Synthesis

Different agent sessions discuss the same entities. The Cortex database IS the cross-session synthesis layer:

1. Every session's memory writer extracts to the same Cortex graph
2. Every session's memory reader queries the same Cortex graph
3. Entity resolution ensures the same person across channels maps to the same entity
4. No special cross-session logic needed — the unified graph handles it

---

## Cold Start

For new installations, bootstrap memory via:
1. **AIX Session Import** — Import conversation history from Claude, ChatGPT, Cursor, etc. (see AIX adapter architecture below)
2. **Replay through memory writer** — The writer meeseeks processes imported sessions to extract entities/relationships/episodes
3. **Incremental** — System works without it; memory gets richer over time

No concern about graph size. SQLite handles millions of rows. More data is better.

---

## Turn Labeling

Turn labeling generates metadata for each agent turn (labels, summaries, topic tags, mentioned entity IDs). It is a **stateless** operation — a simple LLM call, not a full meeseeks pattern.

### Schema

```sql
ALTER TABLE agent_turns ADD COLUMN label TEXT;      -- Short label
ALTER TABLE agent_turns ADD COLUMN summary TEXT;    -- 1-3 sentence summary
ALTER TABLE agent_turns ADD COLUMN topics TEXT;     -- JSON array of topic strings
ALTER TABLE agent_turns ADD COLUMN entity_ids TEXT; -- JSON array of entity UUIDs
```

### Purpose

- **Smart routing:** Route incoming messages to sessions whose understanding of mentioned entities is current
- **Session invalidation:** Detect when a session's entity knowledge is stale
- **Search:** Find turns by topic or entity mention

### Invocation

Runs inline at turn end (not background). Fast and lightweight — single LLM call with the turn content.

---

## Tooling Model: Skills + Direct SQLite

Both memory meeseeks operate in **code mode** with direct SQLite access. Instead of structured tool_use tools, they get **skills** — workspace files containing schemas, query patterns, and helper scripts.

```
~/.nexus/state/meeseeks/memory-{reader,writer}/
  skills/
    cortex/
      SCHEMA.md           # Full Cortex DB schema
      QUERIES.md          # Common query patterns with examples
      cortex-search.sh    # Semantic + FTS5 hybrid search (the one operation needing more than SQL)
      cortex-write.sh     # Write helper: INSERT + side effects (embedding trigger, alias normalization)
      DB_PATH             # Path to cortex.db
```

**Why skills instead of structured tools?** Skills evolve independently (update a file, not runtime code). Skills have no ceiling (agent starts there and grows). Skills can include scripts. The agent learns and improves its own skills over time via self-improvement.

For full tooling details, see `CORTEX_AGENT_INTERFACE.md`.

---

## Configuration

```yaml
# nexus.yaml
agents:
  defaults:
    memory:
      read:
        enabled: true
      write:
        enabled: true
        frequency: "every_turn"
      labeling:
        enabled: true
```

For detailed meeseeks configuration, see `../../runtime/broker/MEESEEKS_PATTERN.md`.

---

## Related Documents

- `README.md` — Cortex overview
- `CORTEX_AGENT_INTERFACE.md` — API surface agents use to query/write memory
- `roles/MEMORY_READER.md` — Memory reader meeseeks role spec
- `roles/MEMORY_WRITER.md` — Memory writer meeseeks role spec
- `../../runtime/broker/MEESEEKS_PATTERN.md` — General meeseeks pattern
- `CORTEX_NEX_MIGRATION.md` — Integration plan
