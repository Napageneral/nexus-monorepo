# Phase 6 — Test File Updates

**Status:** ACTIVE
**Created:** 2026-03-01
**Phase:** 6 (follows all other phases)
**Files:** All `*.test.ts` files related to memory

---

## Overview

After all production code is rewritten (Phases 1–5), every test file that touches memory tables, writer tools, recall, or the retain pipeline needs updating. This phase catalogs all affected test files, classifies the severity of changes needed, and defines the update strategy.

---

## Affected Test Files

### Tier 1: Heavy Changes (schema helpers, tool mocks, core assertions)

These tests directly create/query memory tables or mock writer tools. They need significant rewrites.

| File | What It Tests | Key Changes |
|---|---|---|
| `memory/recall.test.ts` | Recall system | All queries → `elements` table; result types → discriminated union; FTS → `elements_fts`; `is_consolidated` → `processing_log` |
| `memory/recall.temporal.test.ts` | Temporal recall strategies | Table refs → `elements`; `as_of` queries stay similar |
| `memory/recall.link-expansion.test.ts` | Link expansion in recall | `causal_links` → `element_links`; `link_type` param |
| `memory/recall.graph.test.ts` | Graph traversal | `causal_links` → `element_links`; `fact_entities` → `element_entities` |
| `memory/consolidation.test.ts` | Consolidation pipeline | `analysis_runs` → `elements`; `is_consolidated` → `processing_log`; `observation_facts` → `set_members` |
| `memory/retain-dispatch.test.ts` | Retain dispatch | `episodes` → `sets`; `episode_events` → `set_members`; `memory_processing_log` → `processing_log` |
| `memory/retain-episodes.test.ts` | Episode grouping | Interface changes (`EpisodeParticipant` fields); `sender_id` → `contact_id` in participants |
| `memory/retain-live.test.ts` | Live retain pipeline | Episode → set creation; processing_log writes |
| `agents/tools/memory-recall-tool.test.ts` | Recall tool integration | Result type changes; tool output format |
| `agents/tools/memory-tool.citations.test.ts` | Memory tool citation handling | Table refs if citations query memory tables |
| `agents/tools/memory-tool.does-not-crash-on-errors.test.ts` | Error resilience | Tool mock updates for renamed tools |
| `nex/automations/meeseeks/memory-retain-episode.test.ts` | Writer meeseeks | Job wrapping; task prompt tool name refs |
| `nex/automations/meeseeks/memory-reader.test.ts` | Injection meeseeks | File rename → `memory-injection.test.ts`; function name change |

### Tier 2: Moderate Changes (interface updates, contact rename ripple)

These tests reference memory types or identity fields but don't directly manipulate memory tables.

| File | What It Tests | Key Changes |
|---|---|---|
| `memory/adapter-contact-preload.test.ts` | Contact preloading | `sender_id` → `contact_id`; `sender_name` → `contact_name` |
| `db/identity-schema-migration.test.ts` | Identity schema | Column name changes in schema validation |
| `nex/pipeline.memory-context.test.ts` | Memory context injection | Automation name changes if testing by name |
| `nex/memory-supervisor.test.ts` | Memory supervisor | Supervision logic for new schema |
| `agents/memory-search.test.ts` | Memory search skill | Result type changes |
| `cli/memory-cli.test.ts` | CLI commands | Any CLI commands that interact with memory tables |
| `nex/automations/meeseeks/stream-params.test.ts` | Meeseeks stream params | Likely unchanged, but verify |
| `hooks/bundled/session-memory/handler.test.ts` | Session memory hook | May reference memory flush patterns |

### Tier 3: Light Changes (mock/fixture updates only)

These tests tangentially touch memory through mocks or fixtures.

| File | What It Tests | Key Changes |
|---|---|---|
| `reply/reply/memory-flush.test.ts` | Memory flush on reply | Mock updates if memory schema is referenced |
| `reply/reply/agent-runner.memory-flush.*.test.ts` (5 files) | Agent runner memory flush | Mock/fixture updates |
| `reply/reply/agent-runner-execution.memory-context.test.ts` | Execution memory context | Injection meeseeks name changes |
| `nex/automations/hooks-runtime.hookpoints.test.ts` | Hook runtime | Automation registration changes |
| `nex/automations/services.test.ts` | Automation services | Service interface changes |

### Tier 4: Likely Unchanged (verify only)

These files mention memory keywords but probably don't need changes:

| File | What It Tests | Why Likely Unchanged |
|---|---|---|
| `memory/manager.*.test.ts` (6 files) | File-based memory manager | V1 file-based system, not knowledge graph |
| `memory/hybrid.test.ts` | Hybrid memory | V1 system |
| `memory/search-manager.test.ts` | Search manager | V1 file-based search |
| `memory/backend-config.test.ts` | Backend config | Configuration only |
| `memory/index.test.ts` | Memory module index | Module exports |
| `memory/batch-voyage.test.ts` | Voyage batch embedding | Embedding API, not schema |
| `memory/qmd-manager.test.ts` | QMD manager | Query-specific |
| `extensions/memory-lancedb/index.test.ts` | LanceDB extension | Extension-specific |

---

## Common Test Patterns to Update

### Pattern A: Schema helper — creating test databases

Many tests create in-memory SQLite databases with the memory schema for testing:

```typescript
// Old pattern:
const db = new DatabaseSync(':memory:');
ensureMemorySchema(db);
db.prepare('INSERT INTO facts (id, text, as_of, ...) VALUES (?, ?, ?, ...)').run(...);

// New pattern:
const db = new DatabaseSync(':memory:');
ensureMemorySchema(db);
db.prepare('INSERT INTO elements (id, type, content, as_of, ...) VALUES (?, "fact", ?, ?, ...)').run(...);
```

**Strategy:** Create a shared test helper that creates a test memory database with common seed data. This reduces duplication across test files.

```typescript
// test/helpers/memory-test-db.ts
export function createTestMemoryDb() {
    const db = new DatabaseSync(':memory:');
    ensureMemorySchema(db);
    return db;
}

export function seedTestFact(db: DatabaseSync, overrides?: Partial<{
    id: string; content: string; as_of: number; source_event_id: string;
}>) {
    const defaults = { id: 'test-fact-1', content: 'Test fact', as_of: 1700000000, ... };
    const fact = { ...defaults, ...overrides };
    db.prepare(`INSERT INTO elements (id, type, content, as_of, created_at) VALUES (?, 'fact', ?, ?, ?)`).run(
        fact.id, fact.content, fact.as_of, Math.floor(Date.now() / 1000)
    );
    return fact;
}

export function seedTestObservation(db: DatabaseSync, overrides?: Partial<{...}>) { ... }
export function seedTestSet(db: DatabaseSync, overrides?: Partial<{...}>) { ... }
export function seedTestJob(db: DatabaseSync, overrides?: Partial<{...}>) { ... }
```

### Pattern B: Writer tool mocks

Tests that mock writer tools need updated tool names:

```typescript
// Old mocks:
{ name: 'insert_fact', ... }
{ name: 'link_fact_entity', ... }
{ name: 'create_observation', ... }
{ name: 'mark_facts_consolidated', ... }
{ name: 'resolve_observation_head', ... }
{ name: 'insert_causal_link', ... }

// New mocks:
{ name: 'insert_fact', ... }  // same
{ name: 'link_element_entity', ... }
{ name: 'consolidate_facts', ... }  // unified tool
{ name: 'resolve_element_head', ... }
{ name: 'insert_element_link', ... }
{ name: 'confirm_entity', ... }  // new tool
```

### Pattern C: Recall result assertions

Tests that assert recall result shapes need updating for discriminated union:

```typescript
// Old assertions:
expect(result.metadata.is_stale).toBe(false);
expect(result.text).toBeDefined();

// New assertions:
expect(result.type).toBe('fact');
if (result.type === 'fact') {
    expect(result.text).toBeDefined();
    expect(result.as_of).toBeDefined();
}
```

### Pattern D: Contact field assertions

Tests referencing contacts need field name updates:

```typescript
// Old:
expect(contact.sender_id).toBe('+16319056994');
expect(contact.sender_name).toBe('Casey');

// New:
expect(contact.contact_id).toBe('+16319056994');
expect(contact.contact_name).toBe('Casey');
```

### Pattern E: Episode → Set assertions

Tests checking episode creation need set assertions:

```typescript
// Old:
const episode = db.prepare('SELECT * FROM episodes WHERE id = ?').get(id);
const events = db.prepare('SELECT * FROM episode_events WHERE episode_id = ?').all(id);

// New:
const set = db.prepare('SELECT * FROM sets WHERE id = ?').get(id);
const members = db.prepare('SELECT * FROM set_members WHERE set_id = ?').all(id);
expect(set.definition_id).toBe('retain');
expect(members[0].member_type).toBe('event');
```

### Pattern F: is_consolidated → processing_log

```typescript
// Old:
const unconsolidated = db.prepare('SELECT * FROM facts WHERE is_consolidated = FALSE').all();

// New:
const unconsolidated = db.prepare(`
    SELECT e.* FROM elements e
    WHERE e.type = 'fact'
    AND NOT EXISTS (
        SELECT 1 FROM processing_log pl
        WHERE pl.target_type = 'element' AND pl.target_id = e.id AND pl.job_type_id = 'consolidate_v1'
    )
`).all();
```

---

## Implementation Steps

1. Create shared test helpers (`memory-test-db.ts`) with seed functions
2. Update Tier 1 tests (heavy changes) — one file at a time, verify each passes
3. Update Tier 2 tests (moderate changes) — interface and field name updates
4. Update Tier 3 tests (light changes) — mock and fixture updates
5. Verify Tier 4 tests (likely unchanged) — run and confirm they pass without changes
6. Rename `memory-reader.test.ts` → `memory-injection.test.ts`
7. Run full test suite: `npm test`

---

## Validation

- `npm test` — all tests pass
- No references to old table names (`facts`, `fact_entities`, `analysis_runs`, `observation_facts`, `causal_links`, `mental_models`, `episodes`, `episode_events`, `episode_definitions`, `memory_processing_log`) in test files
- No references to `sender_id`/`sender_name` in identity-related test assertions
- No references to old tool names (`link_fact_entity`, `create_observation`, `update_observation`, `mark_facts_consolidated`, `resolve_observation_head`, `insert_causal_link`) in tool mocks
- Shared test helpers are used consistently
- All test assertions use discriminated union result types where applicable
