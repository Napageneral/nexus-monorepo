# Workplan 01 — Schema Alignment & CLI Migration

**Status:** ACTIVE
**Created:** 2026-02-27
**Specs:** ../MEMORY_SYSTEM.md, ../MEMORY_RECALL.md

---

## Overview

This workplan covers the foundational infrastructure work: aligning database schemas with canonical specs, auditing/migrating the CLI, and restructuring recall results. These changes are prerequisites for the agent workflow improvements in Workplan 03.

**Hard cutover policy.** No backwards compatibility, no migrations. We clean house and rebuild the schemas correctly.

---

## S1. Schema: Remove `is_stale` from observations and mental models

**Spec:** MEMORY_SYSTEM.md — Staleness via revision chains, not boolean flag.

**Current code:** `analysis_runs` has `is_stale BOOLEAN DEFAULT FALSE` with index. `mental_models` has `is_stale BOOLEAN DEFAULT FALSE` with index.

**Changes:**
- Remove `is_stale` column from `analysis_runs` table in `db/memory.ts`
- Remove `idx_analysis_runs_stale` index
- Remove `is_stale` column from `mental_models` table
- Remove `idx_mental_models_stale` index
- Remove `staleMentalModelsForFacts()` function from `memory-writer-tools.ts`
- Remove all calls to `staleMentalModelsForFacts()` (3 call sites: create_observation, update_observation, mark_facts_consolidated)
- Remove `is_stale` from `MemoryRecallResultItem` in `recall.ts`
- Add `parent_id` and `successor_id` to recall result types (see S5)

**Why revision chains over is_stale:** See MEMORY_SYSTEM.md § Design Decision. The chain IS the staleness — following it gives you both "something changed" AND "what it changed to." The boolean was redundant denormalization that nothing consumed meaningfully.

---

## S2. Schema: Mental models — drop `subtype`, `refresh_trigger`, `last_refreshed`; add `pinned`

**Spec:** MEMORY_SYSTEM.md — Mental models have `pinned` boolean only. No subtypes.

**Current code:** `mental_models` has `subtype TEXT`, `refresh_trigger TEXT`, `last_refreshed INTEGER`. No `pinned` column.

**Changes:**
- Remove `subtype TEXT` from mental_models schema
- Remove `refresh_trigger TEXT` from mental_models schema
- Remove `last_refreshed INTEGER` from mental_models schema (note: the canonical spec includes last_refreshed — reconcile during implementation, keep if the reflect skill uses it)
- Add `pinned INTEGER DEFAULT 0` column
- Remove `subtype` from `CreateMentalModelSchema` in `memory-writer-tools.ts`
- Update `buildMentalModelResult()` in `recall.ts` — remove subtype from metadata, add pinned

---

## S3. Schema: Facts — do NOT add `event_date` (decision captured)

**Spec:** MEMORY_SYSTEM.md § Design Decision: Why `event_date` is NOT stored on the fact.

**No code changes needed.** This item captures the decision NOT to add an event_date column. The event timestamp is always derivable via `source_event_id` → `events.timestamp`.

**Reasoning:** See spec. Key points: (1) source_event_id link already provides it, (2) denormalized copy creates sync risk, (3) cross-DB join already happens in writer tools, (4) can add later if perf demands it.

---

## S4. CLI: Audit and clean V1 holdovers

**Current state:** The `nex memory` CLI has commands from both V1 (file-based search) and V2 (knowledge graph).

**V1 commands to remove:**
- `memory status` — monitors file-based search index (MEMORY.md files, session transcripts). NOT the knowledge graph.
- `memory index` — manually reindexes markdown files. NOT knowledge graph indexing.
- `memory search` — semantic search against indexed files, returns file paths/line ranges. NOT the recall API.

**V2 commands to keep:**
- `memory entities --audit` — entity resolution inspector
- `memory compact` — access_log rollup
- `memory filter list/add/disable/enable/preview` — episode filtering
- `memory vectors rebuild` — embedding maintenance
- `memory backfill` — historical event processing
- `memory retain --flush` — live retain triggers

**Changes:**
- Remove V1 commands from `memory-cli.ts`
- Remove any supporting code for file-based search index that is only used by these commands
- Verify V2 commands still work correctly after removal

---

## S5. CLI: Add memory tool subcommands

**Spec:** MEMORY_SYSTEM.md § Tool Architecture — Memory tools exposed as CLI commands.

**Current code:** Memory tools are Anthropic `tool_use` API tools, injected per-session type via `createCortexMemoryWriterTools()` in `nexus-tools.ts`.

**New CLI commands to add under `nex memory`:**

| Command | Maps To | Notes |
|---|---|---|
| `memory insert-fact` | `insertFact()` | --text, --as-of, --source-event-id, --metadata |
| `memory create-entity` | `createEntity()` | --name, --type |
| `memory link-fact-entity` | `linkFactEntity()` | --fact-id, --entity-id |
| `memory propose-merge` | `proposeMerge()` | --entity-a, --entity-b, --confidence, --reason |
| `memory consolidate-facts` | NEW unified tool | --fact-ids, [--text], [--observation-id] |
| `memory resolve-observation-head` | `resolveObservationHead()` | --learning-id |
| `memory insert-causal-link` | `insertCausalLink()` | --from, --to, --strength |
| `memory create-mental-model` | `createMentalModel()` | --name, --description, [--entity-id] |
| `memory update-mental-model` | `updateMentalModel()` | --id, --description |

**Implementation approach:**
1. Extract the DB logic from each tool's `execute` function in `memory-writer-tools.ts` into standalone exported functions
2. Create thin CLI wrappers in `memory-cli.ts` that call those functions
3. Each CLI command: open ledgers → call extracted function → output JSON to stdout
4. Remove `createCortexMemoryWriterTools()` from `nexus-tools.ts`
5. Remove session-type filtering logic (writer/consolidator/default tool lists)
6. Recall tool may remain as a tool_use tool since it's universal — decide during implementation

**The `consolidate_facts` command is NEW** — it replaces both `create_observation` and `mark_facts_consolidated`. See Workplan 03 § Consolidation for details.

---

## S6. Recall: Restructure result types (hybrid)

**Spec:** MEMORY_RECALL.md § Result Types — Grouped arrays + ranked interleaved list.

**Current code:** `MemoryRecallResultItem` is a single flat interface with `metadata: Record<string, unknown>` bag.

**Changes:**
1. Define per-type result interfaces: `FactResult`, `ObservationResult`, `MentalModelResult`, `EntityResult`, `EventResult`
2. Define `RecallResultItem` as discriminated union of the five types
3. Define `RecallResult` with both `ranked: RecallResultItem[]` and per-type arrays
4. Update builder functions (`buildFactResult`, `buildObservationResult`, etc.) to return their proper types
5. Add `parent_id` and `successor_id` to `ObservationResult` and `MentalModelResult`
   - `successor_id` requires a LEFT JOIN: `LEFT JOIN analysis_runs successor ON successor.parent_id = ar.id`
6. Add `canonical_only` parameter to recall — filters entities to `WHERE merged_into IS NULL`
7. After RRF fusion, populate both the ranked list and the grouped arrays from the same result set
8. Update recall tool output to return the new structure
9. Remove `MemoryRecallResultItem` (replaced by discriminated union)

**Why hybrid:** See MEMORY_RECALL.md § Design Decision. Grouped arrays for type-specific access + ranked list for cross-type relevance. Each type has proper fields, not a metadata bag.

---

## Execution Order

1. **S1 + S2** — Schema cleanup (can be done together in one pass through `db/memory.ts`)
2. **S4** — CLI audit (gut V1 commands)
3. **S6** — Recall restructuring (independent of CLI migration, but needed for entity resolution)
4. **S5** — CLI tool commands (depends on S6 for recall, and needs extracted DB functions)

S3 is a non-change — just a documented decision.

---

## Validation

After each step:
- `npm run build` — must compile
- `npm test` — must pass
- After S5: Test each CLI command manually against a test ledger
- After S6: Run a recall query and verify the new result structure
