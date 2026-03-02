# Phase 1 — Schema Rewrite (db/memory.ts)

**Status:** ACTIVE
**Created:** 2026-03-01
**Phase:** 1 (Foundation — everything depends on this)
**Spec:** ../MEMORY_STORAGE_MODEL.md
**Files:** `nex/src/db/memory.ts`

---

## Overview

Full rewrite of `ensureMemorySchema()` in `db/memory.ts` to implement the Elements/Sets/Jobs unified storage model. This is the foundation — no other phase can proceed until the schema compiles and creates the correct tables.

**Hard cutover.** The entire function body is replaced. No migration from old tables.

---

## Current State (What Exists)

`db/memory.ts` contains `ensureMemorySchema(db)` which creates 16 tables:

| Table | Status | Disposition |
|---|---|---|
| `facts` | Active | **Replace** with `elements WHERE type = 'fact'` |
| `fact_entities` | Active | **Replace** with `element_entities` |
| `facts_fts` | Active | **Replace** with `elements_fts` |
| `analysis_types` | Active | **Replace** with `job_types` |
| `analysis_runs` | Active | **Replace** with `elements WHERE type = 'observation'` + `jobs` |
| `observation_facts` | Active | **Delete** — replaced by `set_members` |
| `mental_models` | Active | **Replace** with `elements WHERE type = 'mental_model'` |
| `causal_links` | Active | **Replace** with `element_links WHERE link_type = 'causal'` |
| `facets` | Unused | **Delete** — dead table, never referenced at runtime |
| `episodes` | Active | **Replace** with `sets` |
| `episode_events` | Active | **Replace** with `set_members WHERE member_type = 'event'` |
| `episode_definitions` | Active | **Replace** with `set_definitions` |
| `entity_resolution_log` | Active | **Replace** with `resolution_log` (rename `source_fact_id` → `source_element_id`) |
| `memory_processing_log` | Active | **Replace** with `processing_log` (generalized) |
| `access_log` | Active | **Keep** (already matches spec) |
| `schema_version` | Active | **Keep** (bump version to 2) |

---

## Changes

### S1. Replace entire `ensureMemorySchema()` body

Delete all existing table creation SQL. Replace with the canonical schema from MEMORY_STORAGE_MODEL.md.

**New tables to create (in dependency order):**

```
1. schema_version        (no FK deps)
2. set_definitions       (no FK deps)
3. job_types             (no FK deps)
4. elements              (self-FK: parent_id → elements.id)
5. elements_fts          (FTS5, content='elements')
6. element_entities      (FK: element_id → elements.id)
7. element_links         (FK: from_element_id/to_element_id → elements.id)
8. sets                  (FK: definition_id → set_definitions.id)
9. set_members           (FK: set_id → sets.id)
10. jobs                 (FK: type_id → job_types.id, input_set_id → sets.id)
11. job_outputs          (FK: job_id → jobs.id, element_id → elements.id)
12. processing_log       (FK: job_type_id → job_types.id, job_id → jobs.id)
13. resolution_log       (no FK deps — references entities in identity.db by value)
14. access_log           (no FK deps)
```

**SQL for each table:** Copy exactly from MEMORY_STORAGE_MODEL.md § Schema section. All CREATE TABLE statements, indexes, and FTS triggers are specified there.

### S2. FTS5 triggers

Three triggers for `elements_fts` sync:
- `elements_fts_insert` — AFTER INSERT ON elements
- `elements_fts_update` — AFTER UPDATE OF content ON elements
- `elements_fts_delete` — AFTER DELETE ON elements

Copy from MEMORY_STORAGE_MODEL.md § Full-Text Search.

### S3. Seed data

After schema creation, insert seed data for set_definitions and job_types:

```sql
INSERT OR IGNORE INTO set_definitions (id, name, version, strategy, config_json, description, created_at)
VALUES
    ('retain', 'retain', '1.0.0', 'thread_time_gap',
     '{"silence_window_ms": 5400000, "token_budget": 10000}',
     'Retain episodes from adapter events',
     strftime('%s', 'now')),
    ('consolidation', 'consolidation', '1.0.0', 'knowledge_cluster',
     '{}',
     'Knowledge-cluster sets for consolidation',
     strftime('%s', 'now'));

INSERT OR IGNORE INTO job_types (id, name, version, description, prompt_template, config_json, created_at)
VALUES
    ('retain_v1', 'retain_v1', '1.0.0',
     'Extract facts and entities from episode events',
     'See MEMORY_WRITER.md for full role prompt',
     NULL,
     strftime('%s', 'now')),
    ('consolidate_v1', 'consolidate_v1', '1.0.0',
     'Synthesize observations, detect causal links, propose entity merges',
     'See MEMORY_CONSOLIDATION.md for full role prompt',
     NULL,
     strftime('%s', 'now'));

INSERT OR IGNORE INTO schema_version (version, applied_at)
VALUES (2, strftime('%s', 'now'));
```

### S4. Remove migration helpers

Delete these functions from `db/memory.ts`:
- `ensureMemoryPlatformColumns()` — V1→V2 migration helper, no longer needed
- `ensureFactsColumns()` — V1→V2 migration helper, no longer needed
- Any other `ALTER TABLE`-style migration logic

The `ensureMemorySchema()` function should be a clean, single-pass schema creation with `CREATE TABLE IF NOT EXISTS` and `INSERT OR IGNORE` for seed data. No conditional migration logic.

### S5. Export types

Ensure these TypeScript types are exported from `db/memory.ts` (or a shared types file) for use by writer tools and recall:

```typescript
export type ElementType = 'fact' | 'observation' | 'mental_model';
export type SetMemberType = 'event' | 'element' | 'set';
export type LinkType = 'causal' | 'supports' | 'contradicts' | 'supersedes' | 'derived_from';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
export type ResolutionAction = 'created' | 'linked' | 'merged' | 'retyped';
export type ProcessingTargetType = 'event' | 'element';
```

---

## Detailed Table-by-Table Mapping

For implementer reference, here's exactly what changes per old table:

### `facts` → `elements WHERE type = 'fact'`

| Old Column | New Column | Notes |
|---|---|---|
| `id TEXT PK` | `elements.id` | Same |
| `text TEXT NOT NULL` | `elements.content` | Renamed |
| `as_of INTEGER` | `elements.as_of` | Same |
| `ingested_at INTEGER` | `elements.created_at` | Renamed |
| `source_episode_id TEXT` | Derived via `jobs.input_set_id` → `sets.id` | No longer a direct column |
| `source_event_id TEXT` | `elements.source_event_id` | Same |
| `context TEXT` | Removed | Dead field — never written |
| `is_consolidated INTEGER` | `processing_log` entry | See processing_log |
| `metadata TEXT` | `elements.metadata` | Same |
| `access_count INTEGER` | Derived from `access_log` | Denormalized count removed |
| `platform TEXT` | `sets.metadata.platform` | Pushed to set level |

### `analysis_runs` → `elements WHERE type = 'observation'` + `jobs`

| Old Column | New Column | Notes |
|---|---|---|
| `id TEXT PK` | `elements.id` (for content) / `jobs.id` (for execution) | Split across two tables |
| `analysis_type_id TEXT` | `jobs.type_id` | Job knows its type |
| `episode_id TEXT` | `jobs.input_set_id` | Job knows its input set |
| `output_text TEXT` | `elements.content` | The synthesized text IS the element |
| `parent_id TEXT` | `elements.parent_id` | Version chain stays on element |
| `status TEXT` | `jobs.status` | Execution state on job |
| `raw_output TEXT` | `jobs.raw_output` | Raw LLM dump on job |
| `error_message TEXT` | `jobs.error_message` | Error on job |
| `is_stale INTEGER` | Removed | Revision chains replace staleness tracking |
| `access_count INTEGER` | Derived from `access_log` | Denormalized count removed |

### `mental_models` → `elements WHERE type = 'mental_model'`

| Old Column | New Column | Notes |
|---|---|---|
| `id TEXT PK` | `elements.id` | Same |
| `name TEXT` | `elements.metadata` JSON `{"name": "..."}` | Name stored in metadata |
| `description TEXT` | `elements.content` | Full report text |
| `entity_id TEXT` | `elements.entity_id` | Same |
| `parent_id TEXT` | `elements.parent_id` | Same |
| `subtype TEXT` | Removed | Over-engineering |
| `tags TEXT` | Removed | Unused |
| `pinned INTEGER` | `elements.pinned` | Same |
| `refresh_trigger TEXT` | Removed | Unused |
| `last_refreshed INTEGER` | Derived from `job_outputs` → `jobs.completed_at` | No denormalized copy |
| `access_count INTEGER` | Derived from `access_log` | Denormalized count removed |

### `entity_resolution_log` → `resolution_log`

| Old Column | New Column | Notes |
|---|---|---|
| `id` | `resolution_log.id` | Same |
| `entity_id` | `resolution_log.entity_id` | Same |
| `action` | `resolution_log.action` | Same |
| `source_fact_id` | `resolution_log.source_element_id` | Renamed — any element, not just facts |
| `source_event_id` | `resolution_log.source_event_id` | Same |
| `evidence` | `resolution_log.evidence` | Same |
| `created_at` | `resolution_log.created_at` | Same |

### `memory_processing_log` → `processing_log`

| Old Column | New Column | Notes |
|---|---|---|
| `event_id` | `processing_log.target_id` (with `target_type = 'event'`) | Generalized |
| `processed_at` | `processing_log.processed_at` | Same |
| `writer_run_id` | `processing_log.job_id` | Maps to job, not run ID |
| `created_at` | Removed | `processed_at` is sufficient |
| N/A | `processing_log.target_type` | NEW — 'event' or 'element' |
| N/A | `processing_log.job_type_id` | NEW — which job type processed this |

---

## Implementation Steps

1. Open `nex/src/db/memory.ts`
2. Delete entire body of `ensureMemorySchema()`
3. Write new body with all 14 tables in dependency order
4. Add FTS5 triggers
5. Add seed data inserts
6. Delete `ensureMemoryPlatformColumns()`, `ensureFactsColumns()`, and any other migration helpers
7. Add TypeScript type exports
8. Run `npm run build` — expect compilation errors in files that reference old table/column names (this is expected; subsequent phases fix them)

---

## Validation

- `ensureMemorySchema()` runs without error on a fresh database
- All 14 tables are created with correct columns and constraints
- Seed data is present in `set_definitions` and `job_types`
- FTS5 triggers fire correctly (insert an element, verify it appears in `elements_fts`)
- `schema_version` shows version 2
- Old tables (`facts`, `analysis_runs`, `mental_models`, `facets`, etc.) do NOT exist

---

## Expected Downstream Breakage

After this phase, the following files will have compilation errors. These are resolved in later phases:

| File | Errors | Resolved In |
|---|---|---|
| `memory-writer-tools.ts` | References to `facts`, `fact_entities`, `analysis_runs`, etc. | Phase 3 |
| `recall.ts` | References to `facts`, `facts_fts`, `analysis_runs`, etc. | Phase 4 |
| `retain-dispatch.ts` | References to `episodes`, `episode_events`, `memory_processing_log` | Phase 5 |
| `memory-consolidate-episode.ts` | References to `facts.is_consolidated` | Phase 5 |
| `memory-retain-episode.ts` | No direct schema refs, but downstream tool changes | Phase 5 |
| Test files | All schema helpers and assertions | Phase 6 |
