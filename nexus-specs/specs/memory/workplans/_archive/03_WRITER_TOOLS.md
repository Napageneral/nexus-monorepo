# Phase 3 — Writer Tools Rewrite (memory-writer-tools.ts)

**Status:** ACTIVE
**Created:** 2026-03-01
**Phase:** 3 (parallel-safe with Phase 2; depends on Phase 1)
**Spec:** ../MEMORY_STORAGE_MODEL.md, ../MEMORY_WRITER.md, ../MEMORY_CONSOLIDATION.md
**Primary File:** `nex/src/agents/tools/memory-writer-tools.ts`

---

## Overview

Heavy rewrite of all memory writer tools to target the unified Elements/Sets/Jobs schema. Every tool that writes to `facts`, `analysis_runs`, `mental_models`, `fact_entities`, `observation_facts`, or `causal_links` must be rewritten to write to `elements`, `element_entities`, `element_links`, `sets`, `set_members`, `jobs`, and `job_outputs`.

This is the largest single workplan by code volume (~1200 lines of tool implementations).

---

## Current Tools → New Tools Mapping

| Current Tool | New Tool | Changes |
|---|---|---|
| `insert_fact` | `insert_fact` | Write to `elements` with `type='fact'`, link via `element_entities`, `job_outputs` |
| `create_entity` | `create_entity` | Unchanged entity creation; add search-first resolution flow; set `origin='writer'` |
| `link_fact_entity` | `link_element_entity` | Rename; write to `element_entities` instead of `fact_entities` |
| `propose_merge` | `propose_merge` | Unchanged — operates on identity.db entities |
| `create_observation` | `consolidate_facts` (pattern 1) | Write to `elements` with `type='observation'`, create `processing_log` entries |
| `update_observation` | `consolidate_facts` (pattern 2) | Version chain via `parent_id`, create `processing_log` entries |
| `mark_facts_consolidated` | `consolidate_facts` (pattern 3) | Create `processing_log` entries only, no observation element |
| `resolve_observation_head` | `resolve_element_head` | Query `elements` with LEFT JOIN for successor |
| `insert_causal_link` | `insert_element_link` | Write to `element_links` with `link_type` parameter |
| `create_mental_model` | `create_mental_model` | Write to `elements` with `type='mental_model'`, name in metadata |
| `update_mental_model` | `update_mental_model` | Version chain via `parent_id` on elements |
| `write_attachment_interpretation` | `write_attachment_interpretation` | Unchanged — operates on events.db |
| `read_attachment_interpretation` | `read_attachment_interpretation` | Unchanged — reads from events.db |

---

## Tool-by-Tool Implementation Details

### T1. `insert_fact` → writes to `elements`

**Current:** Inserts into `facts` table with columns `id, text, as_of, ingested_at, source_episode_id, source_event_id, metadata`.

**New:**
```typescript
// Schema
const InsertFactSchema = {
    text: z.string(),
    as_of: z.number().optional(),
    source_event_id: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
};

// Execution
const id = generateULID();
const now = Math.floor(Date.now() / 1000);

db.prepare(`
    INSERT INTO elements (id, type, content, as_of, source_event_id, source_job_id, created_at, metadata)
    VALUES (?, 'fact', ?, ?, ?, ?, ?, ?)
`).run(id, text, as_of ?? null, source_event_id ?? null, currentJobId, now, metadata ? JSON.stringify(metadata) : null);

// Register in job_outputs
db.prepare(`INSERT OR IGNORE INTO job_outputs (job_id, element_id) VALUES (?, ?)`).run(currentJobId, id);
```

**Key changes:**
- `text` → `content`
- `ingested_at` → `created_at`
- `source_episode_id` removed (derived from `jobs.input_set_id`)
- `source_job_id` added (linking to the current job)
- Must register in `job_outputs`
- Embedding computation: target table changes from `facts` to `elements`, `target_type = 'fact'`

### T2. `link_element_entity` (was `link_fact_entity`)

**Current:** Inserts into `fact_entities`, calls `appendEntityResolutionLog()` with `source_fact_id`.

**New:**
```typescript
// Rename tool from link_fact_entity → link_element_entity
const LinkElementEntitySchema = {
    element_id: z.string(),   // was: fact_id
    entity_id: z.string(),
};

db.prepare(`
    INSERT OR IGNORE INTO element_entities (element_id, entity_id) VALUES (?, ?)
`).run(element_id, entity_id);

// Resolution log: source_fact_id → source_element_id
appendEntityResolutionLog({
    entity_id,
    action: 'linked',
    source_element_id: element_id,   // was: source_fact_id
    evidence: `Linked element ${element_id} to entity ${entity_id}`,
});
```

**Also remove:**
- `mention_count` / `last_seen` updates on entities — these were denormalized counters. Access log handles this now.

### T3. `consolidate_facts` (unified tool — replaces 3 tools)

**Spec:** MEMORY_CONSOLIDATION.md § The `consolidate_facts` Tool.

**Schema:**
```typescript
const ConsolidateFactsSchema = {
    fact_ids: z.array(z.string()).min(1),
    text: z.string().optional(),
    observation_id: z.string().optional(),
};
```

**Three patterns:**

**Pattern 1: New observation** (`fact_ids` + `text`, no `observation_id`)
```typescript
const elemId = generateULID();
const now = Math.floor(Date.now() / 1000);

// Create observation element
db.prepare(`
    INSERT INTO elements (id, type, content, source_job_id, created_at)
    VALUES (?, 'observation', ?, ?, ?)
`).run(elemId, text, currentJobId, now);

// Register in job_outputs
db.prepare(`INSERT OR IGNORE INTO job_outputs (job_id, element_id) VALUES (?, ?)`).run(currentJobId, elemId);

// Mark facts as consolidated
for (const factId of fact_ids) {
    db.prepare(`
        INSERT OR IGNORE INTO processing_log (target_type, target_id, job_type_id, job_id, processed_at)
        VALUES ('element', ?, 'consolidate_v1', ?, ?)
    `).run(factId, currentJobId, now);
}

// Compute embedding for new observation
```

**Pattern 2: Update existing** (`fact_ids` + `text` + `observation_id`)
```typescript
// Resolve HEAD of observation chain
const head = resolveElementHead(observation_id);

const elemId = generateULID();
const now = Math.floor(Date.now() / 1000);

// Create new version with parent_id pointing to HEAD
db.prepare(`
    INSERT INTO elements (id, type, content, parent_id, source_job_id, created_at)
    VALUES (?, 'observation', ?, ?, ?, ?)
`).run(elemId, text, head.id, currentJobId, now);

// Register in job_outputs
db.prepare(`INSERT OR IGNORE INTO job_outputs (job_id, element_id) VALUES (?, ?)`).run(currentJobId, elemId);

// Mark facts as consolidated
for (const factId of fact_ids) {
    db.prepare(`
        INSERT OR IGNORE INTO processing_log (target_type, target_id, job_type_id, job_id, processed_at)
        VALUES ('element', ?, 'consolidate_v1', ?, ?)
    `).run(factId, currentJobId, now);
}
```

**Pattern 3: Skip** (`fact_ids` only, no `text`, no `observation_id`)
```typescript
const now = Math.floor(Date.now() / 1000);

// Just mark facts as consolidated — no observation created
for (const factId of fact_ids) {
    db.prepare(`
        INSERT OR IGNORE INTO processing_log (target_type, target_id, job_type_id, job_id, processed_at)
        VALUES ('element', ?, 'consolidate_v1', ?, ?)
    `).run(factId, currentJobId, now);
}
```

### T4. `resolve_element_head` (was `resolve_observation_head`)

**Current:** Queries `analysis_runs WHERE analysis_type_id = 'observation_v1'` and follows parent chain.

**New:**
```typescript
// Find the HEAD of a version chain starting from any element in the chain
function resolveElementHead(elementId: string) {
    // Follow the chain forward: find the element that has no successor
    const head = db.prepare(`
        SELECT e.* FROM elements e
        LEFT JOIN elements successor ON successor.parent_id = e.id
        WHERE e.id = ?
        AND successor.id IS NULL
    `).get(elementId);

    if (head) return head;

    // If the given ID is not the HEAD, walk forward
    let current = elementId;
    while (true) {
        const successor = db.prepare(`
            SELECT id FROM elements WHERE parent_id = ?
        `).get(current);
        if (!successor) break;
        current = successor.id;
    }
    return db.prepare(`SELECT * FROM elements WHERE id = ?`).get(current);
}
```

**Rename the tool from `resolve_observation_head` → `resolve_element_head`.** The consolidator role prompt references this tool; update the prompt in the meeseeks task text.

### T5. `insert_element_link` (was `insert_causal_link`)

**Current:** Inserts into `causal_links` with `from_fact_id`, `to_fact_id`, `strength`.

**New:**
```typescript
const InsertElementLinkSchema = {
    from_element_id: z.string(),
    to_element_id: z.string(),
    link_type: z.enum(['causal', 'supports', 'contradicts', 'supersedes', 'derived_from']),
    strength: z.number().min(0).max(1).optional(),
};

const id = generateULID();
const now = Math.floor(Date.now() / 1000);

db.prepare(`
    INSERT INTO element_links (id, from_element_id, to_element_id, link_type, strength, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
`).run(id, from_element_id, to_element_id, link_type, strength ?? null, now);
```

### T6. `create_mental_model` → writes to `elements`

**Current:** Inserts into `mental_models` table with `name, description, entity_id, pinned, subtype`.

**New:**
```typescript
const CreateMentalModelSchema = {
    name: z.string(),
    description: z.string(),
    entity_id: z.string().optional(),
    pinned: z.boolean().optional(),
};

const id = generateULID();
const now = Math.floor(Date.now() / 1000);

db.prepare(`
    INSERT INTO elements (id, type, content, entity_id, pinned, source_job_id, created_at, metadata)
    VALUES (?, 'mental_model', ?, ?, ?, ?, ?, ?)
`).run(id, description, entity_id ?? null, pinned ? 1 : 0, currentJobId, now, JSON.stringify({ name }));
```

**Removed fields:** `subtype`, `tags`, `refresh_trigger`, `last_refreshed`.

### T7. `update_mental_model` → version chain on `elements`

**Current:** Updates `mental_models` row in place.

**New:** Creates a new element with `parent_id` pointing to the HEAD of the chain (same pattern as observation updates).

```typescript
const head = resolveElementHead(mental_model_id);
const id = generateULID();
const now = Math.floor(Date.now() / 1000);

db.prepare(`
    INSERT INTO elements (id, type, content, entity_id, parent_id, pinned, source_job_id, created_at, metadata)
    VALUES (?, 'mental_model', ?, ?, ?, ?, ?, ?, ?)
`).run(id, description, head.entity_id, head.id, head.pinned, currentJobId, now, JSON.stringify({ name: name || JSON.parse(head.metadata)?.name }));
```

### T8. `create_entity` — add search-first resolution

**Current:** Always generates a ULID and INSERTs. No duplicate checking.

**New:** Internally calls recall with `canonical_only=true` before creating. See MEMORY_WRITER.md § Entity Resolution for the two-step flow:

1. `create_entity("Ty", type="person")` → internal recall search
2. No matches → create immediately, return ID
3. Matches found → return `status: "pending_confirmation"` with candidate list
4. Agent calls `confirm_entity` to resolve

**New tool: `confirm_entity`**
```typescript
const ConfirmEntitySchema = z.union([
    z.object({ use_existing: z.string(), alias: z.string().optional() }),
    z.object({ create_new: z.literal(true), name: z.string(), type: z.string() }),
]);
```

Set `origin = 'writer'` on entities table when creating via writer tools.

---

## Cross-Cutting Changes

### C1. Remove `staleMentalModelsForFacts()`

This function proactively stales mental models when new facts are created. With the Elements/Sets/Jobs model, staleness is tracked via version chains and the reflect skill handles freshness at query time.

**Call sites to remove (3):**
- After `create_observation` → now `consolidate_facts` pattern 1
- After `update_observation` → now `consolidate_facts` pattern 2
- After `mark_facts_consolidated` → now `consolidate_facts` pattern 3

### C2. Remove `ensureCrossDbEntityReferenceCompatibility()`

This function migrates FK constraints between databases. With hard cutover, this migration helper is unnecessary.

### C3. Remove `ensureRetainEpisodeExists()`

This function writes to `episodes` + `episode_events` tables. With the new schema, the retain pipeline (Phase 5) handles set/set_member creation. Writer tools don't create episodes anymore.

### C4. Job context threading

Writer tools need access to the `currentJobId` to populate `elements.source_job_id` and `job_outputs`. This ID must be threaded through the tool execution context.

**Mechanism: Session-label encoding + explicit option override.**

The meeseeks dispatch (Phase 5) creates a `jobs` row before starting the meeseeks. The `jobId` is encoded in the session label string:

```
meeseeks:memory-writer:{parentSession}:episode:{episodeId}:job:{jobId}
```

The tool factory extracts it via regex, with an explicit `currentJobId` option taking priority:

```typescript
// In tool factory function:
function createMemoryWriterTools(options: {
    memoryDb: DatabaseSync;
    sessionKey: string;       // contains encoded jobId
    currentJobId?: string;    // explicit override (for testing / future broker enhancements)
    // ... other context
}) {
    // Extract jobId from session label, with explicit option taking priority
    const jobIdMatch = options.sessionKey.match(/:job:([^:]+)$/);
    const currentJobId = options.currentJobId?.trim() || (jobIdMatch ? jobIdMatch[1] : "") || "";

    // Each tool uses currentJobId for source_job_id and job_outputs
}
```

**Why session-label encoding:** `startBrokerExecution` doesn't have a `toolContext` parameter for passing arbitrary data to tool factories. The session label is the existing communication channel from meeseeks dispatch to tool creation, flowing end-to-end through `NexusRequest.agent.session_key`. Encoding the jobId there requires zero new infrastructure.

### C5. Session type detection

**Current:** Tools detect writer vs. consolidator context by parsing the session label:
- `meeseeks:memory-writer:` → writer tools
- `meeseeks:memory-consolidator:` → consolidator tools

**New:** This detection stays the same. The consolidator gets `consolidate_facts` + `resolve_element_head` + `insert_element_link`. The writer gets `insert_fact` + `create_entity` + `confirm_entity` + `link_element_entity` + `propose_merge`. Both get `recall`, `write_attachment_interpretation`, `read_attachment_interpretation`.

### C6. Attachment tools — composite PK awareness

The `write_attachment_interpretation` and `read_attachment_interpretation` tools operate on `events.db`. The attachments table PK changes from `id` alone to a composite `(event_id, id)`, and the `attachment_interpretations` FK becomes `(event_id, attachment_id)`. The tools work the same way conceptually, but SQL statements must include the `event_id` in all key lookups and FK references. Ensure any INSERT/SELECT/JOIN on `attachments` or `attachment_interpretations` uses the composite key.

### C7. Embedding target type updates

All embedding writes currently reference `target_type = 'fact'`, `'observation'`, or `'mental_model'` with table-specific IDs. With the unified elements table:
- `target_id` still references the element ID
- `target_type` still uses `'fact'`, `'observation'`, `'mental_model'`
- The embedding computation code stays the same conceptually — just reads `content` from `elements` instead of `text` from `facts` / `output_text` from `analysis_runs` / `description` from `mental_models`

---

## Implementation Steps

1. Add `currentJobId` parameter to tool factory/context
2. Rewrite `insert_fact` → writes to `elements`, `job_outputs`
3. Rename `link_fact_entity` → `link_element_entity`, write to `element_entities`
4. Create unified `consolidate_facts` tool (3 patterns)
5. Rename `resolve_observation_head` → `resolve_element_head`
6. Rename `insert_causal_link` → `insert_element_link` with `link_type` param
7. Rewrite `create_mental_model` → writes to `elements`
8. Rewrite `update_mental_model` → version chain on `elements`
9. Add search-first flow to `create_entity` + new `confirm_entity` tool
10. Remove `staleMentalModelsForFacts()`
11. Remove `ensureCrossDbEntityReferenceCompatibility()`
12. Remove `ensureRetainEpisodeExists()`
13. Update `appendEntityResolutionLog()` — `source_fact_id` → `source_element_id`
14. Update embedding computation to read from `elements.content`
15. Update tool registration (session type → tool list mapping)

---

## Validation

- All tools compile against the new schema
- `insert_fact` creates an element with `type='fact'` and registers in `job_outputs`
- `consolidate_facts` pattern 1 creates observation element + processing_log entries
- `consolidate_facts` pattern 2 creates new version with `parent_id` chain
- `consolidate_facts` pattern 3 only creates processing_log entries
- `link_element_entity` writes to `element_entities` (not `fact_entities`)
- `insert_element_link` writes to `element_links` with correct `link_type`
- `resolve_element_head` follows version chains correctly
- `create_entity` with search-first returns candidates when matches exist
- `confirm_entity` resolves pending entity creation
- No references to old table names (`facts`, `fact_entities`, `analysis_runs`, `observation_facts`, `causal_links`, `mental_models`)
