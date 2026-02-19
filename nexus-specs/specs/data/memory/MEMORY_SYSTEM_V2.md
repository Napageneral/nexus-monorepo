# Memory System V2

**Status:** DESIGN SPEC
**Last Updated:** 2026-02-18
**Supersedes:** ../MEMORY_SYSTEM.md
**Related:** UNIFIED_ENTITY_STORE.md, MEMORY_WRITER_V2.md, ../../ledgers/EVENTS_LEDGER.md, ../../ledgers/IDENTITY_GRAPH.md

> **Canonical reference:** See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md) for the authoritative database layout. Memory tables live in `memory.db`. Entity tables (`entities`, `entity_tags`, `entity_cooccurrences`, `merge_candidates`) live in `identity.db`. Embeddings live in `embeddings.db`.

---

## Overview

The Nexus memory system is a 4-layer architecture that transforms raw events into progressively higher levels of understanding. It draws from Hindsight's fact-extraction and consolidation pipeline, Cortex's episode-analysis framework, and a unified entity store.

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

The knowledge graph is a simple junction table linking facts to entities. This replaces both Hindsight's `unit_entities` and Cortex's structured `relationships` table.

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

Causal links are identified by the Memory-Writer agent during the retain flow.

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

Episodes are unchanged from the current Cortex system, with one addition: `parent_id` for version history.

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
- Agents using the memory search skill (reflect equivalent) can persist results as mental models
- Users can explicitly request mental model creation
- The consolidation system can trigger refreshes on existing models when related observations update
- The Memory-Writer meeseeks can create its own mental models to assist with future entity resolution and fact extraction (self-improvement)

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
    +---> Memory-Writer Meeseeks (agentic)
              |
              v
          Facts + fact_entities + causal_links
              |
              v
          Embeddings (algorithmic, post-agent)
              |
              v
          Consolidation (background, per-fact)
              |
              +---> Find/extend knowledge-episode
              |         |
              |         v
              |     Observation analysis_run (output_text)
              |
              +---> Mental Model refresh (if triggered)

Both pipelines share:
  - Events Ledger (Layer 1)
  - Unified Entity Store
  - Embeddings table
```

The pipelines are independent. Episodes group events temporally. Facts extract knowledge from events. Observations synthesize facts into durable knowledge. They operate on the same data but produce different outputs for different query patterns.

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

Temporal and platform filtering are applied as WHERE clauses on results, not separate retrieval strategies.

**Fusion:** Reciprocal Rank Fusion (RRF) with k=60 across strategies. Post-fusion MMR (Maximal Marginal Relevance) for diversity. No cross-encoder reranking initially.

**Budget controls which strategies run:**
- `low`: semantic search only (single vector query, fastest)
- `mid`: semantic + keyword + entity traversal (3-way RRF)
- `high`: all 4 strategies (4-way RRF) + higher result limits

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
- How to persist results as mental models when appropriate

Agents that import this skill: Memory-Writer (for dedup/resolution during retain), any conversational agent (for searching when automated injection isn't enough), any meeseeks that needs context.

---

## Memory Injection (Read Path)

Memory retrieval is split into two mechanisms:

### 1. Memory Injection Meeseeks (automatic, every worker dispatch)

A lightweight meeseeks at `worker:pre_execution`. Uses a fast cheap model (gpt-5.3-codex-spark or equivalent) with zero thinking budget. Its only job: run recall() on the task, triage the results, and inject only what's relevant. Returns nothing if recall returns noise — avoids junk injection. Target latency < 1 second.

### 2. Memory Search Skill (on-demand, by any agent)

Any agent can import the Memory Search skill and call `recall()` with targeted parameters during its session. This is the "pull" model — the agent actively searches when it knows it needs more context beyond what the injection provided.

See `MEMORY_INJECTION.md` for full details.

---

## Trigger Mechanism (Write Path)

Two paths for triggering the Memory-Writer:

### Path 1: Agent Turn Complete

When an event gets routed to an agent and the turn completes, the Memory-Writer forks as a meeseeks. It receives the full turn context (user message + agent response + tool calls). Rich extraction context. Marks event IDs as memory-processed.

### Path 2: Standalone Event (eventIngested)

Events not routed to agents fire the `eventIngested` finalize hook. The hook checks if the event is already memory-processed (by Path 1). If not, forks the Memory-Writer meeseeks with the raw event + deliveryContext. The writer uses `recall()` to gather additional context about the sender and thread.

```
Event arrives
    +-- Routed to agent? --> Turn completes --> Writer forks (full turn context)
    |                                           Marks events as processed
    +-- Not routed -------> eventIngested hook --> Already processed? Skip
                                                  Not processed? --> Writer forks
                                                    Writer uses recall() for context
```

---

## Backfill Strategy

For large historical event sets (thousands to millions of events):

1. **Episode grouping** -- Use existing algorithmic strategies to group events into episodes (time windows, threads, sessions). Target 4-8K tokens per episode — big enough for good extraction context, small enough for a single LLM pass.

2. **Same agentic retain flow** -- Each episode goes through the full Memory-Writer meeseeks flow (extraction, entity resolution, dedup, causal links). Same quality as real-time. Cost is managed via OAuth quota rotation across multiple accounts.

3. **Sequential within platform, parallel across platforms** -- Process a platform's episodes in chronological order so the writer builds entity context over time (earlier messages teach it who "Mom" is). Different platforms (iMessage, Discord, email) process in parallel since they have independent entity contexts.

4. **Embedding generation** -- Batch embedding via `embeddings_batcher` after each episode's facts are written.

5. **Consolidation** -- Runs after backfill completes, or can run incrementally during backfill.

**Temporal fields:** Set `ingested_at` to the original event time for all backfilled data. The system distinguishes real-time data (ingested_at ≈ as_of) from backfill (ingested_at set historically).

**Runtime:** This can take days for large histories. Design for running overnight or over weekends. Progress is per-episode with individual commits, so it's crash-recoverable and can be paused/resumed.

---

## Implementation Hints

These are notes for implementing agents. Each is straightforward but documenting the approach saves investigation time.

### SQLite Vec Extension (Embeddings)

The memory system uses SQLite. For vector similarity search, use the `sqlite-vec` extension (in `embeddings.db`). Virtual table:

```sql
CREATE VIRTUAL TABLE vec_embeddings USING vec0(
    target_type TEXT,
    target_id TEXT,
    embedding float[384]   -- BAAI/bge-small-en-v1.5 = 384 dimensions
);
```

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

The old Cortex used Gemini embeddings but these are expensive per-call. For V2, use the same local model as Hindsight:

- **Default:** `BAAI/bge-small-en-v1.5` via sentence-transformers (same as Hindsight). 384 dimensions. Runs locally, zero API cost.
- **Dimension:** 384 (hardcoded in vec_embeddings virtual table DDL).
- **Upgrade path:** The embeddings table supports multiple models via the `model` column. Can add Gemini or OpenAI embeddings alongside local ones later. When swapping models, rebuild the vec_embeddings virtual table with the new dimension.
- **Hindsight reference:** `hindsight_api/config.py` — `DEFAULT_EMBEDDINGS_LOCAL_MODEL = "BAAI/bge-small-en-v1.5"`, `DEFAULT_EMBEDDING_DIMENSION = 384`. The local provider implementation lives in `hindsight_api/engine/embeddings.py` (`LocalSTEmbeddings`, `force_cpu` option for macOS daemon mode).

### Meeseeks Workspace Layout

Follow existing conventions in `~/.nexus/state/meeseeks/`:

```
~/.nexus/state/meeseeks/memory-writer/
    ROLE.md              -- Role prompt (see MEMORY_WRITER_ROLE.md)
    skills/
        cortex/
            recall.ts    -- recall() tool implementation
            write.ts     -- insert_fact, create_entity, etc.

~/.nexus/state/meeseeks/memory-injection/
    ROLE.md              -- Minimal triage prompt
    skills/
        cortex/
            recall.ts    -- recall() tool only (read-only)
```

### Hook Registration

Follow existing patterns in `~/.nexus/state/hooks/`. The memory-writer hooks into two points:

1. `finalize` -- for standalone events (eventIngested path)
2. Post-agent-turn -- for events that went through an agent session

The memory-injection hooks into `worker:pre_execution` (blocking).

Check the Nex TS event bus and hook infrastructure for existing patterns. (Go `internal/bus/bus.go` has been eliminated.)

---

## Tables Dropped from V1

| Table | Reason |
|-------|--------|
| `relationships` | Replaced by `fact_entities` junction -- facts ARE the relationships |
| `entity_aliases` | Unified into single `entities` table |
| `identity_mappings` | Absorbed into `entities` table (contacts are entities) |
| `persons` | Unified into `entities` table |
| `person_contact_links` | Contacts are entities, merge handles linking |
| `person_facts` | Facts about people live in `facts` table |
| `unattributed_facts` | Unresolved entities handled by merge_candidates |
| `merge_events` | Simplified, audit via entity merged_into chain |

---

## See Also

- `UNIFIED_ENTITY_STORE.md` -- Entity unification and IAM integration
- `MEMORY_WRITER_V2.md` -- Agentic retain flow
- `MEMORY_WRITER_ROLE.md` -- The writer's role prompt
- `MEMORY_INJECTION.md` -- Automated memory injection (read path)
- `MEMORY_SEARCH_SKILL.md` -- Agent search skill
- `MEMORY_REFLECT_SKILL.md` -- Deep research and mental model creation
- `../../ledgers/EVENTS_LEDGER.md` -- Source event schema
- `../../ledgers/IDENTITY_GRAPH.md` -- Previous identity system (superseded)
- `../MEMORY_SYSTEM.md` -- Previous memory system (superseded)
