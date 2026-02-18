# Memory System V2 — Spec Deviation Fix List

**Status:** REVIEW AGENT OUTPUT
**Created:** 2026-02-17
**Author:** Review Agent
**For:** Implementing Agent (codex)

---

## Overview

This document lists every place the implementation deviates from the V2 specs. Items are ordered by severity (CRITICAL > MAJOR > MINOR) then by phase. Each item includes: what's wrong, what the spec says, and exactly what to do.

**Guiding principle from Tyler:** "I don't fuck with any fallbacks or anything that deviates from the spec, it just ends up being accumulated clutter. Be ruthless and provide strong guidance for how we can get to exactly what our initial vision was and NOTHING else."

---

## CRITICAL Fixes (2)

### C1. Phase 6 — No Fast/Cheap Model for Memory Injection

**What's wrong:** `memory-reader.ts` calls `assembleContext()` and `startBrokerExecution()` with no model override. The meeseeks inherits whatever the broker default is — likely an expensive reasoning model like Sonnet/Opus.

**What the spec says (MEMORY_INJECTION.md §Model):**
> "Use a fast, cheap model optimized for speed over reasoning depth. Zero thinking budget."
> "Target: gpt-5.3-codex-spark or equivalent fast-inference model."
> "< 1 second target" latency, 3 second timeout.

**File:** `nex/src/nex/automations/meeseeks/memory-reader.ts`

**Fix:**
1. `assembleContext()` or `startBrokerExecution()` must accept a model parameter. Add `model: "haiku"` (or whatever the cheapest fast-inference model available in the broker is) to the execution options.
2. Set `maxTurns: 3` — the spec says 2-3 turns max.
3. Set `thinkingBudget: 0` or equivalent — the spec says "zero thinking budget."
4. If the broker doesn't support model overrides yet, that needs to be added as a prerequisite. The whole point of the injection meeseeks is that it's CHEAP and FAST. Running Sonnet for every single worker dispatch is the opposite of the design intent.

---

### C2. Phase 4 — Path 2 Imports Wrong Version

**What's wrong:** `memory-writer-ingest.source.ts` line 5 imports from `.v2.ts` instead of `.v4.ts`:
```typescript
import memoryWriterAutomation from "./hook_83961572-199a-43a2-b060-7b3b9d655411.v2.ts";
```

The v2 version is a prior iteration of the writer hook. The current version is v4.

**File:** `state/hooks/scripts/memory-writer-ingest.source.ts` line 5

**Fix:**
```typescript
import memoryWriterAutomation from "./hook_83961572-199a-43a2-b060-7b3b9d655411.v4.ts";
```

One-line fix. Verify the v4 hook exists and is the current version. This means Path 2 (standalone event ingestion) is currently running the WRONG writer logic — any events processed through this path used stale extraction behavior.

---

## MAJOR Fixes (13)

### M1. Phase 6 — Full Toolset Instead of Recall-Only

**What's wrong:** The memory-reader meeseeks inherits whatever tools the broker provides via `assembleContext()`. There's no tool constraint. The spec explicitly says ONE tool: `recall(query, params)`.

**What the spec says (MEMORY_INJECTION.md §Tool):**
> "One tool: `recall(query, params)`"

**File:** `nex/src/nex/automations/meeseeks/memory-reader.ts`

**Fix:**
1. The tool set must be explicitly restricted to ONLY the recall tool when forking this meeseeks.
2. Either `assembleContext()` needs a `tools` filter option, or the script manually strips all non-recall tools from `assembled` before passing to `startBrokerExecution()`.
3. The recall tool is already implemented at `nex/src/agents/tools/cortex-recall-tool.ts`. ONLY this tool should be available.

---

### M2. Phase 6 — V1 Workspace Leftovers

**What's wrong:** The workspace at `state/meeseeks/memory-reader/` contains V1 artifacts that contaminate the system prompt:

```
SKILLS.md        — references cortex-search.sh, raw SQL via sqlite3
PATTERNS.md      — V1 workflow patterns
ERRORS.md        — V1 reflection logs
skills/cortex/cortex-search.sh   — V1 shell search script
skills/cortex/cortex-write.sh    — V1 shell write script
skills/cortex/SCHEMA.md          — 37KB V1 schema dump
skills/cortex/QUERIES.md         — V1 query patterns
```

These are injected via line 26 of `memory-reader.ts`:
```typescript
assembled.systemPrompt += `\n\n${ctx.workspace.role}\n${ctx.workspace.skills}`;
```

**What the spec says (MEMORY_INJECTION.md):** The workspace should be `memory-injection/` (not `memory-reader/`) and contain ONLY:
- `ROLE.md` — minimal triage prompt
- `skills/cortex/recall.ts` — recall tool binding

**Fix:**
1. Create new workspace: `state/meeseeks/memory-injection/`
2. Move the existing `ROLE.md` (which is actually correct and well-written) to the new workspace.
3. Create `skills/cortex/recall.ts` with just the recall tool binding.
4. Delete or archive the entire `state/meeseeks/memory-reader/` directory.
5. Update the automation DB record to point to the new workspace.
6. Disable `self_improvement` on the automation record — the spec says "Minimal — fast model, simple task" for self-improvement. A fast cheap model should not be updating its own workspace.

---

### M3. Phase 6 — No Script-Level Triage Validation

**What's wrong:** The script always returns `fire: true` with whatever the model returned as `memories`. The spec says the meeseeks should return nothing if recall results are irrelevant.

**What the spec says (MEMORY_INJECTION.md §Output):**
> "Or if nothing relevant: (no enrichment returned — worker proceeds without memory context)"

**File:** `nex/src/nex/automations/meeseeks/memory-reader.ts` line 31-35

**Fix:**
The ROLE.md already instructs the model to return empty string if nothing relevant. But the script should validate:
```typescript
const memories = result.response?.content?.trim() || null;
// Only enrich if the model returned actual memory_context
const hasMemoryContext = memories && memories.includes('<memory_context>');
return {
  fire: true,
  enrich: { memories: hasMemoryContext ? memories : null },
};
```

This prevents garbage/hallucinated output from polluting the worker's context.

---

### M4. Phase 4 — UUID Instead of ULID for IDs

**What's wrong:** `cortex-memory-writer-tools.ts` uses `randomUUID()` from `node:crypto` for all entity/fact/merge_candidate IDs. UUIDs are not time-sortable. The schema comments say `-- ULID` for every ID column.

**What the spec says (MEMORY_SYSTEM_V2.md schema, UNIFIED_ENTITY_STORE.md schema):**
Every `id` column is annotated `TEXT PRIMARY KEY, -- ULID`

**File:** `nex/src/agents/tools/cortex-memory-writer-tools.ts` lines 2, 219, 245, 289, 449

**Fix:**
1. Add a ULID library: `npm install ulid` or use the existing one if available in the repo.
2. Replace all `randomUUID()` calls with `ulid()`:
   - Line 219: `const factId = ulid();`
   - Line 245: embedding ID should use `ulid()`
   - Line 289: `const entityId = ulid();`
   - Line 449: `const mergeCandidateId = ulid();`

ULIDs are time-sortable, which matters for ordering by creation time without an extra index, and they encode their creation timestamp which aids debugging.

---

### M5. Phase 4 — No Thread Context in Path 1

**What's wrong:** The Path 1 writer hook (`hook_...v4.ts`) passes only `latestTurn` (user_message + assistant_response) to the writer meeseeks. No thread context (surrounding messages from the same session).

**What the spec says (MEMORY_WRITER_V2.md §Trigger):**
> "1. The event itself — full NexusEvent with deliveryContext"
> "2. Thread context — the last N events from the same thread/session for conversational context"

**File:** `state/hooks/scripts/hook_83961572-199a-43a2-b060-7b3b9d655411.v4.ts` lines 146-161

**Fix:**
1. The hook has access to `ctx.request.agent?.session_label`. Use this to query recent session history.
2. Pass the last 3-5 turns as thread context in the task payload, not just the latest turn.
3. The writer's ROLE.md already says "Use full history only for disambiguation when the payload is ambiguous" — this is correct, but the history needs to actually be available.

---

### M6. Phase 4 — No deliveryContext in Path 1

**What's wrong:** Path 1 doesn't pass any deliveryContext to the writer. The writer needs channel, sender_id, sender_name, etc. for entity resolution and source attribution.

**What the spec says (MEMORY_WRITER_V2.md §Event Context):**
The writer receives the full NexusEvent with deliveryContext including channel, sender_id, sender_name, peer_id, peer_kind, thread_id.

**File:** `state/hooks/scripts/hook_83961572-199a-43a2-b060-7b3b9d655411.v4.ts`

**Fix:**
1. Extract deliveryContext from `ctx.request.event?.metadata` (or wherever the broker stores it).
2. Include it in the task payload alongside `latestTurn`.
3. This gives the writer the information it needs for entity resolution (e.g., knowing the sender's platform handle).

---

### M7. Phase 4 — mention_count Not Updated on Auto-Merge

**What's wrong:** When `propose_merge` auto-merges (confidence >= 0.9), it moves `fact_entities` and `entity_tags` from entity B to entity A, but doesn't consolidate `mention_count`. Entity A keeps its old count; entity B's mentions are lost.

**What the spec says (UNIFIED_ENTITY_STORE.md §union):**
The merge operation should update the canonical entity to reflect combined data.

**File:** `nex/src/agents/tools/cortex-memory-writer-tools.ts` `propose_merge` tool (~line 465-530)

**Fix:**
Add to the auto-merge transaction:
```sql
UPDATE entities SET
  mention_count = mention_count + (SELECT mention_count FROM entities WHERE id = ?),
  first_seen = MIN(first_seen, (SELECT first_seen FROM entities WHERE id = ?)),
  last_seen = MAX(last_seen, (SELECT last_seen FROM entities WHERE id = ?))
WHERE id = ?;
```
(Where the subqueries reference the merged entity B, and the outer WHERE references canonical entity A.)

---

### M8. Phase 2 — Sequential Strategy Execution

**What's wrong:** All retrieval strategies in `recall.go` run sequentially — semantic, then keyword, then entity traversal, then causal. Each waits for the previous to complete.

**What the spec says (WORKPLAN.md §Phase 2 Step 3):**
> "Run strategies in parallel (goroutines)."

**File:** `nex/cortex/internal/recall/recall.go` lines 74-147

**Fix:**
Wrap independent strategies in goroutines with a `sync.WaitGroup` or `errgroup.Group`:

```go
g, gctx := errgroup.WithContext(ctx)
var mu sync.Mutex

// Semantic search
if len(req.QueryEmbedding) > 0 {
    g.Go(func() error {
        sem, err := semanticSearch(gctx, db, req.QueryEmbedding, targetTypes, strategyLimit)
        if err != nil { return err }
        mu.Lock()
        rankedLists = append(rankedLists, sem)
        mu.Unlock()
        return nil
    })
}

// Keyword search (mid+)
if budget != BudgetLow {
    g.Go(func() error {
        kw, err := keywordSearchFacts(gctx, db, query, strategyLimit)
        // ...
    })
}

// ... etc

if err := g.Wait(); err != nil {
    return Response{}, err
}

// Causal traversal still runs AFTER others (needs seed facts)
```

Note: Causal traversal depends on results from other strategies (it uses `topFactSeeds`), so it must remain sequential after the parallel phase. The other 3 strategies (semantic, keyword, entity) are independent and should run concurrently.

This is a real performance win — SQLite handles concurrent reads fine with WAL mode, and each strategy touches different indices.

---

### M9. Phase 2 — access_count Never Incremented

**What's wrong:** `facts.access_count` and `mental_models.access_count` exist in the schema but are never updated by recall(). These columns are designed for LRU/popularity-based retrieval tuning.

**What the spec says (MEMORY_SYSTEM_V2.md schema):**
The `access_count` column exists on facts, analysis_runs, and mental_models, implying it should track retrieval hits.

**File:** `nex/cortex/internal/recall/recall.go` — nowhere in the file.

**Fix:**
After recall() hydrates and selects final results, increment access_count for each returned item:

```go
// After MMR selection, before returning
factIDs, mmIDs := partitionByType(selectedKeys)
if len(factIDs) > 0 {
    updateAccessCount(ctx, db, "facts", factIDs)
}
if len(mmIDs) > 0 {
    updateAccessCount(ctx, db, "mental_models", mmIDs)
}
```

This should be fire-and-forget (don't fail the recall if the update fails). It provides signal for future retrieval optimization.

---

### M10. Phase 3 — vec_distance_cosine Brute-Force Instead of MATCH KNN

**What's wrong:** Semantic search uses `ORDER BY vec_distance_cosine(embedding, ?)` which performs a brute-force scan over all rows. sqlite-vec provides an accelerated KNN index via the `MATCH` operator.

**What the spec says (WORKPLAN.md §Phase 2 Step 2a):**
> "Query vec_embeddings with cosine similarity via sqlite-vec MATCH operator."

**File:** `nex/cortex/internal/recall/strategies.go` lines 35-42

**Current code:**
```go
q := `SELECT target_type, target_id
      FROM vec_embeddings
      WHERE target_type IN (...)
      ORDER BY vec_distance_cosine(embedding, ?) ASC
      LIMIT ?`
```

**Fix:**
Use the KNN accelerated syntax:
```go
q := `SELECT target_type, target_id
      FROM vec_embeddings
      WHERE embedding MATCH ?
        AND k = ?`
```

**Caveat:** The `MATCH` operator in sqlite-vec doesn't support additional WHERE clauses (like `target_type IN (...)`) in the same query. You have two options:
1. Run separate KNN queries per target_type and merge results
2. Use `MATCH` without the type filter (fetch more results, e.g., `k = limit * 3`) and post-filter by type

Option 2 is simpler and likely fast enough. The brute-force scan will become a real problem as the embeddings table grows past ~50K rows. Fix this now before data accumulates.

---

### M11. Phase 3 — No Entity/Mental Model Embedding Generation

**What's wrong:** Only facts get embeddings (generated inline by the `insert_fact` writer tool). Entities and mental models are never embedded. The schema supports `target_type = 'entity'` and `target_type = 'mental_model'` in the embeddings table, and recall()'s semantic search queries `vec_embeddings` filtered by target_type.

**What the spec says (WORKPLAN.md §Phase 3 Step 2):**
> "Support facts, observations, entities, mental_models as target types"

**Files:**
- `nex/src/agents/tools/cortex-memory-writer-tools.ts` — `create_entity` tool doesn't embed
- No mental model tools exist yet (Phase 7)

**Fix:**
1. In `create_entity` tool: after inserting the entity, generate an embedding of the entity name + type string and insert into `embeddings` + `vec_embeddings` with `target_type = 'entity'`.
2. When mental model tools are created (Phase 7), include embedding generation for `create_mental_model` and `update_mental_model`.
3. Consider adding an embedding step to `propose_merge` auto-merge — the canonical entity might need its embedding updated to reflect combined identity.

---

### M12. Phase 3 — Embedding Pipeline Fragmented

**What's wrong:** Embedding generation lives in 3 separate codepaths across 2 languages:
- TS: `nex/src/cortex-memory-v2/embeddings.ts` — node-llama-cpp provider for inline embedding in writer tools
- TS: `nex/scripts/cortex-memory-v2-embed-facts.mjs` — backfill script
- Go: `nex/cortex/internal/compute/embeddings_batcher.go` — Go-side batch embedder (uses the old schema)

**What the spec says (WORKPLAN.md §Phase 3):**
> "Refactor `internal/compute/embeddings_batcher.go` to write to the new embeddings table schema"

**Fix:**
1. The Go embeddings_batcher.go needs to be updated to write to the new `embeddings` + `vec_embeddings` tables (target_type, target_id, model pattern).
2. Decide on a single canonical embedding path. Current state: writer tools embed inline via TS (acceptable for real-time), Go batcher is for background/batch processing. This is fine AS LONG AS both write to the same schema with the same model. Verify the Go batcher uses `BAAI/bge-small-en-v1.5` and writes 384-dim vectors.
3. The backfill script should call the same embedding provider, not be a third implementation.

---

### M13. Phase 4 — Path 2 Never Triggers Consolidation

**What's wrong:** The Path 1 hook (`v4.ts`) fires `triggerConsolidation()` after the writer completes (line 203). The Path 2 hook (`memory-writer-ingest.source.ts`) does not — it just delegates to the writer automation and returns.

**What the spec says (MEMORY_WRITER_V2.md §Workflow):**
> "Agent completes. System runs post-agent steps: Generate embeddings for new facts (algorithmic), Queue consolidation job for new facts (background)"

This applies to BOTH paths.

**File:** `state/hooks/scripts/memory-writer-ingest.source.ts`

**Fix:**
After `memoryWriterAutomation(ctx)` returns, call `triggerConsolidation()` the same way Path 1 does. Import the consolidation trigger function from the v4 hook or extract it to a shared module.

---

## MINOR Fixes (10)

### m1. Phase 2 — Keyword FTS5 Fallback Chain

**What's wrong:** `keywordSearchFacts()` in `strategies.go` has a 3-tier fallback: FTS5 with bm25 → FTS4 without bm25 → LIKE scan. The LIKE and FTS4 fallbacks are unnecessary — Phase 1 creates FTS5 correctly.

**Fix:** Remove FTS4 and LIKE fallbacks. If FTS5 fails, return an error rather than silently degrading to a full table scan.

---

### m2. Phase 2 — keywordSearchObservations Uses LIKE Scan

**What's wrong:** `keywordSearchObservations()` does a `LIKE '%query%'` scan on `analysis_runs.output_text`. This is O(N) and unacceptable at scale.

**Fix:** Either:
- Create an FTS5 index on `analysis_runs.output_text` (preferred), or
- Remove observation keyword search and rely on semantic search for observations (acceptable if embeddings are generated for observations)

---

### m3. Phase 4 — insert_fact Has Extra `context` and `model` Params

**What's wrong:** The `insert_fact` tool schema includes `context` (optional) and `model` (optional) parameters not in the spec.

**Fix:** `context` is harmless (stored in metadata). `model` is the embedding model override. Both are reasonable extensions. Keep but document them as implementation additions, not spec requirements. Low priority.

---

### m4. Phase 4 — insert_causal_link Missing `propose_merge` in Task Text

**What's wrong:** The Path 1 hook's task text lists only 4 of 5 tools: `insert_fact, create_entity, link_fact_entity, propose_merge`. `insert_causal_link` is missing from the instruction text (though the tool itself is registered).

**File:** `state/hooks/scripts/hook_83961572-199a-43a2-b060-7b3b9d655411.v4.ts` lines 150-152

**Fix:** Add `insert_causal_link` to the tool list in the task description.

---

### m5. Phase 2 — Observation Entities Derived Indirectly

**What's wrong:** `loadObservationEntityIDs()` derives observation entity IDs by joining `observation_facts → fact_entities`. This is correct but indirect — if a fact's entity links change after the observation was created, the observation's entity associations change silently.

**Fix:** This is acceptable for now. Long-term, consider caching entity IDs at observation creation time. No action needed.

---

### m6. Phase 2 — Mental Model Text Uses `description` Not Full Content

**What's wrong:** `loadMentalModels()` returns `description` as the `Text` field. For long mental models, this may be truncated.

**Fix:** Verify `description` is the full text field. If mental models need a separate long-form content field, that's a Phase 7 concern. No action needed now.

---

### m7. Phase 1 — episode_entity_mentions Not Created

**What's wrong:** The spec's "keep as-is" table list includes episode_entity_mentions. The Phase 1 schema doesn't create it (it was part of the old system).

**Fix:** This table was correctly omitted — it belongs to the old entity system. The new system uses `fact_entities` → `observation_facts` → `episode_events` for entity-episode associations. No action needed. Remove from spec's "keep as-is" list if you update the spec.

---

### m8. Phase 4 — Writer ROLE.md Has Useful Additions

**What's wrong:** The writer's ROLE.md at `state/meeseeks/memory-writer/ROLE.md` includes patterns and heuristics beyond what the spec describes (dedup rules, entity resolution heuristics, extraction guidelines).

**Fix:** This is good — the ROLE.md is better than the spec minimum. Keep it. The self-improvement pattern means the writer's ROLE.md should evolve over time. No action needed.

---

### m9. Phase 2 — Entity Traversal Gated on Explicit `entity` Param

**What's wrong:** Entity traversal only runs when `req.Entity` is explicitly set. If a user searches "what does Tyler think about X", entity traversal won't engage unless the caller extracts "Tyler" and passes it as the entity param.

**Fix:** This is actually correct behavior for recall() — the caller (injection meeseeks, search skill) is responsible for extracting entities from the query and passing them. The injection meeseeks's ROLE.md should teach it to do this. No code change to recall() needed. Ensure Phase 7 Memory Search skill documents entity extraction patterns.

---

### m10. Phase 6 — Workspace Name Mismatch

**What's wrong:** The automation workspace is `memory-reader/` but the spec calls it `memory-injection/`.

**Fix:** Rename as part of M2 (V1 workspace cleanup). The workspace should be `state/meeseeks/memory-injection/`.

---

## Phase 5 — Full Rewrite Required

Phase 5 (Consolidation) was reviewed separately and found **fundamentally wrong**. It uses entity-centric grouping instead of recall-based topical discovery. A full rewrite is required. See the separate Phase 5 rewrite guidance below.

### What's Wrong

The current consolidation.go:
1. Groups facts by entity (`entityFactGroups`)
2. Deterministically renders bullet-list observations (no LLM)
3. Computes centroid embeddings
4. Never calls recall()
5. Never uses LLM synthesis

### What the Spec Says (MEMORY_WRITER_V2.md §Consolidation)

For each unconsolidated fact:
1. `recall(fact.text)` — find related observations and facts
2. Evaluate worthiness — skip isolated facts
3. Find or create knowledge-episode grouping related source events
4. Run observation analysis — **single LLM call**: new fact + existing observation text → create/update/skip
5. Mark `is_consolidated = TRUE`
6. Trigger mental model refresh if applicable

### What to Reuse from Current Implementation

The transaction/version management plumbing is solid:
- Episode creation with parent_id versioning
- analysis_run creation with parent_id chains
- observation_facts junction linking
- Embedding generation for observations
- Per-fact commit pattern (crash-recoverable)

### What to Throw Away

- `entityFactGroups()` and all entity-centric grouping logic
- `renderObservation()` and deterministic bullet-list generation
- `centroidEmbedding()` computation
- All test assertions based on entity-centric behavior

### Rewrite Flow

```go
func consolidateFact(ctx context.Context, db *sql.DB, fact Fact) error {
    // 1. Recall related content
    resp, err := recall.Recall(ctx, db, recall.Request{
        Query:    fact.Text,
        Scope:    []recall.Scope{recall.ScopeObservations, recall.ScopeFacts},
        Budget:   recall.BudgetMid,
        MaxResults: 10,
    })

    // 2. Evaluate worthiness
    if len(resp.Results) == 0 {
        // Isolated fact — mark consolidated, no observation
        markConsolidated(ctx, db, fact.ID)
        return nil
    }

    // 3. Find or create knowledge-episode
    episode := findOrCreateEpisode(ctx, db, fact, resp.Results)

    // 4. LLM synthesis
    existingObservation := findExistingObservation(ctx, db, episode.ID)
    prompt := buildConsolidationPrompt(fact, existingObservation, resp.Results)
    llmResult := callLLM(ctx, prompt)  // Single LLM call

    // 5. Execute action (create/update/skip)
    switch llmResult.Action {
    case "create":
        createObservation(ctx, db, episode.ID, llmResult.Text, fact.ID)
    case "update":
        updateObservation(ctx, db, existingObservation, llmResult.Text, fact.ID)
    case "skip":
        // no observation needed
    }

    // 6. Mark consolidated
    markConsolidated(ctx, db, fact.ID)
    return nil
}
```

The consolidation prompt should be adapted from Hindsight's consolidation prompts (see `hindsight_api/engine/consolidation.py`). Key instruction: extract DURABLE KNOWLEDGE, not ephemeral state.

---

## Summary: Priority Order for Implementation

```
🔴 CRITICAL (fix immediately)
  C1. Phase 6: Force fast/cheap model for memory-injection
  C2. Phase 4: Fix Path 2 import (v2 → v4)

🟠 MAJOR (fix before shipping)
  M1. Phase 6: Restrict tools to recall-only
  M2. Phase 6: Replace V1 workspace with clean memory-injection/
  M3. Phase 6: Add script-level triage validation
  M4. Phase 4: Use ULID instead of UUID for all IDs
  M5. Phase 4: Pass thread context in Path 1
  M6. Phase 4: Pass deliveryContext in Path 1
  M7. Phase 4: Update mention_count/first_seen/last_seen on auto-merge
  M8. Phase 2: Parallelize strategy execution with goroutines
  M9. Phase 2: Increment access_count on recall() results
  M10. Phase 3: Use MATCH KNN instead of vec_distance_cosine brute-force
  M11. Phase 3: Generate embeddings for entities (and later mental models)
  M12. Phase 3: Consolidate embedding pipeline (ensure Go batcher uses new schema)
  M13. Phase 4: Trigger consolidation from Path 2

🟡 MINOR (fix when convenient)
  m1-m10: See details above

🔴 FULL REWRITE
  Phase 5: Consolidation — entity-centric → recall-based topical discovery + LLM synthesis
```

**Recommended attack order:**
1. C1 + C2 (5 minutes each, unblock correct behavior)
2. M1-M3 (Phase 6 fixes, do together since they're in the same files)
3. M4-M7, M13 (Phase 4 fixes, do together)
4. Phase 5 rewrite (biggest single task)
5. M8-M9 (Phase 2 fixes)
6. M10-M12 (Phase 3 fixes)
7. Minor fixes as time allows

---

## Phases 7-8: Not Yet Started

Phase 7 (Memory Search + Reflect Skills) and Phase 8 (Cleanup + Backfill) haven't been implemented yet. They should wait until all fixes above are complete, especially Phase 5 rewrite and Phase 3 embedding pipeline fixes.
