# Memory System — Canonical Architecture

**Status:** CANONICAL SPEC
**Last Updated:** 2026-03-02
**Related:** MEMORY_STORAGE_MODEL.md, UNIFIED_ENTITY_STORE.md, MEMORY_WRITER.md, MEMORY_CONSOLIDATION.md, RETAIN_PIPELINE.md, MEMORY_RECALL.md, skills/MEMORY_INJECTION.md, skills/MEMORY_SEARCH_SKILL.md, skills/MEMORY_REFLECT_SKILL.md

---

## Overview

The Nexus memory system transforms raw events into progressively higher levels of understanding through a 4-layer architecture. Dedicated meeseeks agents handle extraction and consolidation automatically — agents do not need to "remember to remember."

Memory tools are exposed as `nexus memory <subcommand>` CLI commands and are always available to all agents. Each CLI command sends an IPC request to the NEX daemon, which executes the core function and returns JSON to stdout. The meeseeks that perform memory work (writer, consolidator, injection) are distinguished by their **role prompts and workflow instructions**, not by having special tools injected. This preserves prompt cache stability across all agent sessions.

**Storage model:** All derived knowledge (facts, observations, mental models) is stored in a unified **elements** table, processed by **jobs** operating on **sets** of inputs. This is a recursively composable model — elements form sets, jobs process sets into new elements. See `MEMORY_STORAGE_MODEL.md` for the complete storage schema, design decisions, and example flows.

---

## The Four Layers

```
Layer 3:  MENTAL MODELS     High-level reports, refreshable, pinned or auto-generated
              |
Layer 2:  OBSERVATIONS       Synthesized durable knowledge, version-chained
              |
Layer 1:  FACTS              Atomic extracted knowledge, immutable once written
              |
Layer 0:  EVENTS             Raw immutable messages from all platforms
```

### Layer 0: Events

Raw immutable messages from all platforms (iMessage, Discord, Gmail, agent turns). Every message that flows through Nexus becomes an event in `events.db`. Events are never modified. This is the ground truth that everything else is built from.

Very recent events that haven't been processed by the retain pipeline are searchable as **short-term memory** — they show up as `type: 'event'` results in recall. These are events in episodes that haven't closed yet (neither the silence window nor the token budget has been reached).

### Layer 1: Facts

Atomic pieces of knowledge expressed as natural language sentences. Each fact is immutable once written.

Examples of good facts:
- "Tyler works at Anthropic building Nexus"
- "Sarah prefers window seats on flights"
- "Emily married Jake in a garden ceremony in June 2025"

Facts have **two stored timestamps** plus one derived temporal dimension:

| Timestamp | Stored? | What it represents | Example |
|---|---|---|---|
| `as_of` | ✅ Stored on fact | When the thing actually happened | ~2016 (Bob got married) |
| `ingested_at` | ✅ Stored on fact | When the system processed it | 2026-02-27 (backfill ran today) |
| Event timestamp | ❌ Derived via link | When the source event was created | ~2021 (the iMessage was sent) |

**When each matters for recall:**
- **`as_of`** — for "when did things happen" queries. "When did Bob get married?" → use `as_of`.
- **Event timestamp** — for "what was discussed when" queries. Derived via `source_event_id` → `events.timestamp`. "What did Tyler and Casey talk about last January?" → filter by event timestamp.
- **`ingested_at`** — for operational queries. "What did the last backfill produce?" → use `ingested_at`.

> **Design Decision: Why `event_date` is NOT stored on the fact.**
>
> We considered adding an `event_date` column to the facts table to denormalize the source event's timestamp. We chose not to because:
> 1. Every fact already has `source_event_id` linking to the source event, which has a `timestamp` field.
> 2. The temporal dimension is always derivable via this link — no information loss.
> 3. Adding a denormalized copy creates sync risk and schema bloat for marginal benefit.
> 4. The cross-DB join (memory.db → events.db) is already performed in the writer tools and recall system.
> 5. Since we operate hard-cutover with no migration burden, we can add it later if performance demands it.

Each fact links to one or more entities via the `element_entities` junction table. Facts are attributable to their source job (which knows its input set/episode) and optionally `source_event_id` (when the fact maps to a single event).

Facts are stored as `elements WHERE type = 'fact'` in `memory.db`. See `MEMORY_STORAGE_MODEL.md` for the unified schema.

### Layer 2: Observations

Synthesized durable knowledge created by the consolidation pipeline. An observation takes multiple facts and distills them into higher-level understanding — patterns, summaries, and consolidated knowledge.

Observations are **version-chained**: when an observation is updated, a new version is created with `parent_id` pointing to the previous version. This forms a revision history. The latest version in a chain is the **head**.

**Staleness** is determined by the revision chain: if an observation has a successor (more recent revision where `parent_id` = this observation's id), the original is stale. Agents can follow the chain to the current head immediately, which is more useful than a boolean flag — it tells you both that something changed AND what it changed to. The HEAD of a chain is the observation with no successor.

> **Design Decision: Why no `is_stale` boolean flag.**
>
> We considered adding an `is_stale` boolean to observations and mental models for O(1) staleness checks. We chose revision chains instead because:
> 1. `parent_id` already exists and is used for version chaining — `is_stale` would be redundant denormalization.
> 2. A boolean tells you "something is stale" but not what replaced it. The chain gives you the full story.
> 3. Proactive staling (marking models stale when related facts change) conflates "explicitly superseded" with "might be outdated" — two different signals using one flag.
> 4. HEAD detection is a simple LEFT JOIN: `WHERE successor.id IS NULL`. With an index on `parent_id`, this is fast.
> 5. Removing the flag eliminates the `staleMentalModelsForFacts()` side-effect that proactively marked mental models when facts changed, which nothing consumed anyway.

Each observation tracks which facts support it via the input set's membership — the facts that went into consolidation are members of the set that the consolidation job processed. Observations are stored as `elements WHERE type = 'observation'` in `memory.db`.

### Layer 3: Mental Models

High-level reports that span many observations and facts, synthesizing them into coherent documents about specific topics.

Examples:
- "Tyler's Career" — work history, current role, career interests
- "Project Nexus Status" — what it is, current state, key decisions
- "Family Relationships" — who's who, dynamics, important facts

Mental models have one attribute beyond their content: **`pinned`** (boolean).
- `pinned = false` — agent-created, can be auto-refreshed by the reflect skill
- `pinned = true` — user-created or user-curated, displayed specially in UI, not auto-overwritten

Mental models are created and maintained by agents using the **Reflect skill** (see `skills/MEMORY_REFLECT_SKILL.md`). They are NOT created by the writer or consolidator.

Mental models are stored as `elements WHERE type = 'mental_model'` in `memory.db`.

---

## Entity Dependency (Identity Layer)

The memory system depends on the **identity layer** (`identity.db`) for entity and contact resolution. The memory system links elements to entities and trusts the identity layer to have done its resolution work.

**Entities** represent the WHO and WHAT that knowledge is about: people, organizations, projects, locations, concepts. Entities are **identities, not identifiers** — a phone number is not an entity, it's a contact binding to a person entity.

**Contacts** bind platform identifiers (phone numbers, email addresses, Discord handles) to entities. Each contact has a `contact_id` (platform-specific identifier), a `contact_name` (display name from the platform), and an `origin` indicating which adapter created it. A single person entity can have multiple contact bindings across platforms.

**Entity resolution** uses a union-find merge chain. When two entities are discovered to be the same person/thing, one gets `merged_into` pointing at the other. All queries follow the merge chain to the canonical entity.

**Identifier policy:** All identifiers are stored WITHOUT platform prefix. The `(platform, space_id, contact_id)` compound unique key in the contacts table prevents collisions. Universal identifiers (phone, email) use `phone` or `email` as the platform value — NOT the specific service (iMessage, Gmail, WhatsApp). This ensures the same phone number across iMessage and WhatsApp resolves to one contact/entity. Platform-local identifiers (Discord IDs, Slack IDs) use their platform name (`discord`, `slack`) and the raw identifier. The `space_id` dimension handles workspace-scoped platforms like Slack where user IDs are only unique within a workspace.

The identifier policy is owned by the identity layer, not the memory system. See `UNIFIED_ENTITY_STORE.md` for full details.

**Adapter contact seeding** is a prerequisite for quality memory extraction. When an adapter is connected and begins its backfill, it seeds contacts into the identity store. This happens as part of adapter setup, before any memory processing starts. The memory system depends on contacts already existing when it runs. See `UNIFIED_ENTITY_STORE.md` § Adapter Contact Seeding for the required contract.

---

## The Lifecycle

### Ingest: Events Arrive

Messages flow in from platforms via adapters. Each message becomes an event in `events.db`. Events are slotted into active episodes (sets with `definition_id = 'retain'`) in real-time as they arrive.

Episode boundaries are detected via a hybrid mechanism: **inline token-budget checking** during `event.ingest` + **per-episode cron timers** for 90-minute silence detection. When a timer fires, it invokes the episode timeout handler directly as an internal runtime event — this does NOT go through the full pipeline (no principals to resolve, no access to check). Whichever threshold fires first (token budget or silence timer) clips the episode, and `episode-created` fires. The memory-writer automation subscribes to this hookpoint.

See `RETAIN_PIPELINE.md` § Episode Grouping.

### Retain: Events → Facts

The **Memory Writer** meeseeks is dispatched when the `episode-created` hookpoint fires. It extracts facts and entities from the episode's content — reading the conversation, identifying durable knowledge, resolving entities against the existing store, and writing facts with entity links.

See `RETAIN_PIPELINE.md` for the full pipeline spec. See `MEMORY_WRITER.md` for the writer meeseeks spec.

### Consolidate: Facts → Observations

The **Memory Consolidator** meeseeks is dispatched when the `episode-retained` hookpoint fires (after the writer completes successfully). It receives the episode's facts and connects them into the broader memory graph — creating or updating observations, detecting causal relationships, and proposing entity merges.

See `MEMORY_CONSOLIDATION.md` for the full spec.

### Recall: Search Across All Layers

A unified search interface with multiple retrieval strategies (semantic, keyword, entity traversal, causal traversal, temporal, short-term events, thread lookback) running in parallel and fused via Reciprocal Rank Fusion.

See `MEMORY_RECALL.md` for the full spec.

### Inject: Automatic Context for Agents

A lightweight **Memory Injection** automation hookpoint handler fires at `worker:pre_execution` on every agent execution. It's forked from the primary session, uses memory search to find relevant context the main session doesn't have, and either interrupts with discovered information or stays silent.

See `skills/MEMORY_INJECTION.md` for the full spec.

### Reflect: Deep Research → Mental Models

The **Reflect skill** teaches agents to perform deep research across the full memory graph and persist results as mental models. This is not a meeseeks — it's a skill that any agent can import.

See `skills/MEMORY_REFLECT_SKILL.md` for the full spec.

---

## Tool Architecture

**Critical design decision:** Memory tools are exposed as CLI commands (`nexus memory <subcommand>`) that are always available to all agents. They are NOT injected as agent-specific `tool_use` tools that change the tool inventory.

This means:
- The tool surface is identical across all agent sessions → **prompt cache is never busted** by memory tool changes
- The **role prompt** for each meeseeks (writer, consolidator, injection) teaches the agent which CLI commands to use and how
- Any agent can use memory tools at any time if it knows how

### Execution Model: CLI → IPC → Daemon

Memory CLI commands follow a three-layer architecture:

```
┌─────────────────────────────────────────────┐
│  Agent (LLM in code/bash mode)              │
│  Executes: nexus memory recall --query ...  │
├─────────────────────────────────────────────┤
│  CLI layer (thin wrapper)                   │
│  Parses --flags, sends IPC request to NEX   │
│  daemon, prints JSON result to stdout       │
├─────────────────────────────────────────────┤
│  NEX daemon (executes core function)        │
│  recall(query, params) → memory.db,         │
│  embeddings.db, identity.db                 │
│  Can emit events, enforce ordering,         │
│  trigger downstream automations             │
└─────────────────────────────────────────────┘
```

All memory operations go through the daemon via IPC. The CLI never accesses SQLite directly. This ensures the daemon can:
- **Coordinate writes** — serialized through the daemon, no concurrent writer conflicts
- **Emit events** — memory writes can trigger automations (e.g., embedding generation after `insert-fact`)
- **Enforce ordering** — the daemon controls operation sequencing
- **Maintain consistency** — cross-database operations (memory.db + identity.db + embeddings.db) are coordinated in one place

The function signatures described in the per-tool specs (e.g., `recall(query, params)`, `insert_fact(text, as_of, ...)`) define the **core function contract** — what the operation does, its parameters, and its return type. The CLI surface maps these to `--flag` arguments. See `environment/interface/cli/COMMANDS.md` for the full CLI command tree.

### Memory CLI Tools

| Tool | Purpose | Primary User |
|---|---|---|
| `recall` | Search memory across all layers | All agents |
| `insert_fact` | Store a new fact (creates element with type='fact') | Writer meeseeks |
| `create_entity` | Create entity (proactively suggests similar canonical entities) | Writer meeseeks |
| `confirm_entity` | Confirm entity decision after create_entity finds matches | Writer meeseeks |
| `link_element_entity` | Link an element to an entity | Writer meeseeks |
| `propose_merge` | Propose or execute entity merge | Writer + Consolidator |
| `consolidate_facts` | Create/update observation or skip facts (3 patterns) | Consolidator meeseeks |
| `insert_element_link` | Record typed relationship between elements (causal, supports, etc.) | Consolidator meeseeks |
| `resolve_element_head` | Find latest version of a version-chained element | Consolidator meeseeks |
| `create_mental_model` | Create a mental model (creates element with type='mental_model') | Agents using Reflect skill |
| `update_mental_model` | Update a mental model (creates new version with parent_id chain) | Agents using Reflect skill |
| `write_attachment_interpretation` | Store interpretation of an attachment (composite key: event_id, attachment_id) | Writer meeseeks |
| `read_attachment_interpretation` | Read existing interpretation of an attachment | Writer meeseeks |

### Agent Roles

| Agent | Type | When | Purpose |
|---|---|---|---|
| Memory Writer | Meeseeks (forked from manager) | `episode-created` hookpoint fires | Extract facts + entities |
| Memory Consolidator | Meeseeks (forked from manager) | `episode-retained` hookpoint fires (after writer completes) | Build observations, link facts, propose merges |
| Memory Injection | Meeseeks (forked from session) | `worker:pre_execution` hookpoint on every agent execution | Find relevant memory context |

All meeseeks are forked from their parent session (typically a manager agent turn), inheriting the full context of what's happening. This gives them situational awareness beyond just their specific task.

### Meeseeks Self-Improvement

Each meeseeks has a dedicated workspace directory that persists across invocations. After any meeseeks run completes, there is an optional follow-on step where the agent can update its own workspace files — modify ROLE.md, create scripts, document patterns, record disambiguation rules. This is how agents improve across sessions.

Self-improvement is exclusive to meeseeks (the writer, consolidator, and injection agents). Skills (Search, Reflect) do not have this capability since they run within existing agent sessions.

---

## Storage Schema

The complete storage schema is defined in `MEMORY_STORAGE_MODEL.md`. Here is a summary of the key tables in `memory.db`:

| Table | Purpose |
|---|---|
| **`elements`** | All derived knowledge: facts, observations, mental models (unified by `type` discriminator) |
| **`elements_fts`** | FTS5 full-text search across ALL element types |
| **`element_entities`** | Many-to-many entity links for any element (generalizes old `fact_entities`) |
| **`element_links`** | Typed directed links between elements: causal, supports, contradicts, supersedes, derived_from |
| **`sets`** | Collections of events/elements/sets, with definition references |
| **`set_members`** | Polymorphic membership: events, elements, or sub-sets |
| **`set_definitions`** | Templates describing how sets are constructed (strategies, configs) |
| **`job_types`** | Processing operation definitions (retain, consolidate, reflect, extensible) |
| **`jobs`** | Job execution records with status, retry, raw output |
| **`job_outputs`** | Which elements each job produced (provenance) |
| **`processing_log`** | "Has target X been processed by job type Y?" (replaces `is_consolidated`) |
| **`resolution_log`** | Entity resolution audit trail (creation, linking, merging decisions) |
| **`access_log`** | Telemetry: which elements/sets were accessed and when |

### embeddings + vec_embeddings (embeddings.db)

```sql
CREATE TABLE embeddings (
    id          TEXT PRIMARY KEY,
    target_id   TEXT NOT NULL,
    target_type TEXT NOT NULL,                  -- matches elements.type
    model       TEXT NOT NULL,
    vector      BLOB NOT NULL,
    created_at  INTEGER NOT NULL
);

-- Virtual table for KNN search (sqlite-vec)
CREATE VIRTUAL TABLE vec_embeddings USING vec0(
    target_id   TEXT,
    target_type TEXT,
    embedding   FLOAT[384]                     -- dimension matches provider
);
```

---

## Related Specs

| Document | Covers |
|---|---|
| `MEMORY_STORAGE_MODEL.md` | **Storage schema**: elements, sets, jobs — the unified storage model with full SQL and design decisions |
| `RETAIN_PIPELINE.md` | Episode lifecycle, filtering, payload assembly, writer dispatch, post-processing |
| `MEMORY_WRITER.md` | Writer meeseeks: workflow, extraction rules, entity resolution, coreference |
| `MEMORY_CONSOLIDATION.md` | Consolidation meeseeks: observations, causal links, entity merges |
| `MEMORY_RECALL.md` | Recall API: strategies, parameters, budget control, fusion |
| `UNIFIED_ENTITY_STORE.md` | Identity layer: entities, contacts, merge chains, identifier policy |
| `FACT_GRAPH_TRAVERSAL.md` | Graph traversal patterns for relationship queries |
| `skills/MEMORY_INJECTION.md` | Pre-execution memory injection meeseeks |
| `skills/MEMORY_SEARCH_SKILL.md` | Search skill: hierarchical retrieval, query decomposition, staleness |
| `skills/MEMORY_REFLECT_SKILL.md` | Reflect skill: deep research, mental model creation |
