# Memory V2 Retain Pipeline — Unified Episode-Based Architecture

**Status:** DESIGN SPEC (RESOLVED)
**Created:** 2026-02-19
**Depends On:** MEMORY_SYSTEM_V2.md, MEMORY_WRITER_V2.md, MEMORY_V2_INFRASTRUCTURE_WORKPLAN.md
**Context:** All 8 phases of the original WORKPLAN.md have been implemented. The current backfill implementation processes events one-by-one through the full agentic pipeline, which won't scale to millions of events. This spec redesigns the retain pipeline to be episode-based, unifying the live and backfill paths.

---

## Overview

This spec redesigns how events get committed to long-term memory. The core insight: **both live and backfill retain should use the same episode-based pipeline.** Events accumulate in short-term memory (searchable immediately), get batched into episodes at conversation boundaries, and episodes get processed by the retain pipeline in parallel.

This replaces the current dual-path approach:
- **Old Path 1:** Agent turn complete → writer forks per event
- **Old Path 2:** eventIngested → writer forks per event
- **Old Backfill:** Loop over events, replay each through Path 2

With a unified approach:
- **New:** Events → short-term memory index → episode boundary detected → episode sent to retain pipeline → facts extracted → short-term entries removed

---

## Architecture

```
Events arrive (live or backfill)
    |
    v
Short-Term Memory Index
  - Raw events indexed for immediate searchability via recall()
  - Embedded for semantic search
  - FTS-indexed for keyword search
  - NOT yet retained (no facts extracted)
    |
    v
Episode Boundary Detection
  - Conversation gap (configurable, e.g., 90min silence in a thread)
  - Token budget reached (4-8K tokens accumulated in a thread)
  - End of day / explicit trigger
  - Backfill: pre-computed from historical data
    |
    v
Episode Assembled
  - All events from one thread/channel conversation window
  - Formatted as sequence of NexusEvents with full metadata
  - Target: 4-8K tokens per episode
    |
    v
Retain Pipeline (parallelizable)
  - Memory-Writer meeseeks receives full episode
  - Extracts facts, identifies entities, deduplicates
  - Links facts to entities
  - One LLM session per episode (not per event)
    |
    v
Post-Retain
  - Embeddings generated for new facts + entities (batch)
  - Events marked in memory_processing_log
  - Short-term memory entries removed for these events
  - Consolidation triggered for new facts
    |
    v
Consolidation Pipeline (parallel, separate from retain)
  - Processes new unconsolidated facts in episode-sized batches
  - Creates/updates observations
  - Detects causal links between facts
  - Proposes entity merges from cross-platform patterns
```

---

## Short-Term Memory

### Concept

Short-term memory bridges the gap between when an event arrives and when it gets retained (facts extracted). Without it, there's a window where recent events are invisible to recall() — the event exists in events.db but hasn't been processed into facts yet.

Short-term memory makes unretained events immediately searchable through the same recall() interface that searches long-term memory (facts, observations, mental models).

### How It Works

1. **Event arrives** → immediately indexed in short-term memory
2. **recall() searches both** short-term (raw events) AND long-term (facts/observations/mental models)
3. **Episode retained** → events in that episode removed from short-term index

### Implementation — Flag on Events Table (NOT a Separate Table)

Short-term memory is implemented as a **flag on the existing events table**, not a separate `short_term_events` table. This avoids data duplication and leverages the existing events ledger infrastructure.

```sql
-- Add to events table in events.db
ALTER TABLE events ADD COLUMN is_retained BOOLEAN DEFAULT FALSE;

CREATE INDEX idx_events_unretained ON events(is_retained) WHERE is_retained = FALSE;
```

Events arrive with `is_retained = FALSE` (the default). When an episode is retained and facts are extracted, all events in that episode are marked `is_retained = TRUE`.

**Why a flag instead of a separate table:**
- Events already exist in events.db — duplicating them wastes storage and creates sync issues
- The events table already has content, timestamps, thread_id, platform — everything needed for search
- A flag query (`WHERE is_retained = FALSE`) is simple and fast with a partial index
- No lifecycle cleanup needed — just flip the flag

**Search indexes for unretained events:**

```sql
-- FTS5 index over unretained event content (in events.db)
-- This indexes ALL events; the is_retained filter is applied at query time.
-- Alternatively, a content-sync FTS table can be rebuilt periodically.
CREATE VIRTUAL TABLE events_fts USING fts5(
    content,
    content='events',
    content_rowid='rowid'
);

-- vec_embeddings uses target_type='event' for unretained event embeddings
-- INSERT INTO vec_embeddings (target_type, target_id, embedding)
-- VALUES ('event', ?event_id, ?embedding)
-- These are cleaned up after retention (or left in place — low cost).
```

### recall() Integration

recall() gains a **5th retrieval strategy**: `short_term_events`. This strategy queries the events table for rows where `is_retained = FALSE`, using both FTS and semantic search. It is included in the **default** search alongside facts, observations, and mental models. Agents don't need to know about short-term vs long-term — recall() returns both transparently.

Short-term results are returned with `type: 'event'` so agents can distinguish them if needed, but for most use cases they just appear as additional context alongside facts.

**RRF integration:** Short-term event results participate in the same RRF fusion (k=60) as all other strategies. They carry their own ranked list and are merged normally.

### Lifecycle

```
Event ingested
    → INSERT into events table (is_retained = FALSE by default)
    → embed event content (fast, local model)
    → INSERT into events_fts
    → INSERT into vec_embeddings (target_type='event')

Episode retained (facts extracted)
    → UPDATE events SET is_retained = TRUE WHERE id IN (?episode_event_ids)
    → INSERT into memory_processing_log for each event_id
    → Optionally: DELETE from vec_embeddings WHERE target_type='event' AND target_id IN (?)
      (or leave embeddings in place — they're cheap and may be useful for future re-indexing)
```

### Why This Matters

- **No information gap:** Recent events are searchable immediately, even before retention
- **Unified pipeline:** Live and backfill use the same retain flow, just with different episode boundary triggers
- **Mimics human cognition:** Short-term memory (raw events, high detail, recent) vs long-term memory (extracted facts, synthesized observations, durable)
- **Memory injection meeseeks** can find recent conversation context via short-term memory without the writer having processed it yet

---

## Episode Grouping

### Philosophy

Episodes are **conversational units** — a coherent stretch of communication within a single thread/channel/DM. Cross-platform connections are handled by the consolidation pipeline, not by grouping events from different platforms into the same episode.

Why thread/channel grouping is correct:
- Messages within a thread are topically coherent → good extraction context
- The writer sees a full conversation, not isolated messages → better fact quality
- Cross-platform interleaving (email + Discord + iMessage at the same time) produces WORSE extraction quality because the writer has to context-switch between unrelated conversations
- Consolidation is specifically designed to discover cross-platform connections via fact similarity, entity overlap, and temporal proximity

### Grouping Algorithm

**Input:** Ordered events from events.db, optionally filtered by platform/time range.

**Step 1: Group by conversation thread**
```
GROUP BY (platform, thread_id OR container_id)
```
Each group is a single conversation stream (one iMessage thread, one Discord channel, one email thread, etc.).

**Step 2: Split at conversation boundaries**
Within each thread group, split into episodes at natural conversation breaks:
- **Time gap:** No message for N minutes (configurable, default 90 minutes)
- **Token budget:** Episode exceeds target token size (default 6000 tokens, range 4000-8000)

**Step 3: Handle edge cases**
- **Oversized single messages:** If one message exceeds the token budget, it becomes its own episode
- **Undersized episodes:** Episodes under ~500 tokens are valid — a quick 3-message exchange is still worth retaining. Don't force-merge with adjacent episodes.
- **Events without thread_id:** Group by `(platform, sender_id)` as fallback, then by time gaps. This applies to internal clock/cron events, system events, and any event that doesn't belong to a conversation thread. Each threadless event effectively becomes its own mini-episode (or gets grouped with other threadless events from the same sender within the time gap).
- **Email chains:** Use the email thread_id (In-Reply-To / References headers) as the grouping key. Long email chains that span weeks are split at the conversation gap boundary like any other thread.

### Live Episode Boundary Detection — Scheduled Events

For **live** events, episode boundaries are detected using the **scheduled-event approach** rather than background timers. This integrates naturally with the existing Nexus event/cron/clock system.

**How it works:**

1. When a new event arrives for a thread, **schedule (or reschedule) a retain trigger** for that thread at `now + 90min` using the Nexus event scheduling system.
2. If another event arrives in the same thread before the trigger fires, **reschedule** the trigger to `now + 90min` (pushing it forward).
3. When the trigger fires (90 minutes of silence), assemble the episode from all unretained events in that thread and send it to the retain pipeline.
4. If the token budget is exceeded before the gap timer fires, close the episode immediately and start a new accumulation window. The scheduled trigger for the old window is cancelled.

```sql
-- Track pending retain triggers per thread (in memory.db or nexus.db)
CREATE TABLE pending_retain_triggers (
    thread_key      TEXT PRIMARY KEY,   -- "(platform, thread_id)" composite key
    scheduled_at    INTEGER NOT NULL,   -- when the retain should fire (unix ms)
    first_event_at  INTEGER NOT NULL,   -- timestamp of first unretained event in window
    event_count     INTEGER DEFAULT 1,  -- number of accumulated events
    token_estimate  INTEGER DEFAULT 0,  -- accumulated token estimate
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);
```

**Additional triggers:**
- **End-of-day safety net:** A daily cron job (e.g., midnight local time) flushes all pending retain triggers regardless of gap status. This ensures nothing lingers indefinitely.
- **Explicit flush:** `nexus memory retain --flush` immediately fires all pending triggers.
- **Token budget exceeded:** When `token_estimate` exceeds the budget, fire immediately without waiting for the gap.

**Why scheduled events over background timers:**
- Integrates with the existing Nexus event system — no separate timer infrastructure needed
- Each reschedule is a simple DB update, not a timer lifecycle operation
- Survives process restarts (triggers are persisted in the DB, recovered on startup)
- The cron/clock system already handles scheduled execution

### Token Budget

Target: **6000 tokens** per episode (configurable).

Why 6000:
- Large enough for 15-40 messages of conversational context
- Small enough for a single LLM pass with room for the role prompt, tools, and extraction output
- Aligns with the memory-writer's context window budget

Token estimation: `tokens ≈ chars / 4` (rough but sufficient for grouping).

### Episode Representation

Each episode is formatted as a sequence of NexusEvents with full metadata, identical to how the live path formats events. This ensures the writer meeseeks sees the same input format regardless of whether the episode comes from live or backfill.

```json
{
  "episode_id": "ep_01HXY...",
  "platform": "imessage",
  "thread_id": "+15551234567",
  "event_count": 23,
  "token_estimate": 5200,
  "time_range": {
    "start": 1708000000000,
    "end": 1708003600000
  },
  "events": [
    {
      "event_id": "evt_01HXY...",
      "timestamp": 1708000000000,
      "content": "Hey are you coming to dinner tonight?",
      "content_type": "text",
      "direction": "inbound",
      "delivery": {
        "platform": "imessage",
        "sender_id": "+15551234567",
        "sender_name": "Mom",
        "container_id": "+15551234567",
        "container_kind": "dm",
        "thread_id": "+15551234567"
      },
      "metadata": { ... }
    },
    ...
  ]
}
```

### Uniform Context for Live and Backfill

Both live and backfill retain use the same episode format. The current live path pulls the last 12 messages from the thread as context — this is replaced by full episode assembly:

- **Live:** Episode builds up as events arrive. At the episode boundary (gap, token budget, EOD), the full episode is sent to retain.
- **Backfill:** Episodes are pre-computed from historical events using the same grouping algorithm.

The writer meeseeks sees the same input in both cases. No separate code paths, no separate configuration.

**Context window for live events (replacing the 12-message limit):**
Pull all events from the current conversation window (same thread, within the conversation gap threshold OR up to the token budget). This gives the writer richer context than the current 12-message limit. Use the same parameters as episode grouping: 90-minute gap, 6000 token budget.

---

## Pre-Episode Filtering

### Philosophy

The filter system controls which events enter the memory pipeline. Its purpose is **both** cost optimization AND quality:
- **Cost:** Don't spend LLM calls on 50,000 spam emails
- **Quality:** Noise in memory dilutes signal, wastes context space during recall, and bogs down meeseeks with irrelevant results

The filter applies uniformly to **both live retain and backfill retain**. Same rules, same defaults.

### Filter Architecture

```
Events → Pre-Episode Filter → Filtered Events → Episode Grouping → Episodes → Retain
```

The filter runs before episode grouping. Events that don't pass the filter are never grouped into episodes and never sent to the retain pipeline. They remain in events.db (immutable ledger) but are excluded from memory.

### Filter Definition

Filters are **SQL WHERE clause fragments** stored in nexus.db. Each filter specifies:
- **Platform** (optional): which platform this rule applies to
- **WHERE clause**: a SQL fragment that matches against the events table columns
- **Action**: `include` or `exclude`
- **Priority**: higher priority rules override lower ones

This approach leverages SQL directly — no custom DSL to interpret. Filters are evaluated by constructing a query against the events table with all applicable WHERE clauses combined.

See **"Filter Storage (RESOLVED)"** below for the full schema and composition rules.

### Default Filters (Ship With)

**Gmail/Email:**
- Exclude: category = promotions AND opened = false
- Exclude: category = spam
- Exclude: sender matches known marketing/newsletter domains (unsubscribe link heuristic)
- Include: everything else (even short emails can be important)

**General (all platforms):**
- Exclude: content_type = 'system' (system-generated events like "chat created")
- Include: content_type = 'reaction' (reactions are meaningful social signals)
- Include: content_type = 'membership' (join/leave events are important moments)
- Include: empty/short content (can be contextually important, let the writer decide)
- Include: everything not explicitly excluded

### Important Design Decisions

1. **Reactions and membership events are INCLUDED by default.** When someone is added or removed from a group, or reacts to a message, that's meaningful information. The writer decides if there's a fact worth extracting.

2. **Empty/short content is INCLUDED by default.** A terse "k" reply or an empty message with an attachment can be contextually significant. The writer sees it in the episode context and decides.

3. **The writer is the final filter.** Even if an event passes the pre-episode filter, the writer can decide "nothing worth extracting here" and produce zero facts. The pre-episode filter is about obvious noise; the writer handles nuanced relevance.

4. **Filters are user-configurable.** The defaults are sane starting points. Users can add/remove/modify filters for their specific needs. A filter management UI/CLI is needed.

### Filter CLI

```bash
# List active filters
nexus memory filters list

# Add a custom filter
nexus memory filters add --platform gmail --field sender_id --condition contains --value "@marketing" --action exclude

# Preview what a filter excludes from backfill
nexus memory filters preview --platform gmail --from 2024-01-01
# → "Would exclude 42,000 of 95,000 gmail events (44%)"

# Disable a default filter
nexus memory filters disable spam-email-filter
```

### Filter Storage (RESOLVED)

Filters are stored as **SQL WHERE clause fragments** in a `memory_filters` table in **nexus.db**. This keeps filter configuration with other Nexus system config and makes filter evaluation a direct SQL operation — no DSL interpretation layer needed.

```sql
-- In nexus.db
CREATE TABLE memory_filters (
    id              TEXT PRIMARY KEY,       -- ULID
    name            TEXT NOT NULL UNIQUE,   -- human-readable filter name
    description     TEXT,                   -- what this filter does
    platform        TEXT,                   -- NULL = applies to all platforms
    where_clause    TEXT NOT NULL,          -- SQL WHERE fragment, e.g., "content_type = 'system'"
    action          TEXT NOT NULL,          -- 'include' or 'exclude'
    priority        INTEGER DEFAULT 0,     -- higher = evaluated later, can override lower
    enabled         BOOLEAN DEFAULT TRUE,
    is_default      BOOLEAN DEFAULT FALSE, -- shipped with Nexus, vs user-created
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

CREATE INDEX idx_memory_filters_platform ON memory_filters(platform);
CREATE INDEX idx_memory_filters_enabled ON memory_filters(enabled) WHERE enabled = TRUE;
```

**Filter composition rules (RESOLVED):**
- Filters are evaluated in priority order (lowest first)
- At the **same priority level**, exclude beats include (conservative default)
- A **higher priority** rule overrides any lower priority rule entirely
- The default action (no filter match) is **include** — events pass through unless explicitly excluded

**Example filters:**
```sql
-- Default: exclude system events (priority 0)
INSERT INTO memory_filters (id, name, where_clause, action, priority, is_default)
VALUES ('f1', 'exclude-system-events', "content_type = 'system'", 'exclude', 0, TRUE);

-- Default: exclude spam email (priority 0)
INSERT INTO memory_filters (id, name, platform, where_clause, action, priority, is_default)
VALUES ('f2', 'exclude-spam-email', 'gmail',
  "json_extract(metadata, '$.category') = 'spam'", 'exclude', 0, TRUE);

-- User: include a specific sender that was being excluded (priority 10, overrides)
INSERT INTO memory_filters (id, name, platform, where_clause, action, priority)
VALUES ('f3', 'include-boss-emails', 'gmail',
  "from_identifier = 'boss@company.com'", 'include', 10);
```

**Cost prediction:** The `nexus memory backfill --dry-run` command already shows event counts and episode estimates. Rough cost estimates based on episode count × average cost per episode will be added to the dry-run output. Precise cost prediction is deferred until we have real backfill data to calibrate against.

**Default filter rules:** The specific default filter rules (which spam heuristics, which system events, etc.) are deferred until adapters are more settled. The infrastructure (table, CLI, composition rules) ships first. Default rules are added per-platform as adapters mature.

---

## Retain Pipeline

### Writer Meeseeks — Scoped to Extraction

The memory-writer meeseeks is scoped to **fact extraction, entity identification, deduplication, and entity resolution.** It does NOT handle causal links or mental models (see MEMORY_V2_INFRASTRUCTURE_WORKPLAN.md Item 9).

**Tools available:**
- `recall` — for dedup checks, entity resolution, gathering context
- `insert_fact` — store extracted facts
- `create_entity` — create new entities
- `link_fact_entity` — link facts to entities
- `propose_merge` — merge entities (with propagateMergeToSessions)

**Input:** A complete episode — an array of NexusEvents in chronological order, with full delivery metadata per event. The writer prompt is framed as: "You are processing a conversation episode containing N messages from [platform] in [thread]. Extract durable knowledge from this conversation."

**Output:** Facts, entities, fact-entity links written to memory.db / identity.db.

**Writer prompt changes for episode-based input (RESOLVED):**
The writer's task prompt shifts from "you received a raw event" to "you are processing a conversation episode." Key prompt adjustments:
- "This episode contains N messages from a conversation in [thread/channel]."
- "Read the entire conversation before extracting facts — context from later messages may reframe earlier ones."
- "Extract facts from the conversation as a whole, not per-message. A single exchange often produces one consolidated fact rather than N facts for N messages."
- "If the conversation has no durable knowledge worth extracting, return zero facts. Not every conversation needs to produce facts."
- For oversized episodes that were split at the token budget: "This is part of a longer conversation. Earlier context may have been processed in a prior episode."

### Episode-Level Retain Flow

```
Episode received by retain pipeline
    |
    v
Memory-Writer meeseeks forks with full episode as context
    |
    v
Writer reads all events in the episode
    |
    v
Writer extracts facts from the ENTIRE episode at once
  - Sees full conversation context (not isolated messages)
  - Identifies atomic durable knowledge
  - Each fact is a natural language sentence
    |
    v
For each fact:
  - Dedup check: recall(fact_text, scope=['facts'], budget='low')
  - Entity identification: identify entities in the fact
  - Entity resolution: recall(entity_name, scope=['entities'])
    - Match found → use existing entity_id
    - No match → create_entity()
    - Ambiguous → create new + propose_merge if confident
  - insert_fact() + link_fact_entity() for each entity
    |
    v
Writer completes
    |
    v
Post-retain (algorithmic, not agentic):
  1. Batch embed all new facts from this episode
  2. Mark all episode event IDs in memory_processing_log
  3. Mark episode events as is_retained=TRUE (removes them from short-term memory queries)
  4. Trigger consolidation for new facts from this episode
```

### Entity Resolution Guidance

The writer must handle entity resolution carefully. Key scenarios:

**Nicknames and aliases:**
When someone calls the user "Ty" instead of "Tyler", the writer should:
- Recognize this as a nickname for the canonical entity
- Link the fact to the canonical Tyler entity
- Record "Ty" as an alias / nickname (tracked via entity tags or resolution log)
- Nicknames are interesting metadata — tracking who calls you what is valuable

**Same name, different person:**
When someone mentions "Tyler" in conversation and context makes it clear they're talking about a different Tyler:
- Create a new entity (e.g., "Tyler Johnson") rather than linking to the user's entity
- Use conversation context, thread participants, and topic to disambiguate
- If truly ambiguous, create a new entity and note the ambiguity — consolidation or human cleanup can resolve later

**Delivery-sourced entities:**
When the writer sees a sender for the first time, the delivery pipeline has already created a sparse entity (just a platform handle). The writer MUST:
- Search for existing entities matching the sender handle
- Link facts to the existing delivery-sourced entity
- Enrich it when real names are discovered (propose merge to create person entity)

**Provenance tracking:**
Every entity resolution decision should be logged (see MEMORY_V2_INFRASTRUCTURE_WORKPLAN.md Item 12) so that incorrect merges can be audited and split, and incorrect splits can be merged. Track which event/fact/episode triggered each resolution.

### Parallelism

Episodes are independent extraction units. Multiple episodes can be processed by the retain pipeline **in parallel** with high concurrency.

**Why parallel is safe:**
- Facts are append-only and immutable — extraction order doesn't matter
- Entity resolution uses union-find (merged_into chains) — concurrent creates may produce duplicates that consolidation merges later
- The main risk is entity duplication from parallel episodes both creating "Mom" — but this is acceptable because:
  - Most of the time, the second episode's dedup check finds the first's entity
  - When it doesn't, consolidation's entity resolution catches it (see Consolidation section)
  - Worst case, human-in-the-loop cleanup via entity audit tools

**Concurrency control:**
- Configurable parallelism: `--concurrency N` (default: 4 for backfill, 1 for live)
- Each retain job is independent — no shared state except the database
- SQLite WAL mode handles concurrent writers

---

## Consolidation Pipeline

### Philosophy

Consolidation is where the intelligence lives. While retain does fast parallel extraction, consolidation does the slow careful thinking:
- Linking facts into observations (synthesized durable knowledge)
- Discovering causal relationships between facts
- Detecting cross-platform entity connections
- Proposing entity merges from pattern analysis

**Accuracy is more important than speed for consolidation.** It can be slow. It runs as a background pipeline.

### Observations vs Mental Models

These serve different purposes and remain separate:

| | Observations | Mental Models |
|---|---|---|
| **Created by** | Consolidation pipeline (automatic) | Agents via reflect skill (intentional) |
| **Trigger** | New facts arrive that cluster together | Agent or user actively researches a topic |
| **Scope** | Narrow — one cluster of related facts | Broad — comprehensive report on a topic |
| **Intent** | None — system's autonomous understanding | Deliberate — someone decided this synthesis is worth persisting |
| **Example** | "Tyler and Sarah frequently discuss engineering projects" | "Tyler's Career History: work history, current role, interests, trajectory" |
| **Mutability** | Versioned — updated when new related facts arrive | Versioned — refreshed on demand or when marked stale |

Observations are the system reflecting on itself automatically. Mental models are agents (or users) reflecting deliberately.

### Episode-Batched Consolidation (RESOLVED)

Instead of consolidating facts one at a time, consolidate all facts from a given episode together. This aligns with the retain pipeline — when a retain job completes and produces N facts, those N facts are sent to consolidation as a batch.

**Why episode-batched is better (confirmed during design review):**
- Facts from the same episode are likely related (same conversation) → the LLM sees them together and produces **better observations** with more context per call
- Reduces redundant work — 5 facts about the same topic in one episode get one consolidation pass instead of 5
- Aligns the batch boundary with the retain boundary → simpler to reason about
- Total LLM calls are similar or fewer, but each call has higher quality because it sees the full cluster of related facts from the conversation
- Accuracy is **improved** over per-fact consolidation because the LLM can see how facts from the same conversation relate to each other and to existing observations in a single reasoning pass

**Consolidation flow per episode batch:**

```
New facts from episode arrive (retain completed)
    |
    v
1. Batch recall: For each fact in the batch:
   - recall(fact_text, scope=['facts', 'observations'], budget='mid')
   - Collect related facts and observations from across ALL memory
     (not just this episode — this is where cross-platform connections emerge)
   - Recall is batched across the episode's facts for efficiency:
     shared entities and topics get deduplicated recall calls
    |
    v
2. Cluster the batch facts + their recall results by topic/entity overlap
   - Facts about the same topic/entities get clustered together
   - This is lightweight — semantic similarity + shared entity_ids
   - Most episodes produce 1-3 clusters; single-topic conversations produce 1
    |
    v
3. For each cluster — single LLM call with the consolidation prompt:

   PROMPT STRUCTURE:
   "You are reviewing N NEW FACTS extracted from a recent conversation,
    along with related existing observations from memory.

    NEW FACTS (from this episode):
    [list of new facts with timestamps and entity links]

    RELATED EXISTING OBSERVATIONS:
    [existing observations retrieved via recall, with staleness status]

    RELATED EXISTING FACTS (from other episodes):
    [facts from other conversations that share entities/topics]

    Instructions:
    - For each topic cluster, decide: create a NEW observation, UPDATE an existing one, or do nothing
    - Create SEPARATE observations per topic — don't merge unrelated topics into one observation
    - When updating, preserve the existing observation's scope and add the new information
    - Look for CAUSAL RELATIONSHIPS between facts (explicit: 'because', 'therefore', 'led to';
      implicit: clear temporal-logical chains)
    - Look for ENTITY CONNECTIONS across platforms that suggest merge candidates
    - Return a JSON array of actions."

   LLM returns: create/update/causal_link/propose_merge actions
    |
    v
4. Apply actions:
   - Create new observations (new analysis_run, new episode, observation_facts links)
   - Update existing observations (new version via parent_id chain)
   - Insert causal links between facts (from_fact_id, to_fact_id, strength)
   - Mark facts as consolidated (is_consolidated = TRUE)
   - Set is_stale on affected mental models
    |
    v
5. Entity resolution (cross-episode):
   - Look for entity merge opportunities discovered during consolidation
   - e.g., facts from Discord about "CoolGamer42" and facts from iMessage about "Jake"
     both mention the same unique details → propose merge
   - This catches cross-platform entity connections that the writer couldn't see
    |
    v
6. Commit per cluster (crash-recoverable)
```

**Consolidation for large episodes (>20 facts):**
Start with episode-aligned batching. If an episode produces >20 facts, the clustering step (step 2) naturally sub-batches them by topic. Each cluster gets its own LLM call. This handles the large-episode case without needing a separate sub-batching mechanism.

### Causal Link Detection in Consolidation

Causal links are detected during consolidation, not during retain. The consolidation pipeline sees the full fact graph — it can identify causal relationships across episodes, platforms, and time:

**Within the prompt:** The consolidation LLM is instructed to look for causal language and temporal-logical chains:
- Explicit: "because", "therefore", "led to", "resulted in", "caused by", "due to"
- Implicit: clear temporal + logical chain where fact A directly enabled/caused fact B

**Cross-episode causality:** When consolidation recalls facts from other episodes during step 1, it can see causal relationships that span conversations:
- Email about "budget approved" → Discord message "starting project X" → these are causally linked but came from different platforms and episodes

**Output:** `INSERT INTO causal_links (from_fact_id, to_fact_id, strength)` during step 4.

### Entity Resolution in Consolidation

Consolidation performs a second pass of entity resolution, catching connections the writer missed:

**Cross-platform patterns:**
- Facts from Discord mention "CoolGamer42 loves hiking"
- Facts from iMessage mention "Jake loves hiking and his Discord is CoolGamer42"
- The writer processed these in separate episodes and may have created separate entities
- Consolidation sees both facts together (via recall), notices the handle overlap, proposes merge

**Co-occurrence patterns:**
- Entity A and Entity B always appear together in facts
- entity_cooccurrences table tracks this
- Above a threshold, consolidation proposes they might be the same entity

**This is strictly additive** — consolidation proposes merges, it doesn't split entities. Splitting is a human-in-the-loop operation via the entity audit tools.

### Running Consolidation

**Live:** After each retain job completes, consolidation is triggered for that episode's facts. Runs in the background, non-blocking.

**Backfill:** Consolidation runs as a separate parallel pipeline. As retain jobs produce facts, consolidation picks them up in episode-sized batches. Multiple consolidation workers can run concurrently.

**Ordering:** Consolidation does NOT need to run in chronological order. Because observations are mutable (versioned via parent_id), a later fact can be consolidated first and create an observation, then an earlier fact can be consolidated and update that observation with new context. The final observation is the same regardless of order.

---

## Backfill Pipeline

### Overview

Backfill uses the same episode-based retain pipeline as live. The only differences:
1. Episodes are pre-computed from historical events (not built incrementally)
2. Higher parallelism (4+ concurrent retain jobs vs 1 for live)
3. Pre-episode filtering is applied to historical data

### Flow

```
nexus memory backfill --platform imessage --from 2024-01-01
    |
    v
1. SCAN: Query events.db for matching events
   - Apply pre-episode filters
   - Check memory_processing_log for already-retained events
   - Report: "Found 42,000 events → [filtering] → 38,000 filtered events"
    |
    v
2. GROUP: Run episode grouping algorithm on filtered events
   - Group by (platform, thread_id), split at conversation gaps + token budget
   - Report: "38,000 events → 3,800 episodes (avg 5,200 tokens/episode)"
    |
    v
3. ESTIMATE: Show cost/time estimate
   - "Estimated time: ~16 hours @ 15s/episode with concurrency=4"
   - "Estimated LLM cost: ~$X"
   - "Proceed? [y/N]"
    |
    v
4. RETAIN: Process episodes through retain pipeline
   - Parallel: up to N concurrent retain jobs (configurable)
   - No strict chronological ordering required
   - Progress reporting: "[imessage] episode 142/3,800 (3.7%) — 892 facts, 234 entities"
    |
    v
5. CONSOLIDATE: Runs in parallel as a separate pipeline
   - Picks up new unconsolidated facts as retain produces them
   - Episode-batched consolidation
   - Progress: "[consolidation] 45 episodes consolidated, 312 observations created"
    |
    v
6. EMBED: Batch embedding runs alongside retain
   - Raw event embeddings for short-term memory index
   - Fact embeddings after each retain job
   - Entity embeddings as entities are created
    |
    v
7. COMPLETE: Final summary
   - "Backfill complete: 3,800 episodes retained, 15,200 facts, 2,100 entities,
     890 observations, elapsed: 14h 32m"
```

### Crash Recovery

Backfill must be crash-recoverable and pausable/resumable.

**Tracking:**

```sql
CREATE TABLE backfill_runs (
    id              TEXT PRIMARY KEY,   -- run ID
    platform        TEXT,
    from_time       INTEGER,
    to_time         INTEGER,
    total_episodes  INTEGER,
    status          TEXT NOT NULL,      -- 'running', 'paused', 'completed', 'failed'
    started_at      INTEGER NOT NULL,
    completed_at    INTEGER,
    created_at      INTEGER NOT NULL
);

CREATE TABLE backfill_episodes (
    id              TEXT PRIMARY KEY,   -- episode ID
    run_id          TEXT NOT NULL REFERENCES backfill_runs(id),
    platform        TEXT,
    thread_id       TEXT,
    event_count     INTEGER,
    token_estimate  INTEGER,
    status          TEXT NOT NULL,      -- 'pending', 'in_progress', 'completed', 'failed'
    facts_created   INTEGER DEFAULT 0,
    entities_created INTEGER DEFAULT 0,
    started_at      INTEGER,
    completed_at    INTEGER,
    error_message   TEXT
);

CREATE INDEX idx_backfill_episodes_run ON backfill_episodes(run_id);
CREATE INDEX idx_backfill_episodes_status ON backfill_episodes(status);
```

On crash: resume from the last incomplete episode. Completed episodes are not re-processed. Failed episodes can be retried.

```bash
# Resume a paused/crashed backfill
nexus memory backfill --resume <run_id>

# List backfill runs
nexus memory backfill --list
```

### Idempotency

Backfill is idempotent:
- `memory_processing_log` tracks which events have been retained
- Events already in the log are skipped during episode grouping
- Running backfill twice on the same time range produces no duplicate facts
- Partially processed episodes (some events retained, others not) → the episode is re-processed from scratch, fact dedup prevents duplicates

### CLI UX

```bash
# Basic backfill
nexus memory backfill --from 2024-01-01

# Platform-specific
nexus memory backfill --platform imessage --from 2024-01-01 --to 2025-01-01

# Dry run — show what would happen without processing
nexus memory backfill --from 2024-01-01 --dry-run

# Concurrency control
nexus memory backfill --from 2024-01-01 --concurrency 8

# Episode size tuning
nexus memory backfill --from 2024-01-01 --episode-tokens 4000

# Conversation gap tuning
nexus memory backfill --from 2024-01-01 --gap-minutes 60

# Resume
nexus memory backfill --resume bf_01HXY...

# Status
nexus memory backfill --status bf_01HXY...
```

### Performance Expectations

- **Per episode:** ~10-15 seconds average (LLM extraction + entity resolution + embedding)
- **Concurrency 4:** ~2.5-3.5 seconds effective per episode
- **1,000 episodes:** ~1 hour
- **10,000 episodes:** ~8-10 hours
- **Full personal history (50,000+ episodes):** Multiple days, designed for overnight/weekend runs

---

## Live Retain — Episode-Based

### Replacing Event-by-Event Live Retain

The current live path triggers the writer per event. This is replaced by episode-based live retain:

1. **Event arrives** → indexed in short-term memory (immediately searchable)
2. **Episode accumulates** → events in the same thread build up
3. **Episode boundary detected** → the complete episode is sent to retain
4. **Retain completes** → short-term entries removed, facts available

### Episode Boundary Detection (Live)

See the **"Live Episode Boundary Detection — Scheduled Events"** section under Episode Grouping for the full design. In summary:

1. **Conversation gap (scheduled-event approach):** Each new event schedules/reschedules a retain trigger for that thread at `now + 90min`. When 90 minutes of silence pass, the trigger fires and the episode is assembled from all unretained events.

2. **Token budget:** If accumulated events in a thread exceed the token budget (default: 6000 tokens), fire immediately — close the episode and start a new accumulation window.

3. **End-of-day safety net:** A daily cron job flushes all pending retain triggers regardless of gap status.

4. **Explicit trigger:** `nexus memory retain --flush` immediately fires all pending triggers.

### Gap Between Event and Retention

With episode-based live retain, there's a time gap between when an event arrives and when it gets committed to long-term memory. For a conversation that runs for 30 minutes, facts won't be extracted until 90 minutes after the last message (when the gap triggers).

**This is acceptable because:**
- Short-term memory makes events searchable immediately
- The memory injection meeseeks searches short-term memory and can inject recent events
- The main agent can also find recent events via recall()
- When the episode IS retained, all events get processed together with full context → better quality facts than event-by-event extraction

### What About Agent Turns?

The current Path 1 (agent turn complete) gives the writer rich context: the full turn with user message + agent response + tool calls. With episode-based retain, agent turns are events like any other — they accumulate in the thread and get retained as part of the episode.

**Concern:** Agent turns have richer metadata (tool_calls, reasoning) that standalone events don't have. We should preserve this by including the full turn metadata in the event representation. The writer's role prompt already has "Agent Turns" guidance for extracting what was DECIDED, not the mechanics.

### Open Question: Hybrid Approach?

There's an argument for a hybrid: agent turns (Path 1) continue to trigger immediate retain (they have rich context), while standalone events (Path 2) use episode-based batching. This would mean:
- Agent turns → immediate retain (current behavior, works well)
- Standalone events → accumulate in short-term memory → episode boundary → batch retain

**Pro:** Agent turns get fast extraction with rich context
**Con:** Two code paths to maintain, which is what we're trying to eliminate

**Current recommendation:** Start with pure episode-based for everything. If agent turn extraction quality degrades, consider the hybrid as a targeted optimization.

---

## Resolved Design Decisions

The following questions were open during initial design and have been resolved:

1. **Episode grouping mechanics (live path):** → Scheduled-event timer approach. See "Live Episode Boundary Detection — Scheduled Events" section.
2. **Short-term memory implementation:** → `is_retained` flag on events table, not a separate table. See "Implementation — Flag on Events Table" section.
3. **Filter storage and composition:** → SQL WHERE clauses in `memory_filters` table in nexus.db. Exclude beats include at same priority. See "Filter Storage (RESOLVED)" section.
4. **Writer input format for episodes:** → Array of NexusEvents in chronological order. Prompt framed as "conversation episode containing N messages." See "Writer Meeseeks — Scoped to Extraction" section.
5. **Consolidation batching prompt design:** → Episode-batched is better for accuracy. Multiple NEW FACTS per prompt. Separate observations per topic cluster. See "Episode-Batched Consolidation (RESOLVED)" section.

## Remaining Open Questions

### Episode Overlapping
Should episodes overlap (sliding window) so facts at episode boundaries get full context? Or is the current hard-boundary approach good enough since the writer sees the full conversation within each episode?

**Decision:** Hard boundaries with generous token budget. The 6000-token window provides enough context. Overlapping would cause duplicate extraction that dedup must handle. If a fact falls at the boundary, it appears in one episode with 90% of its context — good enough.

### Embedding Pipeline — Pre-Embed Events?
For backfill, should we pre-embed all raw events before episode grouping starts? This would make short-term memory search available for ALL historical events from the start. But it's a lot of embeddings upfront.

**Decision:** Embed events as they enter short-term memory (both live and backfill). For backfill, this means embedding happens as events are loaded, before retain starts. Batch embedding makes this fast — 100 events at a time.

### Conversation Gap Threshold — Per-Platform Tuning
Is 90 minutes the right default gap for all platforms?

**Decision:** Start with 90 minutes as universal default. Add per-platform overrides later if needed. The token budget (6000 tokens) is the more important boundary — most episodes will hit the token limit before the time gap. Platform-specific gap overrides can be stored in the `memory_filters` system or a separate `platform_config` table.

---

## Implementation Order

```
1. Episode Grouping Algorithm (the foundation — everything depends on this)
   - Group by (platform, thread_id OR container_id), fallback to (platform, sender_id)
   - Split at conversation gaps + token budget
   - Format episodes as NexusEvent arrays in chronological order
   - Handle threadless events, email chains, oversized messages
    |
    v
2. Short-Term Memory — is_retained Flag + Indexes
   - ALTER events ADD COLUMN is_retained BOOLEAN DEFAULT FALSE
   - events_fts FTS5 index, vec_embeddings with target_type='event'
   - recall() integration as 5th retrieval strategy in RRF
   - Lifecycle: flag flip on retain, embedding cleanup optional
    |
    v
3. Pre-Episode Filter System
   - memory_filters table in nexus.db (SQL WHERE clause fragments)
   - Filter composition: exclude beats include at same priority
   - CLI for filter management (list, add, preview, disable)
   - Default filters deferred until adapters are settled
    |
    v
4. Retain Pipeline Refactor
   - Replace event-by-event writer trigger with episode-based
   - Writer receives full episode, prompt says "conversation episode containing N messages"
   - Post-retain: batch embed, UPDATE is_retained = TRUE, trigger consolidation
    |
    v
5. Live Episode Boundary Detection — Scheduled Events
   - pending_retain_triggers table
   - Schedule/reschedule on each new event (now + 90min)
   - Fire on gap timeout, token budget exceeded, or end-of-day flush
   - nexus memory retain --flush CLI command
    |
    v
6. Backfill CLI Redesign
   - Scan + filter + group + estimate (with cost prediction in dry-run)
   - Parallel retain with progress reporting
   - Crash recovery (backfill_runs + backfill_episodes tables)
   - Resume support
    |
    v
7. Consolidation Pipeline Upgrade
   - Episode-batched consolidation with multi-fact prompt
   - Causal link detection (moved from writer)
   - Cross-platform entity resolution proposals
   - Parallel consolidation workers
   - Recall batching across episode facts
```

---

## See Also

- `MEMORY_SYSTEM_V2.md` — Master architecture document
- `MEMORY_WRITER_V2.md` — Writer meeseeks spec (being updated for scoped extraction)
- `MEMORY_V2_INFRASTRUCTURE_WORKPLAN.md` — Recall parity, embedding provider, tool scope changes
- `MEMORY_INJECTION.md` — Memory injection meeseeks (timeout + deconstraining updates)
- `MEMORY_WRITER_ROLE.md` — Writer role prompt (architecture context additions)
