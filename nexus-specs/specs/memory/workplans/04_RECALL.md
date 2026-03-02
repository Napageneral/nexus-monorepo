# Phase 4 — Recall System Rewrite (recall.ts)

**Status:** ACTIVE
**Created:** 2026-03-01
**Phase:** 4 (depends on Phase 1)
**Spec:** ../MEMORY_RECALL.md, ../MEMORY_STORAGE_MODEL.md
**Primary Files:** `nex/src/memory/recall.ts`, `nex/src/memory/recall/` (if modularized)

---

## Overview

Heavy rewrite of the recall system to query the unified `elements` table, use `elements_fts` for all text search (replacing `facts_fts` + LIKE fallbacks), produce discriminated union result types, and use `processing_log` for consolidation state queries.

---

## Current State

### Query Paths

| Scope | Current FTS | Current Fallback | Target |
|---|---|---|---|
| `facts` | `facts_fts` (FTS5) | N/A | `elements_fts` WHERE type = 'fact' |
| `observations` | None | `LIKE` on `analysis_runs.output_text` | `elements_fts` WHERE type = 'observation' |
| `mental_models` | None | `LIKE` on `mental_models.description` + `mental_models.name` | `elements_fts` WHERE type = 'mental_model' |
| `entities` | N/A (name matching) | Entity name + alias search | Unchanged (identity.db) |

### Result Types

**Current:** Single flat `MemoryRecallResultItem` with `metadata: Record<string, unknown>` bag. All scopes return the same shape.

**Target:** Discriminated union with per-type result interfaces. Dual access: grouped arrays + ranked interleaved list.

---

## Changes

### R1. Unified FTS5 queries

**Current fact search:**
```sql
SELECT f.* FROM facts f
JOIN facts_fts fts ON fts.rowid = f.rowid
WHERE facts_fts MATCH ?
```

**New (all element types):**
```sql
SELECT e.* FROM elements e
JOIN elements_fts fts ON fts.rowid = e.rowid
WHERE elements_fts MATCH ?
AND e.type IN (?)  -- scope filter: 'fact', 'observation', 'mental_model'
```

**This eliminates the LIKE fallback.** Observations and mental models now get first-class FTS search identical to facts. The per-scope filters are applied via `AND e.type IN (...)` rather than separate query paths.

### R2. Builder function rewrites

Each scope builder reads from `elements` instead of its old table:

#### `buildFactResult()` — was reading from `facts`

```typescript
// Old: SELECT from facts WHERE ...
// New:
const rows = db.prepare(`
    SELECT e.id, e.content AS text, e.as_of, e.source_event_id, e.created_at, e.metadata,
           e.source_job_id, e.entity_id
    FROM elements e
    WHERE e.type = 'fact'
    AND ... -- FTS or embedding or temporal filter
`).all(...params);
```

Return type: `FactResult` with typed fields.

#### `buildObservationResult()` — was reading from `analysis_runs`

```typescript
// Old: SELECT ar.output_text, ar.analysis_type_id, ar.status, ar.parent_id FROM analysis_runs ar WHERE ...
// New:
const rows = db.prepare(`
    SELECT e.id, e.content AS text, e.parent_id, e.entity_id, e.created_at, e.metadata,
           e.source_job_id,
           successor.id AS successor_id
    FROM elements e
    LEFT JOIN elements successor ON successor.parent_id = e.id
    WHERE e.type = 'observation'
    AND ... -- FTS filter
`).all(...params);
```

Return type: `ObservationResult` with `parent_id`, `successor_id`, `is_head` (derived: `successor_id IS NULL`).

**Key change:** No more join to `analysis_runs`. The observation content IS the element. Job metadata (status, model, raw_output) is available via `elements.source_job_id` → `jobs` if needed, but not returned by default in recall.

#### `buildMentalModelResult()` — was reading from `mental_models`

```typescript
// Old: SELECT mm.name, mm.description, mm.entity_id, mm.pinned FROM mental_models mm WHERE ...
// New:
const rows = db.prepare(`
    SELECT e.id, e.content AS description, e.entity_id, e.pinned, e.parent_id, e.created_at, e.metadata,
           successor.id AS successor_id
    FROM elements e
    LEFT JOIN elements successor ON successor.parent_id = e.id
    WHERE e.type = 'mental_model'
    AND ... -- FTS filter
`).all(...params);

// Extract name from metadata JSON
const name = JSON.parse(row.metadata)?.name ?? '';
```

Return type: `MentalModelResult` with `name`, `description`, `entity_id`, `pinned`, `parent_id`, `successor_id`.

**Removed fields:** `subtype`, `is_stale`, `last_refreshed`, `refresh_trigger`, `tags`, `access_count`.

### R3. Discriminated union result types

**Spec:** MEMORY_RECALL.md § Result Types.

```typescript
interface FactResult {
    type: 'fact';
    id: string;
    text: string;
    as_of: number | null;
    source_event_id: string | null;
    entity_id: string | null;
    created_at: number;
    metadata: Record<string, unknown> | null;
    score: number;  // retrieval relevance score
}

interface ObservationResult {
    type: 'observation';
    id: string;
    text: string;
    parent_id: string | null;
    successor_id: string | null;
    is_head: boolean;
    entity_id: string | null;
    created_at: number;
    metadata: Record<string, unknown> | null;
    score: number;
}

interface MentalModelResult {
    type: 'mental_model';
    id: string;
    name: string;
    description: string;
    entity_id: string | null;
    pinned: boolean;
    parent_id: string | null;
    successor_id: string | null;
    is_head: boolean;
    created_at: number;
    score: number;
}

interface EntityResult {
    type: 'entity';
    id: string;
    name: string;
    entity_type: string | null;
    merged_into: string | null;
    aliases: string[];
    score: number;
}

type RecallResultItem = FactResult | ObservationResult | MentalModelResult | EntityResult;

interface RecallResult {
    // Grouped by type
    facts: FactResult[];
    observations: ObservationResult[];
    mental_models: MentalModelResult[];
    entities: EntityResult[];
    // Interleaved by relevance
    ranked: RecallResultItem[];
}
```

### R4. `canonical_only` parameter for entity search

**Spec:** UNIFIED_ENTITY_STORE.md — entities have `merged_into` field for merge chains.

When `canonical_only = true`, entity search filters to `WHERE merged_into IS NULL`:

```sql
SELECT * FROM entities
WHERE merged_into IS NULL
AND (name LIKE ? OR id IN (SELECT entity_id FROM entity_aliases WHERE alias LIKE ?))
```

This is used by the writer's search-first entity resolution (Phase 3, T8).

### R5. `factsForEntity()` query update

**Current:** Queries `fact_entities` to find facts linked to an entity.

**New:** Queries `element_entities`:

```sql
SELECT e.* FROM elements e
JOIN element_entities ee ON ee.element_id = e.id
WHERE ee.entity_id = ?
AND e.type = 'fact'
ORDER BY e.created_at DESC
```

**Generalize to `elementsForEntity()`** — can filter by type or return all element types linked to an entity.

### R6. Unconsolidated facts query

**Current:** `WHERE is_consolidated = FALSE` on facts table.

**New:** Uses `processing_log` anti-join:

```sql
SELECT e.* FROM elements e
WHERE e.type = 'fact'
AND NOT EXISTS (
    SELECT 1 FROM processing_log pl
    WHERE pl.target_type = 'element'
    AND pl.target_id = e.id
    AND pl.job_type_id = 'consolidate_v1'
)
```

This pattern is used by the consolidation scheduler and the consolidator meeseeks automation.

### R7. Embedding queries

**Current:** Cross-DB ATTACH to `embeddings.db`, query `vec_embeddings` with `target_type` matching table names.

**New:** Same cross-DB ATTACH pattern. `target_type` values stay the same ('fact', 'observation', 'mental_model') — they now match `elements.type` directly. The `target_id` references `elements.id`.

No fundamental change to embedding retrieval, just update the join:

```sql
-- Old: JOIN facts f ON f.id = e.target_id
-- New: JOIN elements el ON el.id = e.target_id AND el.type = e.target_type
```

### R8. RRF fusion and result assembly

**Current:** After all scope searches complete, RRF fuses results into a flat ranked list.

**New:** RRF fusion produces both the `ranked` interleaved list AND the grouped arrays from the same result set. After fusion:

```typescript
const result: RecallResult = {
    facts: [],
    observations: [],
    mental_models: [],
    entities: [],
    ranked: [],
};

for (const item of fusedResults) {
    result.ranked.push(item);
    switch (item.type) {
        case 'fact': result.facts.push(item); break;
        case 'observation': result.observations.push(item); break;
        case 'mental_model': result.mental_models.push(item); break;
        case 'entity': result.entities.push(item); break;
    }
}
```

### R9. Remove `MemoryRecallResultItem`

Delete the old flat interface with its `metadata: Record<string, unknown>` bag. All consumers must use the discriminated union.

**Consumers to update:**
- Memory injection meeseeks (reads recall results in system prompt)
- Recall tool output formatting
- Memory search skill
- Reflect skill
- Any CLI commands that display recall results

---

## Cross-DB Query Updates

Recall uses ATTACH to join across databases. These cross-DB joins need updating:

| Cross-DB Join | Old Pattern | New Pattern |
|---|---|---|
| Memory → Embeddings | `JOIN facts ON target_id` | `JOIN elements ON target_id` |
| Memory → Events | `JOIN events ON source_event_id` | `JOIN events ON elements.source_event_id` |
| Memory → Identity | `JOIN contacts ON sender_id` | `JOIN contacts ON contact_id` (after Phase 2) |

### Events.db Column Renames

The recall system queries `events.db` for cross-DB joins and short-term event context. These column names changed in the events schema:

| Old Column | New Column | Notes |
|---|---|---|
| `from_identifier` | `sender_id` | Already matches the element-level field name |
| `source` + `source_id` | `event_id` | Adapter's original ID; `id` (PK) unchanged |
| `to_recipients` | `recipients` | |
| `reply_to` | `reply_to_id` | |
| `type` | *(dropped)* | |
| `direction` | *(dropped)* | |
| `is_retained` | *(dropped)* | Use `processing_log` anti-join instead |

**New columns on events:** `receiver_id`, `space_id`, `container_kind`, `container_id`, `request_id`.

Any recall queries that join to events or filter on event columns must use the new names. In particular, short-term event retrieval that previously filtered `is_retained = FALSE` must now use a `processing_log` anti-join:

```sql
-- Old: WHERE events.is_retained = FALSE
-- New:
SELECT ev.* FROM events ev
WHERE NOT EXISTS (
    SELECT 1 FROM processing_log pl
    WHERE pl.target_type = 'event'
    AND pl.target_id = ev.id
    AND pl.job_type_id = 'retain_v1'
)
```

---

## Implementation Steps

1. Define new result type interfaces (`FactResult`, `ObservationResult`, etc.)
2. Define `RecallResult` with grouped arrays + ranked list
3. Rewrite `buildFactResult()` → query `elements WHERE type = 'fact'`
4. Rewrite `buildObservationResult()` → query `elements WHERE type = 'observation'` with successor LEFT JOIN
5. Rewrite `buildMentalModelResult()` → query `elements WHERE type = 'mental_model'` with metadata name extraction
6. Update all FTS queries from `facts_fts` → `elements_fts` with type filter
7. Add `canonical_only` parameter to entity search
8. Rename `factsForEntity()` → `elementsForEntity()` with optional type filter
9. Update unconsolidated facts query to use `processing_log` anti-join
10. Update embedding joins to reference `elements` table
11. Update RRF fusion to produce both grouped + ranked results
12. Remove `MemoryRecallResultItem` and update all consumers
13. Update recall tool output format

---

## Validation

- FTS search returns facts, observations, AND mental models (previously only facts)
- Observation search no longer uses LIKE — verify FTS matches
- `canonical_only=true` filters merged entities
- `elementsForEntity()` returns all element types linked to an entity
- Unconsolidated facts query uses processing_log anti-join correctly
- Result types are properly discriminated (type field present on every result)
- Both `result.ranked` and `result.facts`/`result.observations` are populated
- Cross-DB embedding queries work correctly
- `npm run build` — zero compilation errors
- `npm test` — passes
