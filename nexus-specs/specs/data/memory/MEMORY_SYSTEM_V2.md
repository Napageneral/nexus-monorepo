# Memory System V2

**Status:** DESIGN SPEC
**Last Updated:** 2026-02-20
**Supersedes:** ../MEMORY_SYSTEM.md
**Related:** UNIFIED_ENTITY_STORE.md, MEMORY_WRITER_V2.md, ../../ledgers/EVENTS_LEDGER.md, ../../ledgers/IDENTITY_GRAPH.md

> **Canonical reference:** See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md) for the authoritative database layout. Memory tables live in `memory.db`. Entity tables (`entities`, `entity_tags`, `entity_cooccurrences`, `merge_candidates`) live in `identity.db`. Embeddings live in `embeddings.db`.

---

## Overview

The Nexus memory system is a 4-layer architecture that transforms raw events into progressively higher levels of understanding. It draws from Hindsight's fact-extraction and consolidation pipeline, the episode-analysis framework, and a unified entity store.

Two parallel pipelines operate over the same event stream and shared entity store:
1. **Events -> Episodes -> Analyses** (temporal grouping + structured analysis)
2. **Events -> Facts -> Observations -> Mental Models** (knowledge extraction + consolidation)

Memory is read and written by dedicated meeseeks roles. Agents do not need to "remember to remember" -- memory operations are automatic.

---

## The Four Layers

```
Layer 4:  MENTAL MODELS     High-level reports, refreshable, persisted
              |
Layer 3:  OBSERVATIONS       Synthesized durable knowledge (a type of analysis)
              |
Layer 2:  FACTS + EPISODES   Extracted atomic knowledge + grouped events
              |
Layer 1:  EVENTS             Raw immutable event stream (Events Ledger)
```

| Layer | What | Mutability | Created By |
|-------|------|------------|------------|
| **Events** | Raw inbound/outbound communications | Immutable, append-only | Adapters (iMessage, Gmail, Discord, etc.) |
| **Facts** | Atomic extracted knowledge ("Tyler works at Anthropic") | Immutable | Memory-Writer meeseeks (agentic extraction) |
| **Episodes** | Grouped events (by time, thread, session, topic) | Immutable (new version via parent_id) | Algorithmic grouping + consolidation |
| **Observations** | Synthesized durable knowledge with history | Mutable (versioned via parent_id on analysis_runs) | Consolidation (background LLM job) |
| **Mental Models** | High-level reports spanning many observations | Mutable (versioned via parent_id) | Agent skill (reflect/search) or user-triggered |

---

## Data Model

### Layer 1: Events

The Events Ledger is unchanged. See `../../ledgers/EVENTS_LEDGER.md`.

Events are the immutable source of truth. Everything else is derived from events.

---

### Layer 2a: Facts

Facts are atomic pieces of knowledge extracted from events by the Memory-Writer meeseeks. Each fact is a natural language sentence linked to its source event and to the entities it mentions.

**Facts are immutable.** Once extracted, a fact never changes. New information creates new facts; the consolidation process synthesizes them into observations.

```sql
CREATE TABLE facts (
    id              TEXT PRIMARY KEY,       -- ULID
    text            TEXT NOT NULL,          -- "Tyler works at Anthropic"
    context         TEXT,                   -- "career discussion with Sarah"

    -- Temporal
    as_of           INTEGER NOT NULL,       -- when the thing happened (unix ms)
    ingested_at     INTEGER NOT NULL,       -- when it could've been known (unix ms)
                                            -- For real-time: ~= as_of
                                            -- For backfill: set to original event time

    -- Provenance
    source_event_id TEXT,                   -- FK -> events.id in events ledger

    -- State
    is_consolidated BOOLEAN DEFAULT FALSE,  -- has consolidation processed this fact?
    access_count    INTEGER DEFAULT 0,      -- incremented on recall retrieval

    -- Metadata
    metadata        TEXT,                   -- JSON: {source_channel, direction, thread_id, ...}

    created_at      INTEGER NOT NULL        -- when row was physically inserted
);

CREATE INDEX idx_facts_as_of ON facts(as_of DESC);
CREATE INDEX idx_facts_ingested_at ON facts(ingested_at DESC);
CREATE INDEX idx_facts_source_event ON facts(source_event_id);
CREATE INDEX idx_facts_unconsolidated ON facts(is_consolidated) WHERE is_consolidated = FALSE;
CREATE INDEX idx_facts_access ON facts(access_count DESC);
```

#### Knowledge Graph: fact_entities

The knowledge graph is a simple junction table linking facts to entities. This replaces both Hindsight's `unit_entities` and the old structured `relationships` table.

A fact like "Tyler works at Anthropic building Nexus" gets linked to three entities: Tyler, Anthropic, Nexus. The relationship between them is encoded in the natural language of the fact itself -- no structured triples needed.

> **Note:** `fact_entities` lives in `memory.db`. The `entity_id` column references `entities.id` in `identity.db` by convention (no cross-database FK enforcement). See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md).

```sql
CREATE TABLE fact_entities (
    fact_id     TEXT NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
    entity_id   TEXT NOT NULL,  -- references entities.id in identity.db by convention
    PRIMARY KEY (fact_id, entity_id)
);

CREATE INDEX idx_fact_entities_entity ON fact_entities(entity_id);
CREATE INDEX idx_fact_entities_fact ON fact_entities(fact_id);
```

**Graph traversal at read time:** To find all facts about entity X, join through `fact_entities`. To find entities related to X, join `fact_entities` twice (facts mentioning X -> other entities in those facts). No pre-computed entity links needed.

#### Causal Links

The only link type stored at write time. Causal relationships ("X caused Y") require inference and cannot be derived from timestamps, embeddings, or shared entities.

```sql
CREATE TABLE causal_links (
    from_fact_id TEXT NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
    to_fact_id   TEXT NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
    strength     REAL NOT NULL CHECK (strength >= 0.0 AND strength <= 1.0),
    created_at   INTEGER NOT NULL,
    PRIMARY KEY (from_fact_id, to_fact_id)
);

CREATE INDEX idx_causal_links_to ON causal_links(to_fact_id);
```

Causal links are identified by the **consolidation pipeline** (not the writer). The consolidation pipeline sees the full fact graph across episodes and platforms, enabling it to detect causal relationships the writer couldn't see in isolation. See `MEMORY_V2_RETAIN_PIPELINE.md` for details.

#### Observation-Fact Linkage

Direct link from observations (analysis_runs) to the facts that support them. Created during consolidation.

```sql
CREATE TABLE observation_facts (
    analysis_run_id TEXT NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
    fact_id         TEXT NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
    PRIMARY KEY (analysis_run_id, fact_id)
);

CREATE INDEX idx_observation_facts_fact ON observation_facts(fact_id);
CREATE INDEX idx_observation_facts_run ON observation_facts(analysis_run_id);
```

#### Memory Processing Log

Tracks which events have been processed by the Memory-Writer. Separate table to avoid polluting the events schema. Enables backfill queries (`SELECT FROM events WHERE id NOT IN memory_processing_log`) and auditability.

```sql
CREATE TABLE memory_processing_log (
    event_id        TEXT PRIMARY KEY,       -- FK -> events.id in events ledger
    processed_at    INTEGER NOT NULL,       -- when the writer processed this event (unix ms)
    writer_run_id   TEXT,                   -- which writer invocation processed it
    created_at      INTEGER NOT NULL
);

CREATE INDEX idx_memory_processing_log_processed ON memory_processing_log(processed_at DESC);
```

Used by both trigger paths:
- **Path 1 (agent turn complete):** Writer marks all event IDs from the turn as processed after extraction.
- **Path 2 (eventIngested):** Hook checks this table first — if event already processed (by Path 1), skip. Otherwise fork writer.

---

#### Why No Temporal, Semantic, or Entity Links at Write Time

All three can be computed at read time via existing indexes:

| Link Type | Write-Time (Hindsight) | Read-Time (Nexus V2) |
|-----------|----------------------|---------------------|
| **Temporal** | Pre-computed edges in memory_links, 24hr window, linear decay | `WHERE as_of BETWEEN $t - 24h AND $t + 24h ORDER BY as_of` |
| **Semantic** | Pre-computed top-5 cosine >= 0.7 in memory_links | Vector similarity search via embeddings table |
| **Entity** | Bidirectional edges between facts sharing entities, capped at 50 | `JOIN fact_entities fe1 ON ... JOIN fact_entities fe2 ON fe1.entity_id = fe2.entity_id` |

Pre-computed links cause write amplification (entity links are O(n^2)), require explosion caps (50/entity, 10 temporal neighbors), and become stale as new facts arrive. Read-time computation is fast with proper indexes and always current.

---

### Layer 2b: Episodes

Episodes are unchanged from the current memory system, with one addition: `parent_id` for version history.

```sql
CREATE TABLE episodes (
    id              TEXT PRIMARY KEY,
    definition_id   TEXT NOT NULL REFERENCES episode_definitions(id),
    platform        TEXT,
    thread_id       TEXT,
    start_time      INTEGER NOT NULL,
    end_time        INTEGER NOT NULL,
    event_count     INTEGER NOT NULL,
    first_event_id  TEXT,
    last_event_id   TEXT,
    parent_id       TEXT REFERENCES episodes(id),  -- version chain
    created_at      INTEGER NOT NULL
);

CREATE INDEX idx_episodes_definition ON episodes(definition_id);
CREATE INDEX idx_episodes_platform ON episodes(platform);
CREATE INDEX idx_episodes_thread ON episodes(thread_id);
CREATE INDEX idx_episodes_time ON episodes(start_time, end_time);
CREATE INDEX idx_episodes_parent ON episodes(parent_id);
```

`episode_definitions`, `episode_events`, `episode_entity_mentions` remain as-is.

**Episode versioning:** When an episode is extended with new events (e.g., new messages in a thread), a new episode row is created with `parent_id` pointing to the previous version. The old episode is preserved. Analysis runs against the old version stay; new analyses run against the new version.

**Knowledge-cluster episodes:** The consolidation process can create episodes grouped by topic (not just time/thread). This uses a new episode definition with `strategy = 'consolidation'`. These episodes group the source events behind related facts.

---

### Layer 3: Observations (Analysis Type)

Observations are a type of analysis. They use the existing `analysis_types`, `analysis_runs`, and `facets` infrastructure.

```sql
-- analysis_types: add an observation type
-- INSERT INTO analysis_types (id, name, version, output_type, prompt_template)
-- VALUES ('observation_v1', 'observation_v1', '1.0', 'freeform',
--         '<consolidation prompt>');

-- analysis_runs: add parent_id for version history + access_count
CREATE TABLE analysis_runs (
    id               TEXT PRIMARY KEY,
    analysis_type_id TEXT NOT NULL REFERENCES analysis_types(id),
    episode_id       TEXT NOT NULL REFERENCES episodes(id),
    parent_id        TEXT REFERENCES analysis_runs(id),  -- version chain
    status           TEXT NOT NULL,
    started_at       INTEGER,
    completed_at     INTEGER,
    output_text      TEXT,
    error_message    TEXT,
    blocked_reason   TEXT,
    retry_count      INTEGER DEFAULT 0,
    access_count     INTEGER DEFAULT 0,
    is_stale         BOOLEAN DEFAULT FALSE,  -- set TRUE when new facts arrive that affect this observation
    created_at       INTEGER NOT NULL,
    UNIQUE(analysis_type_id, episode_id)
);

CREATE INDEX idx_analysis_runs_type ON analysis_runs(analysis_type_id);
CREATE INDEX idx_analysis_runs_episode ON analysis_runs(episode_id);
CREATE INDEX idx_analysis_runs_status ON analysis_runs(status);
CREATE INDEX idx_analysis_runs_parent ON analysis_runs(parent_id);
CREATE INDEX idx_analysis_runs_stale ON analysis_runs(is_stale) WHERE is_stale = TRUE;
```

**Observation staleness:** The `is_stale` field is set by the consolidation worker. When new facts arrive that share entities with an existing observation, the consolidation process marks that observation as stale (is_stale = TRUE). When the observation is re-consolidated with the new facts, a new version is created (parent_id chain) with is_stale = FALSE.

**How observations work:**
1. Consolidation takes an unconsolidated fact
2. Recalls related observations (via embedding search)
3. If related facts found: creates/extends a knowledge-episode, runs the observation analysis
4. If no related facts: marks fact as consolidated, no episode/observation created
5. The observation text is stored as `output_text` on the analysis_run. No facet duplication needed — `output_text` is the canonical source for observation content.
6. When new facts arrive and update an observation, a new episode version is created (parent_id chain), and a new analysis_run is created against it (parent_id chain). Old versions preserved.

**Existing analysis types continue to work.** Summary analyses, PII extraction, conversation analysis -- all keep running as before against their episodes. Observations are just another analysis type.

```sql
-- facets: unchanged (used by other analysis types; observation text lives in analysis_runs.output_text)
CREATE TABLE facets (
    id              TEXT PRIMARY KEY,
    analysis_run_id TEXT NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
    episode_id      TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    facet_type      TEXT NOT NULL,       -- 'entity', 'topic', 'observation', 'summary', 'pii_email', ...
    value           TEXT NOT NULL,       -- the extracted value or markdown document
    entity_id       TEXT,                    -- references entities.id in identity.db by convention
    confidence      REAL,
    metadata_json   TEXT,
    created_at      INTEGER NOT NULL
);
```

---

### Layer 4: Mental Models

High-level reports built by querying across observations, facts, and episodes. Stored in the database for provenance tracking and staleness detection.

```sql
CREATE TABLE mental_models (
    id              TEXT PRIMARY KEY,       -- ULID
    name            TEXT NOT NULL,          -- "Tyler's Career", "Project Nexus Status"
    description     TEXT NOT NULL,          -- full report (markdown)
    subtype         TEXT,                   -- 'structural', 'emergent', 'pinned'
    entity_id       TEXT,                   -- references entities.id in identity.db by convention
    tags            TEXT,                   -- JSON array for ACL scoping
    parent_id       TEXT REFERENCES mental_models(id),  -- version chain
    is_stale        BOOLEAN DEFAULT FALSE,
    refresh_trigger TEXT,                   -- JSON: {"refresh_after_consolidation": true}
    last_refreshed  INTEGER,
    access_count    INTEGER DEFAULT 0,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

CREATE INDEX idx_mental_models_entity ON mental_models(entity_id);
CREATE INDEX idx_mental_models_parent ON mental_models(parent_id);
CREATE INDEX idx_mental_models_stale ON mental_models(is_stale) WHERE is_stale = TRUE;
```

**Who creates mental models:**
- Agents using the memory reflect skill can persist results as mental models
- Users can explicitly request mental model creation
- The consolidation system can trigger refreshes on existing models when related observations update

> **Note:** The Memory-Writer meeseeks does NOT create or update mental models. Mental model CRUD belongs exclusively in the reflect skill. The writer focuses on fact extraction, entity identification, and deduplication. See `MEMORY_V2_INFRASTRUCTURE_WORKPLAN.md` Item 9.

**Versioning:** When a mental model is refreshed, a new row is created with `parent_id` pointing to the previous version. The old version stays for history.

---

### Embeddings

Separate table for swappable models and multi-model support.

```sql
CREATE TABLE embeddings (
    id           TEXT PRIMARY KEY,
    target_type  TEXT NOT NULL,             -- 'fact', 'observation', 'entity', 'episode', 'mental_model'
    target_id    TEXT NOT NULL,
    model        TEXT NOT NULL,             -- 'text-embedding-3-small', 'gemini-embedding-004', etc.
    embedding    BLOB NOT NULL,             -- binary vector
    dimension    INTEGER NOT NULL,
    created_at   INTEGER NOT NULL,
    UNIQUE(target_type, target_id, model)
);

CREATE INDEX idx_embeddings_target ON embeddings(target_type, target_id);
CREATE INDEX idx_embeddings_model ON embeddings(model);
```

---

## Parallel Pipelines

```
Events Ledger (immutable, append-only)
    |
    +---> Short-Term Memory Index (is_retained=FALSE on events table)
    |       - Immediately searchable via recall()
    |       - FTS + semantic search over unretained events
    |
    +---> Episode Grouping (algorithmic)
    |         |
    |         v
    |     Episodes (time/thread/session grouped)
    |         |
    |         v
    |     Analysis Runs (summary, pii, convo_all, ...)
    |         |
    |         v
    |     Facets (structured outputs)
    |
    +---> Retain Pipeline (episode-based)
              |
              v
          Memory-Writer Meeseeks (agentic, receives full episode)
              |
              v
          Facts + fact_entities (writer does NOT create causal_links)
              |
              v
          Embeddings (algorithmic, post-agent)
              |
              v
          Events marked is_retained=TRUE
              |
              v
          Consolidation (background, episode-batched)
              |
              +---> Causal link detection (cross-episode/cross-platform)
              |
              +---> Find/extend knowledge-episode
              |         |
              |         v
              |     Observation analysis_run (output_text)
              |
              +---> Cross-platform entity merge proposals
              |
              +---> Mental Model staleness flagging (if triggered)

Both pipelines share:
  - Events Ledger (Layer 1)
  - Unified Entity Store
  - Embeddings table
```

The pipelines are independent. Episodes group events temporally. Facts extract knowledge from events. Observations synthesize facts into durable knowledge. They operate on the same data but produce different outputs for different query patterns.

> **See also:** `MEMORY_V2_RETAIN_PIPELINE.md` for the full episode-based retain architecture, including short-term memory, episode grouping, filtering, and consolidation batching.

---

## Recall API

A single search interface with tunable parameters. Used by agents via a skill/tool.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string (required) | Natural language search query |
| `scope` | string[] | What to search: `['facts', 'observations', 'mental_models', 'entities']` (default: facts+observations+mental_models) |
| `entity` | string | Filter by entity name or ID |
| `time_after` | integer | Only results with as_of after this timestamp |
| `time_before` | integer | Only results with as_of before this timestamp |
| `platform` | string | Filter by source platform |
| `max_results` | integer | Maximum number of results (default: 20) |
| `budget` | string | Search depth: 'low', 'mid', 'high' |

**Retrieval strategies (executed in parallel, results fused via RRF):**
1. **Semantic search** -- embedding cosine similarity via vec extension
2. **Keyword search** -- FTS5 over fact text
3. **Entity traversal** -- facts linked to queried entities via fact_entities
4. **Causal traversal** -- facts connected via causal_links
5. **Short-term events** -- unretained events (`is_retained = FALSE` on events table) searched via FTS + semantic. Returns `type: 'event'` results. See `MEMORY_V2_RETAIN_PIPELINE.md`.

Temporal and platform filtering are applied as WHERE clauses on results. Dedicated temporal retrieval (proximity-based decay scoring) is planned — see `MEMORY_V2_INFRASTRUCTURE_WORKPLAN.md` Item 5.

**Fusion:** Reciprocal Rank Fusion (RRF) with k=60 across strategies. Post-fusion MMR (Maximal Marginal Relevance) for diversity (λ=0.7). No cross-encoder reranking initially.

**Budget controls which strategies run:**
- `low`: semantic search only (single vector query, fastest)
- `mid`: semantic + keyword + entity traversal + short-term events + link expansion (see MEMORY_V2_INFRASTRUCTURE_WORKPLAN.md Item 6)
- `high`: all strategies including MPFP graph traversal (see MEMORY_V2_INFRASTRUCTURE_WORKPLAN.md Item 4) + higher result limits

**Hierarchical retrieval strategy (taught via skill):**
1. Search mental models first (highest quality, if applicable)
2. Search observations (consolidated knowledge, check staleness)
3. Search raw facts (ground truth, for specifics or stale verification)

---

## Memory Search Skill

A reusable skill that any agent can import for searching memory. Equivalent to Hindsight's reflect() but implemented as a Nexus skill.

The skill teaches:
- Hierarchical retrieval strategy (mental models -> observations -> facts)
- Query decomposition (break complex questions into targeted searches)
- Staleness awareness (verify stale observations against raw facts)
- Budget management (low/mid/high search depth)
- How to use recall() parameters for filtered search

For persisting search results as mental models, see the Memory Reflect skill (`MEMORY_REFLECT_SKILL.md`).

Agents that import this skill: Memory-Writer (for dedup/resolution during retain), any conversational agent (for searching when automated injection isn't enough), any meeseeks that needs context.

---

## Memory Injection (Read Path)

Memory retrieval is split into two mechanisms:

### 1. Memory Injection Meeseeks (automatic, every worker dispatch)

A lightweight meeseeks at `worker:pre_execution`. Uses a fast cheap model (gpt-5.3-codex-spark or equivalent) with zero thinking budget. Its only job: run recall() on the task, triage the results, and inject only what's relevant. Returns nothing if recall returns noise — avoids junk injection. Timeout: 60 seconds. Typical latency under 10 seconds. The meeseeks uses its judgment on how many recall calls to make — zero for purely computational tasks, multiple for entity-rich inputs.

### 2. Memory Search Skill (on-demand, by any agent)

Any agent can import the Memory Search skill and call `recall()` with targeted parameters during its session. This is the "pull" model — the agent actively searches when it knows it needs more context beyond what the injection provided.

See `MEMORY_INJECTION.md` for full details.

---

## Trigger Mechanism (Write Path) — Episode-Based Retain

> **Note:** The original per-event dual-path trigger design has been replaced by an episode-based retain pipeline. See `MEMORY_V2_RETAIN_PIPELINE.md` for the full design.

Events no longer trigger the writer individually. Instead:

1. **Events arrive** → indexed in short-term memory (`is_retained = FALSE`), immediately searchable via recall()
2. **Events accumulate** in their thread/channel conversation
3. **Episode boundary detected** (90-minute conversation gap, token budget exceeded, or end-of-day flush) → episode assembled from all unretained events in that thread
4. **Episode sent to retain pipeline** → Memory-Writer meeseeks receives the full episode and extracts facts
5. **Post-retain** → events marked `is_retained = TRUE`, facts embedded, consolidation triggered

```
Event arrives
    → Indexed in short-term memory (is_retained=FALSE, searchable via recall)
    → Scheduled retain trigger updated for this thread (now + 90min)
    |
    v
Episode boundary detected (gap timeout / token budget / EOD flush)
    → Episode assembled from unretained events in thread
    → Memory-Writer meeseeks forks with full episode
    → Writer extracts facts, entities, dedup, entity resolution
    → Post-retain: embed facts, mark is_retained=TRUE, trigger consolidation
```

Both agent turns and standalone events flow through the same episode-based pipeline. Agent turns accumulate in their thread like any other event. The writer's role prompt has guidance for extracting from agent turns (what was DECIDED, not the mechanics).

---

## Backfill Strategy

> **Full design:** See `MEMORY_V2_RETAIN_PIPELINE.md` for the complete episode-based backfill architecture.

Backfill uses the **same episode-based retain pipeline** as live. The key differences: episodes are pre-computed from historical events, higher parallelism (4+ concurrent retain jobs), and pre-episode filtering removes obvious noise before grouping.

**Summary flow:**
1. **Scan + filter** → query events.db, apply pre-episode filters (SQL WHERE clauses from `memory_filters` table in runtime.db), skip already-retained events
2. **Group into episodes** → group by (platform, thread_id), split at 90-minute conversation gaps + 6000-token budget
3. **Estimate** → show episode count, time/cost estimate, confirm before proceeding
4. **Retain** → process episodes through the same writer meeseeks pipeline in parallel (configurable concurrency)
5. **Consolidate** → episode-batched consolidation runs in parallel as facts are produced
6. **Embed** → batch embedding alongside retain

**Key properties:**
- **No strict chronological order required** — episodes are independent, parallel is safe
- **Crash-recoverable** — tracked via `backfill_runs` and `backfill_episodes` tables, supports pause/resume
- **Idempotent** — `memory_processing_log` + fact dedup prevents duplicates on re-run

**Temporal fields:** Set `ingested_at` to the original event time for all backfilled data.

**Runtime:** Multiple days for full personal history (50K+ episodes). Designed for overnight/weekend runs.

---

## Implementation Hints

These are notes for implementing agents. Each is straightforward but documenting the approach saves investigation time.

### SQLite Vec Extension (Embeddings)

The memory system uses SQLite. For vector similarity search, use the `sqlite-vec` extension (in `embeddings.db`). Virtual table:

```sql
CREATE VIRTUAL TABLE vec_embeddings USING vec0(
    target_type TEXT,
    target_id TEXT,
    embedding float[384]   -- dimension matches embedding provider (default: BAAI/bge-small-en-v1.5 = 384)
);
```

> **Note:** The dimension is determined by the embedding provider abstraction (see `MEMORY_V2_INFRASTRUCTURE_WORKPLAN.md` Item 1). On model change, the vec table is rebuilt from the `embeddings` table.

Query with cosine similarity:
```sql
SELECT target_id, distance
FROM vec_embeddings
WHERE embedding MATCH ?query_vector
  AND k = 20
ORDER BY distance;
```

The embeddings table (non-virtual) stores the canonical embeddings with model metadata. The vec table is a search index derived from it. When models change, rebuild the vec table from the embeddings table.

Reference: Hindsight uses pgvector with `<=>` cosine distance. Translate to sqlite-vec's `MATCH` operator.

### FTS5 (Keyword Search)

SQLite FTS5 for keyword search over facts:

```sql
CREATE VIRTUAL TABLE facts_fts USING fts5(
    text,
    content='facts',
    content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER facts_fts_insert AFTER INSERT ON facts
BEGIN
    INSERT INTO facts_fts(rowid, text) VALUES (NEW.rowid, NEW.text);
END;
```

Query:
```sql
SELECT f.id, f.text, bm25(facts_fts) AS score
FROM facts_fts
JOIN facts f ON f.rowid = facts_fts.rowid
WHERE facts_fts MATCH ?query
ORDER BY score
LIMIT 20;
```

### Reciprocal Rank Fusion (RRF)

Combine results from multiple retrieval strategies:

```python
def rrf_fuse(ranked_lists: list[list[str]], k: int = 60) -> list[tuple[str, float]]:
    """Fuse multiple ranked result lists using RRF."""
    scores = {}
    for ranked_list in ranked_lists:
        for rank, item_id in enumerate(ranked_list):
            scores[item_id] = scores.get(item_id, 0) + 1.0 / (k + rank + 1)
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)
```

Reference: Hindsight's `memory_engine.py` implements this. Port directly.

### Maximal Marginal Relevance (MMR)

Post-RRF diversity filter. Prevents redundant results (e.g., 10 facts all saying "Tyler works at Anthropic"):

```python
def mmr_rerank(candidates, selected, embeddings, lambda_param=0.7):
    """Select next item balancing relevance and diversity."""
    best_score = -inf
    best_id = None
    for cid in candidates:
        relevance = rrf_score[cid]
        max_sim = max(cosine_sim(embeddings[cid], embeddings[sid]) for sid in selected) if selected else 0
        score = lambda_param * relevance - (1 - lambda_param) * max_sim
        if score > best_score:
            best_score = score
            best_id = cid
    return best_id
```

Apply iteratively: pick best, add to selected, repeat until max_results.

Reference: Hindsight implements MMR in its recall pipeline. Standard algorithm, well-documented in IR literature.

### Embedding Model

The old memory system used Gemini embeddings but these are expensive per-call. For V2, use the same local model as Hindsight:

- **Default:** `BAAI/bge-small-en-v1.5` via node-llama-cpp GGUF (Q8_0). 384 dimensions. Runs locally, zero API cost.
- **Provider abstraction:** The embedding provider is swappable via env vars (`NEXUS_EMBEDDINGS_PROVIDER`, `NEXUS_EMBEDDINGS_MODEL`). Supports local, OpenAI, Cohere, LiteLLM. See `MEMORY_V2_INFRASTRUCTURE_WORKPLAN.md` Item 1.
- **Dimension:** Auto-detected from provider at initialization. The `embeddings` table stores model metadata; the `vec_embeddings` virtual table is rebuilt on model change.
- **Hindsight reference:** `hindsight_api/config.py` — `DEFAULT_EMBEDDINGS_LOCAL_MODEL = "BAAI/bge-small-en-v1.5"`, `DEFAULT_EMBEDDING_DIMENSION = 384`. Hindsight supports 6 providers via abstract interface.

### Meeseeks Workspace Layout

Follow existing conventions in `~/.nexus/state/meeseeks/`:

```
~/.nexus/state/meeseeks/memory-writer/
    ROLE.md              -- Role prompt (see MEMORY_WRITER_ROLE.md)
    skills/
        memory/
            recall.ts    -- recall() tool implementation
            write.ts     -- insert_fact, create_entity, etc.

~/.nexus/state/meeseeks/memory-injection/
    ROLE.md              -- Minimal triage prompt
    skills/
        memory/
            recall.ts    -- recall() tool only (read-only)
```

### Hook Registration

Follow existing patterns in `~/.nexus/state/hooks/`.

**Memory-writer:** Triggered by the episode boundary detection system (scheduled-event approach). When a retain trigger fires (conversation gap, token budget, or end-of-day flush), the writer meeseeks is forked with the assembled episode. See `MEMORY_V2_RETAIN_PIPELINE.md` for the `pending_retain_triggers` table and trigger mechanism.

**Memory-injection:** Hooks into `worker:pre_execution` (blocking, 60s timeout).

Check the Nex TS event bus and hook infrastructure for existing patterns. (Go `internal/bus/bus.go` has been eliminated.)

---

## Tables Dropped from V1

| Table | Reason |
|-------|--------|
| `relationships` | Replaced by `fact_entities` junction -- facts ARE the relationships |
| `entity_aliases` | Unified into single `entities` table |
| `identity_mappings` | Absorbed into `entities` table (contact handles are entities in identity.db; routable contacts in the delivery/routing system are a separate concept — see MEMORY_WRITER_V2.md "Contacts Contract") |
| `persons` | Unified into `entities` table |
| `person_contact_links` | Contact handles are entities in identity.db, merge handles linking |
| `person_facts` | Facts about people live in `facts` table |
| `unattributed_facts` | Unresolved entities handled by merge_candidates |
| `merge_events` | Simplified, audit via entity merged_into chain |

---

## See Also

- `MEMORY_V2_RETAIN_PIPELINE.md` -- Episode-based retain architecture (short-term memory, episode grouping, filtering, consolidation batching, backfill)
- `MEMORY_V2_INFRASTRUCTURE_WORKPLAN.md` -- Recall parity, embedding provider abstraction, writer scope changes, skill enrichment
- `UNIFIED_ENTITY_STORE.md` -- Entity unification and IAM integration
- `MEMORY_WRITER_V2.md` -- Agentic retain flow
- `MEMORY_WRITER_ROLE.md` -- The writer's role prompt
- `MEMORY_INJECTION.md` -- Automated memory injection (read path)
- `MEMORY_SEARCH_SKILL.md` -- Agent search skill
- `MEMORY_REFLECT_SKILL.md` -- Deep research and mental model creation
- `../../ledgers/EVENTS_LEDGER.md` -- Source event schema
- `../../ledgers/IDENTITY_GRAPH.md` -- Previous identity system (superseded)
- `../MEMORY_SYSTEM.md` -- Previous memory system (superseded)
