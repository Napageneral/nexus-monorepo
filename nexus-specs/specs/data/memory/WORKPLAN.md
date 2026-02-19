# Memory System V2 — Implementation Workplan

**Status:** IMPLEMENTATION PLAN
**Created:** 2026-02-17
**Updated:** 2026-02-18
**Target:** `/Users/tyler/nexus/home/projects/nexus/nex/cortex/`

> **Canonical reference:** See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md) for the authoritative database layout. Memory tables live in `memory.db`. Entity tables live in `identity.db`. Embeddings live in `embeddings.db`. The Go cortex process is being eliminated -- all logic is being ported to TypeScript.

---

## Recommendation: One Agent, Sequential

The dependency chain is too tight for meaningful parallelization. Almost every phase depends on the previous one — you can't build recall() without the schema, can't build the writer without recall(), can't build the injection without recall(), etc. Two agents would spend most of their time blocked on each other.

One agent, working through these phases in order, is the cleanest path. Each phase is a well-defined deliverable that can be tested before moving to the next.

---

## Phase 1: Schema Migration (Big Bang)

**What:** Drop old tables, create new ones. This is the foundation everything else builds on.

**Steps:**

1. Open `internal/db/schema.sql`. Understand the current table inventory (35+ tables across three ledgers).

2. **Tables to DROP** (memory-system tables being replaced):
   - `persons`
   - `contacts`
   - `contact_identifiers`
   - `person_contact_links`
   - `identities`
   - `merge_suggestions`
   - `person_facts`
   - `unattributed_facts`
   - `candidate_mentions`
   - `merge_events`
   - `entities` (old version)
   - `entity_aliases`
   - `relationships`
   - `episode_entity_mentions`
   - `episode_relationship_mentions`
   - `merge_candidates` (old version)
   - `entity_merge_events`
   - `embeddings` (old version — replaced by new schema)

3. **Tables to KEEP in memory.db:**
   - `schema_version`
   - `episode_definitions`
   - `episodes` (add `parent_id` column)
   - `episode_events`
   - `analysis_types`
   - `analysis_runs` (add `parent_id`, `access_count`, and `is_stale BOOLEAN DEFAULT FALSE` columns)
   - `facets`

   **Tables ELIMINATED (do not keep):**
   - ~~`sync_watermarks`~~ — adapters own their sync state. See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md) section 5.
   - ~~`adapter_state`~~ — Go adapter key-value store eliminated.
   - ~~`bus_events`~~ — single Nex bus replaces cortex Go bus.
   - ~~`sync_jobs`~~ — Go sync pipeline eliminated.
   - ~~`agent_sessions`, `agent_messages`, `agent_turns`, `agent_tool_calls`~~ — duplicates of agents.db. Eliminated.

4. **Tables to CREATE in memory.db:**
   - `facts`
   - `fact_entities`
   - `causal_links`
   - `observation_facts`
   - `mental_models`
   - `memory_processing_log` (tracks which events the writer has processed — separate from events table)

   **Tables to CREATE in identity.db (entity tables relocated from old cortex.db, now eliminated):**
   - `entities` (new schema from UNIFIED_ENTITY_STORE.md)
   - `entity_cooccurrences`
   - `entity_tags`
   - `merge_candidates` (new schema)

   **Tables to CREATE in embeddings.db:**
   - `embeddings` (new schema with target_type/target_id/model)

5. **Virtual tables to CREATE:**
   - `facts_fts` (FTS5 over facts.text, in memory.db)
   - `vec_embeddings` (sqlite-vec for vector search, in embeddings.db)

6. **Triggers:**
   - FTS5 sync triggers on facts (insert/delete)

7. **Seed data:**
   - Insert the `observation_v1` analysis type into `analysis_types`
   - Insert a `consolidation` episode definition into `episode_definitions`

**Test:** Open memory.db / identity.db / embeddings.db, verify all tables exist, verify old cortex.db tables are gone (cortex.db is superseded by memory.db + identity.db + embeddings.db). Run a few inserts into facts/entities to confirm constraints work.

**Files touched:**
- `internal/db/schema.sql` — rewrite the memory system tables (Go cortex schema -- being eliminated, ported to TS)
- `nex/src/db/memory.ts` — new TS schema for memory.db
- `nex/src/db/identity.ts` — add entity tables to identity.db schema
- `nex/src/db/embeddings.ts` — new TS schema for embeddings.db

---

## Phase 2: recall() Implementation

**What:** The unified search API. Everything depends on this — the writer uses it for dedup, the injection meeseeks uses it for retrieval, agents use it via the search skill.

**Steps:**

1. **Create new module** in Nex TS (e.g., `nex/src/memory/recall/`). The old Go `internal/recall/` and `internal/search/` packages are eliminated.

2. **Implement the 4 retrieval strategies:**

   a. **Semantic search** — Query `vec_embeddings` with cosine similarity via sqlite-vec `MATCH` operator. Filter by `target_type` based on `scope` parameter.

   b. **Keyword search (FTS5)** — Query `facts_fts` with FTS5 `MATCH`. BM25 ranking built into FTS5.

   c. **Entity traversal** — Given an entity name/ID, join `fact_entities` → `facts`. If entity param is a name, first resolve via `entities` table (normalized match), follow `merged_into` chain to canonical.

   d. **Causal traversal** — Given a seed fact from other strategies, traverse `causal_links` to find causally connected facts.

3. **Implement RRF fusion:**
   - Run strategies in parallel (goroutines).
   - Each returns a ranked list of fact/observation/mental_model IDs.
   - Fuse via RRF (k=60).
   - Apply MMR for diversity (λ=0.7) using embeddings.

4. **Implement budget control:**
   - `low`: semantic only
   - `mid`: semantic + keyword + entity
   - `high`: all 4

5. **Implement filters:**
   - `scope`: filter by target_type (facts, observations via analysis_runs where type=observation, mental_models, entities). Entity scope searches entities table directly — name matching + semantic similarity on names, follows merged_into chains, returns aliases. Entity scope is NOT in the default — must be explicitly requested.
   - `entity`: entity traversal filter
   - `time_after` / `time_before`: WHERE clause on `as_of`
   - `platform`: WHERE clause on `metadata->>'source_platform'`
   - `max_results`: LIMIT

6. **Implement result formatting:**
   - Return uniform result objects: id, text, type, as_of, relevance_score, is_stale, entity_ids[], source metadata
   - For observations: read from analysis_runs.output_text where analysis_type='observation', check is_stale
   - For mental models: direct from mental_models table

7. **Expose as a TS function** that can be called from:
   - Tool implementations (for meeseeks)
   - The injection hook (direct call)
   - CLI for testing

**Reference:** Port Hindsight's `memory_engine.py` recall implementation. Translate pgvector → sqlite-vec, asyncpg → better-sqlite3, Python async → TS async.

**Test:** Insert some test facts with embeddings. Call recall() with various parameter combinations. Verify semantic search returns relevant results, entity filtering works, RRF fusion produces sensible ranking.

**Files touched:**
- `nex/src/memory/recall/recall.ts` — main recall function
- `nex/src/memory/recall/strategies.ts` — individual retrieval strategies
- `nex/src/memory/recall/fusion.ts` — RRF + MMR
- `nex/src/memory/recall/types.ts` — result types

> **Note:** The Go `internal/recall/` package is eliminated. All recall logic is implemented in TypeScript.

---

## Phase 3: Embedding Pipeline

**What:** Generate and store embeddings for facts (and later observations, mental models). Required by recall()'s semantic search.

**Steps:**

1. **Embedding model:** `BAAI/bge-small-en-v1.5` (384 dimensions). Same model Hindsight uses — see `hindsight_api/engine/embeddings.py` for the `LocalSTEmbeddings` implementation. Run locally via sentence-transformers (Python sidecar or Go embedding library). Zero API cost. The `vec_embeddings` virtual table is hardcoded to `float[384]`.

2. **Refactor `internal/compute/embeddings_batcher.go`** to:
   - Write to the new `embeddings` table schema (target_type, target_id, model, embedding, dimension)
   - Populate the `vec_embeddings` virtual table for search
   - Support facts, observations, entities, mental_models as target types

3. **Wire into the post-write pipeline:** After the Memory-Writer inserts facts, embeddings are generated. This can be synchronous (block until embedded) or async (queue for batch processing).

**Test:** Insert facts, generate embeddings, verify vec_embeddings is populated, verify recall() semantic search returns results.

**Files touched:**
- `internal/compute/embeddings_batcher.go` — refactor for new schema
- `internal/compute/engine.go` — wire embedding jobs for new fact types

---

## Phase 4: Memory-Writer Meeseeks

**What:** The agentic fact extractor. Receives events, extracts facts, resolves entities, writes to the store.

**Steps:**

1. **Create the meeseeks workspace:**
   ```
   ~/.nexus/state/meeseeks/memory-writer/
       ROLE.md          -- from MEMORY_WRITER_ROLE.md spec
       skills/
           cortex/
               recall.ts    -- recall() tool binding
               write.ts     -- insert_fact, create_entity, link_fact_entity,
                               insert_causal_link, propose_merge
   ```

2. **Implement the tool bindings:**
   - `recall` — calls the Go recall() function from Phase 2
   - `insert_fact` — INSERT into facts table, returns fact_id
   - `create_entity` — INSERT into entities table, returns entity_id
   - `link_fact_entity` — INSERT into fact_entities, UPDATE entity_cooccurrences
   - `insert_causal_link` — INSERT into causal_links
   - `propose_merge` — INSERT into merge_candidates, auto-merge if confidence > threshold (UPDATE entities SET merged_into)

3. **Wire the trigger hooks:**

   **Path 1 (agent turn complete):**
   - After a broker execution completes, fire the memory-writer meeseeks
   - Pass: the full turn content (user message + agent response + tool results)
   - Mark source event IDs as processed by inserting into `memory_processing_log` table (created in Phase 1)

   **Path 2 (standalone event / eventIngested):**
   - Register a hook on event finalization
   - Check if event is already memory-processed → skip
   - Fork the memory-writer meeseeks with: raw event + deliveryContext
   - The writer uses recall() to gather context about sender/thread

4. **Test end-to-end:** Send a test event through each path. Verify facts appear in the facts table, entities in entities table, links in fact_entities.

**Files touched:**
- Meeseeks workspace files (ROLE.md, skill scripts)
- Hook registration (automation config)
- Tool binding implementations (likely TypeScript in nex/src/)
- Event processing pipeline (wherever hooks fire)

---

## Phase 5: Consolidation Worker

**What:** Background job that processes unconsolidated facts into observations.

**Steps:**

1. **Create the consolidation job** in the compute engine:
   - Query: `SELECT * FROM facts WHERE is_consolidated = FALSE ORDER BY created_at ASC`
   - For each fact:
     a. Recall related observations and facts
     b. Decide: worth creating/updating an observation? (Skip isolated facts)
     c. If yes: find or create a knowledge-episode, run the observation analysis type
     d. Create/update analysis_run (observation text goes in `output_text`, no facet needed)
     e. Insert into observation_facts junction
     f. Mark fact as `is_consolidated = TRUE`
     g. Commit per fact (crash-recoverable)

2. **Register the observation analysis type:**
   - Use the consolidation prompt from MEMORY_WRITER_V2.md (adapted from Hindsight's consolidation prompts)
   - Insert into `analysis_types` with name `observation_v1`

3. **Wire staleness:** When a new observation is created/updated that's linked to a mental model, set `is_stale = TRUE` on that mental model.

4. **Schedule:** Run after the memory-writer completes (triggered by new unconsolidated facts), or periodically.

**Reference:** Port Hindsight's `consolidator.py`. The per-fact processing with individual commits is directly translatable.

**Test:** Insert facts, run consolidation, verify observations appear as analysis_runs (output_text populated), verify observation_facts links exist.

**Files touched:**
- `internal/compute/engine.go` — add consolidation job handler
- Consolidation prompt (embedded or in analysis_types)

---

## Phase 6: Memory Injection Meeseeks

**What:** The lightweight read-path meeseeks that injects memory into worker contexts.

**Steps:**

1. **Create the meeseeks workspace:**
   ```
   ~/.nexus/state/meeseeks/memory-injection/
       ROLE.md          -- minimal triage prompt from MEMORY_INJECTION.md
       skills/
           cortex/
               recall.ts    -- recall() tool (read-only, same as writer's)
   ```

2. **Register the automation:**
   - Hook point: `worker:pre_execution`
   - Blocking: yes
   - Timeout: 3 seconds
   - Model: fast cheap model (gpt-5.3-codex-spark or equivalent)

3. **Implement the dispatch script:**
   - Fork the injection meeseeks with the worker's task description
   - Meeseeks calls recall() 1-3 times
   - Returns selected relevant facts as `<memory_context>` block (or nothing if irrelevant)
   - Enrichment injected into worker's currentMessage

**Test:** Dispatch a worker with a task mentioning known entities/facts. Verify memory context appears in the worker's prompt.

**Files touched:**
- Meeseeks workspace files
- Automation registration
- Dispatch script

---

## Phase 7: Memory Search + Reflect Skills

**What:** Skill files that agents import for on-demand memory search and reflection.

**Steps:**

1. **Create the skill files** in the appropriate skills directory. These are markdown files following existing skill conventions.

2. **Memory Search skill** — teaches agents how to use recall() with all parameters, query decomposition, staleness awareness, budget management.

3. **Memory Reflect skill** — teaches agents how to do deep multi-step research and persist results as mental models. Includes create_mental_model() and update_mental_model() tool descriptions.

4. **Wire the mental model tools:**
   - `create_mental_model(name, description, entity_id?, tags?, subtype?)`
   - `update_mental_model(id, description)` — creates new version with parent_id

**Test:** An agent imports the skill, calls recall() and create_mental_model(), verify the mental model appears in the DB.

**Files touched:**
- Skill markdown files
- Mental model tool bindings

---

## Phase 8: Cleanup + Backfill

**What:** Remove dead code from the old system. Set up backfill pipeline.

**Steps:**

1. **Delete old Go memory pipeline code** (all eliminated, ported to TS):
   - `internal/memory/pipeline.go` and all related files (auto_merger, collision_detector, contradiction_detector, entity_extractor, entity_resolver, relationship_extractor, edge_resolver, identity_promoter, entity_embedder, entity_types, query_engine, verify, debug)
   - `internal/identify/` package (facts.go, identify.go, resolve.go, suggestions.go, sync.go)
   - `internal/contacts/contacts.go`
   - Old search code in `internal/search/` that references dropped tables
   - `internal/adapters/` — all Go adapters (already ported to TS)
   - `internal/sync/` — Go sync pipeline (adapters own their sync state)
   - `internal/bus/` — Go bus (single Nex bus)
   - `internal/state/` — Go adapter state store

2. **Update references:** Find all code that imports/calls the deleted packages. Update to use the new recall() package or remove.

3. **Backfill pipeline:**
   - Create a CLI command or script: `nexus memory backfill --platform imessage --from 2024-01-01`
   - Groups events into episodes (uses existing episode definitions, target 4-8K tokens per episode)
   - Processes episodes sequentially per platform through the Memory-Writer meeseeks
   - Supports OAuth quota rotation across accounts
   - Crash-recoverable (tracks progress per-episode)
   - Can be paused/resumed

**Test:** Run backfill on a small set of historical events. Verify facts/entities/links are created correctly.

**Files touched:**
- Delete ~25 files in internal/memory/ and internal/identify/
- Update imports across the codebase
- New backfill CLI command

---

## Phase Order Summary

```
Phase 1: Schema Migration         -- foundation, everything depends on this
    |
    v
Phase 2: recall() Implementation  -- the core API, writer + injection depend on this
    |
    v
Phase 3: Embedding Pipeline       -- recall() semantic search needs this
    |
    v
Phase 4: Memory-Writer Meeseeks   -- needs recall() for dedup + schema for writes
    |
    v
Phase 5: Consolidation Worker     -- needs facts in DB (from writer) + recall()
    |
    v
Phase 6: Memory Injection         -- needs recall() working
    |
    v
Phase 7: Skills                   -- needs recall() + mental_models table
    |
    v
Phase 8: Cleanup + Backfill       -- after everything works, remove old code
```

Phases 6 and 7 could technically run in parallel with Phase 5 (they only need recall, not consolidation). But with one agent it's simpler to go in order.

---

## Testing Strategy

Each phase should be testable independently:

1. **Schema:** `sqlite3 memory.db ".tables"` + `sqlite3 identity.db ".tables"` — verify table inventory
2. **recall():** Insert test data, call recall(), verify results
3. **Embeddings:** Insert facts, generate embeddings, verify vec search works
4. **Writer:** Send events, verify facts/entities appear
5. **Consolidation:** Insert facts, run consolidation, verify observations
6. **Injection:** Dispatch worker, verify memory context in prompt
7. **Skills:** Agent uses skill, verify tool calls work
8. **Backfill:** Process historical events, verify facts created

---

## Estimated Scope

| Phase | Files | Complexity |
|-------|-------|------------|
| 1. Schema | 2 | Medium (careful table surgery) |
| 2. recall() | 4 new | High (core retrieval engine) |
| 3. Embeddings | 2 | Medium (refactor existing) |
| 4. Writer | 5-8 | High (tools, hooks, workspace) |
| 5. Consolidation | 2 | Medium (port from Hindsight) |
| 6. Injection | 3 | Low (simple meeseeks + hook) |
| 7. Skills | 3 | Low (markdown + tool bindings) |
| 8. Cleanup | ~30 deletions | Medium (careful, lots of files) |

Total: ~20 new/modified files, ~30 deleted files. The recall() implementation and writer tooling are the heaviest lifts.
