# Memory Recall — Search API Specification

**Status:** CANONICAL SPEC
**Last Updated:** 2026-03-02
**Related:** MEMORY_SYSTEM.md, MEMORY_STORAGE_MODEL.md, skills/MEMORY_SEARCH_SKILL.md

---

## Overview

Recall is the unified search interface for the memory system. It searches across all four layers (events, facts, observations, mental models) using multiple retrieval strategies in parallel, fused via Reciprocal Rank Fusion (RRF).

Recall is exposed as a CLI command (`nexus memory recall`) available to all agents. The CLI sends an IPC request to the NEX daemon, which executes the core recall function and returns JSON to stdout. Specialized search behavior is taught through skill prompts (Memory Search Skill, Memory Reflect Skill), not through different tool surfaces.

---

## API

The function signature below describes the core contract — what the operation does, its parameters, and its return type. The CLI surface maps these to `--flag` arguments (see `environment/interface/cli/COMMANDS.md`).

```
recall(query, params)

Parameters:
  query                    string (required)   Natural language search query
  scope                    string[]            Element types to search: ['facts', 'observations', 'mental_models', 'entities']
                                               Default: facts + observations + mental_models
                                               Maps to: elements WHERE type IN (...) + entities table
  entity                   string              Filter by entity name or ID
  time_after               integer             Only results after this timestamp (unix ms)
  time_before              integer             Only results before this timestamp (unix ms)
  platform                 string              Filter by source platform
  thread_id                string              Thread scope for event retrieval/lookback
  thread_lookback_events   integer             Include up to N recent prior events from thread
  max_results              integer             Maximum results (default: 20)
  budget                   string              Search depth: 'low', 'mid', 'high'

  canonical_only           boolean             For entity scope: only return canonical entities (merged_into IS NULL)

Returns:
  RecallResult with grouped arrays + ranked interleaved list.
  See § Result Types below for full type definitions.
```

### Result Types

Results are returned both as **grouped arrays by type** and as a single **ranked interleaved list**. This gives consumers the best of both worlds: type-specific access when you know what you want, and a unified ranking when you want "the most relevant things regardless of type."

```typescript
interface RecallResult {
  query: string;
  ranked: RecallResultItem[];         // all types, ranked by score
  facts: FactResult[];
  observations: ObservationResult[];
  mental_models: MentalModelResult[];
  entities: EntityResult[];
  events: EventResult[];
  embedding_error?: string;
}

// Discriminated union for the ranked list
type RecallResultItem =
  | FactResult
  | ObservationResult
  | MentalModelResult
  | EntityResult
  | EventResult;

interface FactResult {
  type: "fact";
  id: string;                        // elements.id
  score: number;
  content: string;                   // elements.content (was facts.text)
  as_of: number;                     // elements.as_of
  entity_ids: string[];              // via element_entities
  source_set_id?: string;            // derived: jobs.input_set_id → sets.id (the episode set)
  source_event_id?: string;          // elements.source_event_id
}

interface ObservationResult {
  type: "observation";
  id: string;                        // elements.id
  score: number;
  content: string;                   // elements.content (was analysis_runs.output_text)
  parent_id?: string;                // elements.parent_id — older version this revises
  successor_id?: string;             // derived via LEFT JOIN: newer version's parent_id = this id (null = HEAD)
  source_set_id?: string;            // derived: jobs.input_set_id → sets.id (the consolidation input set)
}

interface MentalModelResult {
  type: "mental_model";
  id: string;                        // elements.id
  score: number;
  name: string;                      // from elements.metadata JSON {"name": "..."}
  content: string;                   // elements.content (was mental_models.description)
  entity_id?: string;                // elements.entity_id
  pinned: boolean;                   // elements.pinned
  parent_id?: string;                // elements.parent_id — older version this revises
  successor_id?: string;             // derived via LEFT JOIN (null = HEAD)
}

interface EntityResult {
  type: "entity";
  id: string;
  score: number;
  name: string;
  entity_type?: string;
  is_user: boolean;
  aliases?: string[];
  mention_count: number;
}

interface EventResult {
  type: "event";
  id: string;
  score: number;
  text: string;                      // maps to events.content
  timestamp: number;
  platform: string;
  sender_id: string;                 // events.sender_id
  sender_name?: string;              // derived: events.sender_id → contacts.contact_id → contacts.contact_name → entities.name
  thread_id?: string;
}
```

> **Design Decision: Hybrid result structure (grouped + ranked).**
>
> We considered three approaches:
> 1. **Single flat list with metadata bag:** All types forced into one interface with `metadata: Record<string, unknown>`. Loses type safety, creates cognitive overhead, metadata keys are undocumented. This was the V2 approach — it caused confusion and bugs.
> 2. **Grouped arrays only:** Clean type-specific access but loses cross-type ranking. When asking "what do I know about Casey?", the most relevant result could be a fact, observation, or entity — grouping forces the consumer to compare across arrays manually.
> 3. **Hybrid (chosen):** Grouped arrays for type-specific access + ranked interleaved list for cross-type relevance. Best of both worlds. The ranked list uses a discriminated union so TypeScript narrows types after checking the `type` field. Each type has its own proper shape with the fields that make sense for it.

---

## Retrieval Strategies

### Current (Implemented)

**1. Semantic Search**
KNN on element embeddings via `vec_embeddings` (scoped by `target_type`). The primary relevance signal. Searches across all element types — facts, observations, and mental models all have embeddings.

**2. Keyword Search (FTS5)**
Full-text search via SQLite FTS5 on `elements_fts`. The unified FTS5 index covers ALL element types in one index — facts, observations, and mental models are all first-class FTS citizens. Previously only facts had FTS (`facts_fts`); observations and mental models were searched with `LIKE`, which was slower and lacked ranking. Catches exact term matches that semantic search might rank lower.

**3. Entity Traversal**
1-hop co-occurrence via `element_entities` junction. Given seed elements, find other elements that share entities. Applies across all element types — observations and mental models can now have entity links, not just facts.

**4. Link Traversal**
Follow `element_links` edges in both directions from seed elements. Supports typed link traversal: `causal`, `supports`, `contradicts`, `supersedes`, `derived_from`. The old `causal_links` table only supported causal relationships between facts; `element_links` generalizes this to any relationship between any elements.

**5. Short-Term Events**
Recent events that haven't been processed by the retain pipeline (no `processing_log` entry for `retain_v1`) from active threads. Provides very recent context before retain processes it.

**6. Thread-Aware Lookback**
When `thread_id` is provided (or inferred from run context), include prior thread events ordered by timestamp descending up to the lookback limit. Lookback events are additive context, not a separate result type.

### Vision (To Be Implemented)

**7. Temporal Retrieval**
Parse temporal expressions from queries ("yesterday", "last January", "3 months ago") and resolve to absolute timestamps. Retrieve elements with temporal proximity decay scoring — closer to target time = higher relevance.

```sql
SELECT id, content, as_of,
       1.0 / (1.0 + ABS(as_of - ?target_time) / ?decay_window) AS temporal_score
FROM elements
WHERE type = 'fact'
AND as_of BETWEEN ?target_time - ?window AND ?target_time + ?window
ORDER BY temporal_score DESC
```

**8. Link Expansion (Fast Path)**
Fast 1-hop graph expansion for mid-budget queries (2-3 DB queries total):
- Entity co-occurrence expansion via `element_entities` (prefer specific/rare entities)
- Element link expansion via `element_links` (causal, supports, derived_from, etc.)
- Fallback: semantic neighbors at reduced weight

**9. Multi-Hop Graph Traversal (MPFP)**
Typed meta-path traversal following patterns like:
- `[semantic, entity]` — similar elements → their entity-linked elements (via `element_entities`)
- `[semantic, temporal]` — similar elements → their temporal neighbors
- `[entity, semantic]` — entity-linked elements → their semantic neighbors

Each hop applies activation decay and pruning. Results feed into RRF fusion.

**10. Cross-Encoder Reranking**
Post-fusion reranking step. After RRF produces top-N candidates, run a cross-encoder model on (query, candidate_text) pairs for improved precision.

**11. Combined CTE Query**
Combine semantic + FTS5 (`elements_fts`) into a single SQL CTE query for reduced DB round-trips and better query planner optimization. The unified `elements_fts` index makes this natural — a single CTE can search across all element types simultaneously.

---

## Budget Control

| Budget | Strategies Used | Target Latency | Use Case |
|---|---|---|---|
| `low` | Semantic only | <50ms | Dedup checks, quick lookups |
| `mid` | Semantic + keyword (elements_fts) + entity (element_entities) + link expansion (element_links) | <200ms | Most queries, entity resolution |
| `high` | Full strategy set including MPFP + temporal + cross-encoder | <500ms | Deep research, complex questions |

---

## Fusion

Results from all active strategies are merged using **Reciprocal Rank Fusion (RRF)**:

```
RRF_score(item) = Σ 1 / (k + rank_in_strategy_i)
```

Where `k` is a constant (typically 60). This combines rankings from different strategies without needing to normalize scores across strategies.

After fusion, **Maximal Marginal Relevance (MMR)** is applied to reduce redundancy in the final result set.

---

## Embedding Provider

Embeddings are generated by a configurable embedding provider. The vision includes an abstraction layer:

```typescript
interface EmbeddingProvider {
  readonly providerName: string;
  readonly dimension: number;
  initialize(): Promise<void>;
  encode(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}
```

Provider selection via environment variables:
- `NEXUS_EMBEDDINGS_PROVIDER` — `local`, `openai`, `cohere`, `litellm`
- `NEXUS_EMBEDDINGS_MODEL` — provider-specific model name
- `NEXUS_EMBEDDINGS_API_KEY` — for remote providers

Current default: `BAAI/bge-small-en-v1.5` (384 dims) via node-llama-cpp GGUF locally.

The `vec_embeddings` virtual table dimension must match the provider. On model change, the vec table needs rebuilding from the `embeddings` table.
