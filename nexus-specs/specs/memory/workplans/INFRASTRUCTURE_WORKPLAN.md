# Memory V2 Infrastructure Improvements — Workplan

**Status:** IMPLEMENTATION PLAN
**Created:** 2026-02-19
**Depends On:** MEMORY_SYSTEM.md, `../_archive/WORKPLAN.md` (Phases 1-8 complete, archived)
**Context:** All 8 phases of the original WORKPLAN.md have been implemented. This workplan covers infrastructure improvements, recall parity with Hindsight, and agent experience refinements identified during review.

---

## Overview

This workplan covers non-backfill improvements to the memory system. These are refinements to existing infrastructure: embedding provider swappability, recall API parity with Hindsight's retrieval engine, agent prompt enrichment, and writer tool scope changes.

A separate spec document (`RETAIN_PIPELINE.md`) covers the backfill pipeline redesign (episode-based batching, short-term memory, and consolidation batching). That spec adds:
- A 5th recall retrieval strategy (short-term/unretained events via `is_retained` flag on the events table)
- Recall is now fully TypeScript (`src/memory/recall.ts`) — all Go file references have been updated accordingly
- The consolidation pipeline moves to episode-batched processing with causal link detection (moved from writer)
- Filters are stored as SQL WHERE clauses in `memory_filters` table in runtime.db

Items in this workplan are independent of the retain pipeline work and can be implemented in parallel.

---

## Item 1: Embedding Provider Abstraction

**What:** Make it easy to swap embedding models and providers without code changes.

**Why:** The current implementation hardcodes `BAAI/bge-small-en-v1.5` (384 dims) via node-llama-cpp GGUF. This is fine for local development but we need the ability to swap to stronger models (bge-large, OpenAI text-embedding-3-small, Cohere embed-english-v3.0) without touching implementation code. Hindsight supports 6 providers via an abstract interface and env var switching.

**Design:**

```typescript
// Abstract interface
interface EmbeddingProvider {
  readonly providerName: string;
  readonly dimension: number;
  initialize(): Promise<void>;
  encode(texts: string[]): Promise<number[][]>;   // batch encode
  embedQuery(text: string): Promise<number[]>;     // single encode
}

// Factory — provider selected via config/env
function createEmbeddingProvider(config: EmbeddingConfig): Promise<EmbeddingProvider>;

// Config structure
interface EmbeddingConfig {
  provider: 'local' | 'openai' | 'cohere' | 'litellm';
  model?: string;           // provider-specific model name
  apiKey?: string;          // for remote providers
  baseUrl?: string;         // for custom endpoints
  batchSize?: number;       // default: 100
  local?: {
    modelPath?: string;     // GGUF path for local
    forceCpu?: boolean;
  };
}
```

**Key behaviors:**
- Auto-dimension detection at initialization (run test embedding, read vector length)
- Batch encode for bulk operations (backfill, reindexing)
- Environment variable override: `NEXUS_EMBEDDINGS_PROVIDER=openai`, `NEXUS_EMBEDDINGS_MODEL=text-embedding-3-small`, `NEXUS_EMBEDDINGS_API_KEY=sk-...`
- The `vec_embeddings` virtual table dimension must match the provider's dimension. On model change, the vec table needs to be rebuilt from the `embeddings` table (which stores model metadata).
- The `embeddings` table already has a `model` column — multi-model coexistence is already supported at the storage layer.

**Steps:**
1. Refactor existing `createEmbeddingProvider` in `src/memory/embeddings.ts` to match the abstract interface above
2. Add `encode(texts[])` batch method to all providers (current only has `embedQuery`)
3. Add dimension auto-detection (embed a test string, read length)
4. Add OpenAI provider (HTTP calls to embeddings API)
5. Add environment variable configuration loading
6. Update the embedding provider factory in `src/memory/embeddings.ts` to use the new interface
7. Remove hardcoded `EMBEDDING_DIMENSIONS = 384` from writer-tools and consolidation — read from provider
8. Add a CLI command or utility to rebuild vec_embeddings when switching models

**Files touched:**
- `src/memory/embeddings.ts` — refactor to abstract interface
- `src/memory/embeddings.ts` — use new factory
- `src/agents/tools/memory-writer-tools.ts` — remove hardcoded dimension
- `src/memory/consolidation.ts` — remove hardcoded dimension

---

## Item 2: Memory Injection Timeout + Spec Cleanup

**What:** Update the memory injection meeseeks timeout and remove outdated latency targets from the spec.

**Changes:**
1. Update `timeout_ms` from `3000` to `60000` in the bundled automation registration (seeder.ts)
2. Remove the "Target latency < 1 second" language from ../skills/MEMORY_INJECTION.md — this was aspirational and too restrictive
3. Update the spec to say: "The injection meeseeks has a 60-second timeout. It should complete as fast as possible but is allowed to take longer for large inputs. The fast model and simple task keep typical latency under 10 seconds."

**Files touched:**
- `src/nex/automations/seeder.ts` — change timeout_ms
- `../skills/MEMORY_INJECTION.md` — update timeout and latency language

---

## Item 3: Deconstrain Memory Injection Meeseeks

**What:** Remove the fixed "1-3 recall calls" constraint from the injection meeseeks. Allow it to short-circuit with zero calls or search more extensively for rich inputs.

**Changes to ../skills/MEMORY_INJECTION.md spec:**
1. Remove "Max Turns: 2-3 turns max" — replace with: "The injection meeseeks should use its judgment on how many recall calls to make. For simple tasks or ones unlikely to have relevant memory, return nothing immediately without searching. For tasks rich with entities and context, search multiple times along different dimensions."
2. Add explicit short-circuit guidance: "If the task is purely computational (math, code generation with no personal context), or if the content contains no entity references or personal context, return nothing immediately. Do not search just to search."
3. Add high-end guidance: "For large inputs mentioning multiple entities, topics, or time periods, search along each dimension separately. There is no hard cap on recall calls — the timeout is the natural constraint."
4. Keep the overall philosophy: "This is a best-effort quick scan, not a research project. The main agent can use the Memory Search skill for deeper exploration."

**Files touched:**
- `../skills/MEMORY_INJECTION.md` — update turn/call guidance

---

## Item 4: Recall Parity — Multi-Hop Graph Traversal (MPFP)

**What:** Implement multi-hop typed-edge graph traversal in the recall API, equivalent to Hindsight's Meta-Path Forward Push algorithm.

**Why:** Our current recall does one-hop entity traversal and one-hop causal traversal. Hindsight's MPFP follows typed meta-paths through multiple hops (e.g., `[semantic, entity]` = "find semantically similar facts, then find facts sharing entities with those"). This discovers connections that single-hop misses.

**Design — Query-Time Edge Computation (No Precalculated Links):**

Unlike Hindsight, we do NOT precalculate link edges. All edges are computed at query time via indexed queries:

- **Semantic edge:** `WHERE embedding MATCH ?node_embedding AND k = ?top_k` (KNN query per node)
- **Entity edge:** `SELECT DISTINCT fe2.fact_id FROM fact_entities fe1 JOIN fact_entities fe2 ON fe1.entity_id = fe2.entity_id WHERE fe1.fact_id = ?node` (facts sharing entities)
- **Temporal edge:** `WHERE as_of BETWEEN ?node_as_of - 86400000 AND ?node_as_of + 86400000 ORDER BY ABS(as_of - ?node_as_of)` (24hr window, closest first)
- **Causal edge:** `SELECT to_fact_id FROM causal_links WHERE from_fact_id = ?node UNION SELECT from_fact_id FROM causal_links WHERE to_fact_id = ?node`

**Meta-path patterns to implement:**
```
From semantic seeds:
  ["semantic", "entity"]    — similar facts → their entity-linked facts
  ["semantic", "temporal"]  — similar facts → their temporal neighbors
  ["semantic", "causal"]    — similar facts → their causal chains

From entity seeds:
  ["entity", "semantic"]    — entity-linked facts → their semantic neighbors
  ["entity", "temporal"]    — entity-linked facts → their temporal neighbors
```

**Algorithm:**
```
For each meta-path pattern:
  1. Start with seed facts from initial retrieval (semantic/keyword search results)
  2. For each hop in the pattern:
     a. Compute edges of the specified type for frontier nodes
     b. Apply activation decay: score *= (1 - alpha) * edge_weight
     c. Prune nodes below threshold
     d. New frontier = expanded nodes
  3. Collect all visited nodes with their accumulated scores

Merge scores across all patterns → feed into RRF fusion
```

**Configuration:**
- Alpha (teleport/retain): 0.15
- Threshold: 1e-6
- Top-k neighbors per hop: 20
- Max hops: 2 (sufficient for most retrieval, keeps latency bounded)

**Budget control:**
- `low`: No graph traversal (semantic only)
- `mid`: Link expansion (see Item 6) — fast 1-hop, 2-3 queries
- `high`: Full MPFP — multi-hop typed-edge traversal

**Steps:**
1. Create `src/memory/recall/graph.ts` — MPFP implementation
2. Define meta-path patterns as configuration
3. Implement per-hop edge computation functions (semantic, entity, temporal, causal)
4. Wire into recall pipeline as a new strategy alongside existing ones
5. Feed MPFP results into RRF fusion

> **Note:** Recall has been fully ported to TypeScript (`src/memory/recall.ts`). The Go `internal/recall/` package is no longer used. All new recall work is TypeScript.

**Files touched:**
- `src/memory/recall/graph.ts` — new file, MPFP implementation
- `src/memory/recall.ts` — wire graph strategy into parallel execution
- `src/memory/recall/strategies.ts` — may need new file or refactor

---

## Item 5: Recall Parity — Temporal Retrieval Strategy

**What:** Add a dedicated temporal retrieval strategy with query-time temporal constraint extraction and proximity-based decay scoring.

**Why:** Our current recall only supports `time_after`/`time_before` as hard WHERE clause filters. Hindsight has dedicated temporal retrieval that extracts time expressions from queries ("last week", "in January") and retrieves facts with temporal proximity scoring (closer to target time = higher relevance).

**Design:**

**Step 1 — Temporal Constraint Extraction:**
Parse the query text for temporal expressions and resolve to absolute timestamps:
- Relative: "yesterday", "last week", "3 months ago", "recently"
- Absolute: "in January", "on February 14", "in 2025"
- Contextual: "before the wedding", "after Tyler started at Anthropic" (these require entity-time lookup — stretch goal)

Use the current date as reference for relative expressions. This is a lightweight parsing step, no LLM needed (regex/rule-based).

**Step 2 — Temporal Retrieval:**
```sql
SELECT id, text, as_of,
       1.0 / (1.0 + ABS(as_of - ?target_time) / ?decay_window) AS temporal_score
FROM facts
WHERE as_of BETWEEN ?target_time - ?window AND ?target_time + ?window
ORDER BY temporal_score DESC
LIMIT ?max_results
```

Where `decay_window` controls how fast relevance drops off with temporal distance.

**Step 3 — Temporal Spreading:**
After initial temporal retrieval, boost facts that are temporally adjacent to already-high-scoring facts from other strategies. This is handled naturally by the MPFP temporal edge (Item 4), but as a standalone strategy it adds temporal neighbors of seed facts.

**Budget control:**
- `low`: No temporal retrieval
- `mid`: Temporal retrieval only when a temporal constraint is detected in the query
- `high`: Always include temporal retrieval

**Steps:**
1. Create temporal constraint parser (TypeScript, rule-based)
2. Implement temporal retrieval strategy with decay scoring
3. Wire into recall as an additional parallel strategy alongside short-term events (see RETAIN_PIPELINE.md — short-term event retrieval is the 5th strategy added by the retain pipeline work; temporal becomes the 6th)
4. Feed results into RRF fusion

> **Note:** Recall is fully TypeScript. Short-term event retrieval (querying unretained events via `is_retained = FALSE`) is being added as a 5th strategy by the retain pipeline work. Temporal retrieval is a separate strategy on top of that.

**Files touched:**
- `src/memory/recall/temporal.ts` — new file, temporal parsing + retrieval
- `src/memory/recall.ts` — wire temporal strategy
- `src/memory/recall/strategies.ts` — temporal spreading helper

---

## Item 6: Recall Parity — Link Expansion (Fast Path)

**What:** Implement a fast 1-hop graph expansion strategy (2-3 DB queries total) as the default graph strategy for mid-budget queries.

**Why:** Full MPFP (Item 4) is thorough but slower. For mid-budget queries, we want "good enough graph results, really fast." Hindsight's link expansion targets <100ms with only 2-3 queries.

**Design:**

**Query 1 — Entity co-occurrence expansion:**
```sql
SELECT DISTINCT fe2.fact_id, e.mention_count
FROM fact_entities fe1
JOIN fact_entities fe2 ON fe1.entity_id = fe2.entity_id
JOIN identity.entities e ON e.id = fe1.entity_id
WHERE fe1.fact_id IN (?seed_fact_ids)
  AND fe2.fact_id NOT IN (?seed_fact_ids)
  AND e.mention_count < 500  -- filter out overly common entities
ORDER BY e.mention_count ASC  -- prefer specific entities
LIMIT 50
```

**Query 2 — Causal link expansion:**
```sql
SELECT to_fact_id AS fact_id, strength FROM causal_links WHERE from_fact_id IN (?seeds)
UNION
SELECT from_fact_id AS fact_id, strength FROM causal_links WHERE to_fact_id IN (?seeds)
```

**Query 3 (fallback, if <10 results):** Semantic neighbors of seed facts at 0.5x weight.

**Score assignment:**
- Entity co-occurrence: `1.0 / (1 + log(mention_count))` (rare entities score higher)
- Causal links: `strength` value directly
- Fallback semantic: `0.5 * semantic_score`

**Budget control:**
- `mid`: Use link expansion as graph strategy
- `high`: Use full MPFP (Item 4)

**Steps:**
1. Implement link expansion in `src/memory/recall/link_expansion.ts`
2. Wire as the graph strategy for mid-budget queries
3. Feed results into RRF fusion

**Files touched:**
- `src/memory/recall/link_expansion.ts` — new file
- `src/memory/recall.ts` — wire link expansion for mid budget

---

## Item 7: Recall Query Optimization — Combined CTE

**What:** Combine semantic search + FTS5 keyword search into a single SQL query using CTEs, reducing DB round-trips.

**Why:** Currently semantic and keyword search run as separate parallel queries. Combining them into one query with CTEs reduces connection overhead and allows the query planner to optimize across both. Hindsight does this and reports meaningful latency improvements.

**Design:**
```sql
WITH semantic AS (
    SELECT target_id AS id, distance AS score, 'semantic' AS source
    FROM vec_embeddings
    WHERE target_type = 'fact'
      AND embedding MATCH ?query_embedding
      AND k = ?limit
),
keyword AS (
    SELECT f.id, bm25(facts_fts) AS score, 'keyword' AS source
    FROM facts_fts
    JOIN facts f ON f.rowid = facts_fts.rowid
    WHERE facts_fts MATCH ?query_text
    ORDER BY score
    LIMIT ?limit
)
SELECT * FROM semantic
UNION ALL
SELECT * FROM keyword
```

This may need adaptation depending on sqlite-vec's compatibility with CTEs. Test and verify.

**Steps:**
1. Prototype combined CTE query, verify sqlite-vec compatibility
2. Benchmark against current separate queries
3. If faster, replace current implementation
4. Extend pattern to include observations and mental models in same CTE

**Files touched:**
- `src/memory/recall.ts` (or `recall/strategies.ts`) — refactor semantic + keyword into combined query

---

## Item 8: Recall Parity — Cross-Encoder Reranking (Future)

**What:** Add an optional cross-encoder reranking step after RRF fusion for improved result quality.

**Priority:** LOW — implement after Items 4-7. The current RRF + MMR pipeline produces reasonable results. Cross-encoder reranking is a quality improvement for when the system is mature and we want to squeeze out better precision.

**Design:**
- After RRF fusion produces top-N candidates (e.g., 50), run a cross-encoder model on (query, candidate_text) pairs
- Rerank by cross-encoder score, return top-K
- Model: `cross-encoder/ms-marco-MiniLM-L-6-v2` or similar, run locally
- Optional: only enable for `high` budget queries

**Steps:**
1. Add reranker provider abstraction (same pattern as embedding provider)
2. Implement local cross-encoder via node-llama-cpp or sentence-transformers sidecar
3. Wire into recall pipeline as optional post-fusion step

**No files listed — future work.**

---

## Item 9: Writer Tool Scope Changes

**What:** Remove tools from the memory-writer meeseeks that belong in other pipelines.

**Remove from writer:**
1. `insert_causal_link` — causal link detection moves to the consolidation pipeline where the full fact graph is visible. The writer sees one episode in isolation; consolidation sees cross-episode and cross-platform relationships.
2. `create_mental_model` — mental model creation belongs in the reflect skill only. The writer can READ mental models via recall (for extraction context) but should not create or update them.
3. `update_mental_model` — same as above.

**Keep in writer:**
- `recall` — for dedup checks, entity resolution, gathering context
- `insert_fact` — core extraction output
- `create_entity` — entity creation during extraction
- `link_fact_entity` — linking facts to entities
- `propose_merge` — entity merge proposals during resolution

**Steps:**
1. Remove `insert_causal_link`, `create_mental_model`, `update_mental_model` from the memory writer tools (`createMemoryWriterTools`)
2. Update MEMORY_WRITER_ROLE.md to remove causal link and mental model sections
3. Update MEMORY_WRITER.md spec to reflect the scope change
4. Add causal link detection to the consolidation pipeline prompt/logic

**Files touched:**
- `src/agents/tools/memory-writer-tools.ts` — remove 3 tools
- `MEMORY_WRITER_ROLE.md` — update role prompt
- `../MEMORY_WRITER.md` — update spec
- `src/memory/consolidation.ts` — add causal link detection to consolidation prompt

---

## Item 10: Writer Role Prompt — Architecture Context

**What:** Add a "Big Picture" section to the writer's role prompt so it understands the overall memory architecture, not just its own tools.

**Add to MEMORY_WRITER_ROLE.md:**

```markdown
## Big Picture — How Your Work Fits In

You are one stage in a multi-layer memory architecture:

1. **Events** (Layer 1) — Raw immutable messages from all platforms. You receive these.
2. **Facts** (Layer 2) — Atomic extracted knowledge. YOU CREATE THESE.
3. **Observations** (Layer 3) — Synthesized durable knowledge. Created by the consolidation
   pipeline AFTER you finish, by clustering your facts and reasoning about them.
4. **Mental Models** (Layer 4) — High-level reports. Created by agents using the reflect skill.

Your facts are the foundation everything else is built on. Quality facts → quality observations → quality mental models. Extract carefully.

### Entity System
Entities live in identity.db, shared with the routing system. When you create or merge entities,
you directly affect how messages get routed to sessions. The `merged_into` chain is a union-find
structure — always follow it to find the canonical entity.

Delivery-sourced entities (created when a message arrives from a new sender) are sparse — just a
platform handle. You ENRICH these by linking facts to them and merging them with person entities
when you discover real names. Don't create duplicate entities for handles that already exist.

### What Happens After You Finish
1. Embeddings are generated for your facts (algorithmic, not your concern)
2. The consolidation pipeline processes your facts:
   - Searches for related facts and observations
   - Creates/updates observations (synthesized knowledge)
   - Detects causal relationships between facts
   - Proposes entity merges it discovers
3. Your facts become searchable via recall() by other agents immediately after embedding
```

**Steps:**
1. Add the above section to MEMORY_WRITER_ROLE.md
2. Also add entity resolution carefulness guidance — specifically the "same name, different person" case (e.g., two different Tylers) and nickname tracking (e.g., "Ty" → Tyler)

**Files touched:**
- `MEMORY_WRITER_ROLE.md` — add architecture context

---

## Item 11: Enriched Inline Skill Markdown

**What:** The search and reflect skills seeded into meeseeks workspaces are bare-minimum summaries (~20 lines). Enrich them to include architecture context, query decomposition guidance, staleness handling, and anti-patterns from the full spec documents.

**Why:** Agents using these skills don't know about the 4-layer architecture, don't understand what observations are or why they get stale, and don't have the query decomposition examples that make search effective.

**Target:** Expand each inline skill from ~20 lines to ~80-100 lines. Include:

**For Memory Search Skill:**
1. Brief architecture overview (4 layers, what each is)
2. The recall() tool with all parameters
3. Hierarchical retrieval strategy (mental models → observations → facts) with reasoning
4. Query decomposition examples (don't echo the user's question, break into components)
5. Staleness awareness (what it means, when to verify, when to ignore)
6. Entity-scoped search vs query-only search guidance
7. Budget selection heuristic
8. Key anti-patterns (hallucinate before searching, over-search, ignore staleness)

**For Memory Reflect Skill:**
1. Brief architecture overview
2. The reflection process (assess → hierarchical search → synthesize)
3. Mental model CRUD (create_mental_model, update_mental_model)
4. Evidence guardrails (must search before answering, citation tracking)
5. When to create vs not create a mental model
6. Budget-aware research depth

**Steps:**
1. Expand `MEMORY_SEARCH_SKILL_MD` inline constant in `hooks-runtime.ts`
2. Expand `MEMORY_REFLECT_SKILL_MD` inline constant in `hooks-runtime.ts`
3. Verify the seeded files include the enriched content

**Files touched:**
- `src/nex/automations/hooks-runtime.ts` — expand inline skill markdown constants

---

## Item 12: Entity Resolution Provenance Tracking

**What:** Track which event/fact/episode triggered an entity resolution decision, making future split/merge auditing easier.

**Why:** When an entity is extracted and resolved (linked to existing, created new, or merged), we need to know WHY that decision was made and WHAT evidence supported it. This enables:
- Auditing entity merges that were incorrect
- Splitting entities that were wrongly merged
- Understanding the provenance chain for any entity

**Design:**

Add an `entity_resolution_log` table to memory.db:

```sql
CREATE TABLE entity_resolution_log (
    id              TEXT PRIMARY KEY,   -- ULID
    entity_id       TEXT NOT NULL,      -- the entity that was resolved/created/merged
    action          TEXT NOT NULL,      -- 'created', 'linked', 'merged', 'split'
    source_fact_id  TEXT,               -- the fact that triggered this resolution
    source_event_id TEXT,               -- the source event
    evidence        TEXT,               -- JSON: reasoning, confidence, context
    created_at      INTEGER NOT NULL
);

CREATE INDEX idx_entity_resolution_log_entity ON entity_resolution_log(entity_id);
CREATE INDEX idx_entity_resolution_log_fact ON entity_resolution_log(source_fact_id);
```

**Steps:**
1. Add table to memory.db schema
2. Update writer tools to log resolution decisions when creating/linking/merging entities
3. Update consolidation to log merge proposals it makes
4. Wire a CLI query for auditing: `nexus memory entities --audit <entity_id>`

**Files touched:**
- `src/db/memory.ts` — add entity_resolution_log table
- `src/agents/tools/memory-writer-tools.ts` — log resolutions
- `src/memory/consolidation.ts` — log merge proposals

---

## Implementation Order

```
Item 2:  Injection Timeout (trivial)
Item 3:  Deconstrain Injection (spec update only)
Item 9:  Writer Tool Scope (remove 3 tools)
Item 10: Writer Architecture Context (role prompt update)
Item 11: Enriched Skills (inline markdown expansion)
    |
    v
Item 1:  Embedding Provider Abstraction (infrastructure)
Item 12: Entity Resolution Provenance (schema + tool updates)
    |
    v
Item 7:  Combined CTE Query (optimization)
Item 6:  Link Expansion Fast Path (new strategy)
Item 5:  Temporal Retrieval (new strategy)
Item 4:  MPFP Graph Traversal (new strategy, most complex)
    |
    v
Item 8:  Cross-Encoder Reranking (future, low priority)
```

Items 2, 3, 9, 10, 11 are spec/config changes — fast, no new logic.
Items 1, 12 are moderate infrastructure work.
Items 4-7 are the recall parity improvements — ordered by complexity.
Item 8 is future work.

---

## Validation

After implementing each item:
1. **Recall quality:** Run test queries, verify new strategies return relevant results
2. **Performance:** Benchmark recall latency at each budget level. Target: low <50ms, mid <200ms, high <500ms
3. **Writer quality:** Run the writer on test events, verify it uses the enriched role prompt effectively
4. **Embedding swap:** Switch to OpenAI embeddings via env var, verify recall still works
5. **Entity provenance:** Create/merge entities, verify resolution log is populated and auditable
