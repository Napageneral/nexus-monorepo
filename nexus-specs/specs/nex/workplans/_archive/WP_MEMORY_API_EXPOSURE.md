# Workplan: Memory API Exposure

**Status:** COMPLETED — commit ce203a1f8
**Created:** 2026-03-04
**Spec References:**
- [API_DESIGN_BATCH_3.md](../API_DESIGN_BATCH_3.md) (full memory domain spec)

**Dependencies:** None (wrapping existing internals)

---

## Goal

Expose the memory domain through 19 control-plane operations. The memory subsystem is production-grade internally (945-line recall engine, mature schema, 12 working agent tools) but has ZERO API endpoints. This is purely an API exposure exercise — wrapping existing implementations with RPC handlers, validation, and error handling.

---

## Current State

### Database Schema (memory.db)

**Already mature — NO CHANGES NEEDED:**
- `elements` (9 fields) — unified knowledge storage with type discriminator (fact/observation/mental_model)
- `elements_fts` — FTS5 virtual table with insert/update/delete triggers
- `element_entities` — junction table (element_id, entity_id)
- `element_links` — typed links between elements (causal, supports, contradicts, supersedes, derived_from)
- `sets` — polymorphic grouping containers (events, elements, other sets)
- `set_members` — junction table with member_type discriminator
- `set_definitions` — grouping strategies (thread_time_gap, knowledge_cluster, evidence_set, manual)

**NOTE:** Job-related tables (jobs, job_types, job_outputs, processing_log) are absorbed into unified jobs.* domain (WP7). Do NOT expose memory.jobs.* operations here.

### Existing Implementations

**Agent tools** (`src/agents/tools/`):
- `memory-writer-tools.ts` — 12 tools (insert_fact, create_entity, confirm_entity, link_element_entity, propose_merge, consolidate_facts, insert_element_link, resolve_element_head, create_mental_model, update_mental_model, write_attachment_interpretation, read_attachment_interpretation)
- `memory-recall-tool.ts` — unified search tool
- `memory-tool.ts` — general memory interface

**Recall engine** (`src/memory/recall.ts`):
- 945 lines, production-grade
- FTS + semantic embeddings + entity traversal + link traversal + short-term events
- RRF fusion across strategies
- Budget control (low/mid/high)
- Returns grouped + ranked results

**Database operations** (`src/db/memory.ts`):
- Schema definition and initialization
- Type exports for all row types

**Admin operations** (`src/nex/control-plane/server-methods/memory-review.ts`):
- 11 existing operations for reviewing memory runs, episodes, entities, facts, observations
- These are being REPLACED by the unified primitives — keep nothing from this file

### What's Missing

**Zero control-plane operations.** The memory domain has never been exposed via RPC. Agents access memory through tools that directly call internal functions. External callers cannot access memory at all.

---

## Target State

### 19 Operations Across 4 Sub-Domains

#### memory.elements.* (11 operations)

| Operation | Type | Description |
|-----------|------|-------------|
| `memory.elements.query` | read | SQL-style filtering (type, entity_id, pinned, created_at range, has_successor, source_job_id, source_event_id) |
| `memory.elements.get` | read | Get element by ID with entity links and link summary |
| `memory.elements.create` | write | Create element (type-discriminated). Accepts `entity_ids[]` for auto-linking. Accepts `parent_id` for version chains. Embeddings auto-generated. |
| `memory.elements.head` | read | Resolve to HEAD of version chain (follow successors to tip) |
| `memory.elements.history` | read | Get full version chain for an element (all ancestors and successors) |
| `memory.elements.entities.list` | read | List entity links for an element |
| `memory.elements.entities.link` | write | Link element to entity |
| `memory.elements.entities.unlink` | write | Remove element-entity link |
| `memory.elements.links.list` | read | List links for an element (filter by link_type, direction) |
| `memory.elements.links.create` | write | Create typed link between elements |
| `memory.elements.links.traverse` | read | Multi-hop graph traversal from seed element. Params: start_id, link_types[], direction, max_depth, max_results. Returns subgraph with paths. |

#### memory.recall (1 operation)

| Operation | Type | Description |
|-----------|------|-------------|
| `memory.recall` | read | Unified search across all layers. Params: query, scope[], entity, time_after, time_before, platform, thread_id, thread_lookback_events, max_results, budget. Returns RecallResult with grouped arrays + ranked list. |

#### memory.sets.* (5 operations)

| Operation | Type | Description |
|-----------|------|-------------|
| `memory.sets.list` | read | List sets (filter by definition_id, time range, metadata fields) |
| `memory.sets.get` | read | Get set with member summary (counts by member_type, time range) |
| `memory.sets.create` | write | Create a set with definition reference and optional metadata |
| `memory.sets.members.list` | read | List members of a set (polymorphic: events, elements, sub-sets) |
| `memory.sets.members.add` | write | Add member to set (specify member_type and member_id) |

#### Special Agent Tools (3 operations)

| Operation | Type | Description |
|-----------|------|-------------|
| `memory.entities.create` | write | Recall-first entity creation. Searches for similar entities, returns candidates with confidence scores. Agent decides next step. |
| `memory.entities.confirm` | write | Confirm entity decision after create. Accept existing match, create new, or merge. Completes the create-or-find flow. |
| `memory.consolidate` | write | Compound consolidation: create/update observation from facts, add element_links, mark processing_log. Three patterns: create, update, skip. |

**Total: 19 operations** (not including memory.jobs.* which are absorbed into WP7)

---

## Changes Required

### Database Schema

**NO CHANGES.** The memory.db schema is mature and stable. All operations work with existing tables.

### New Code

**1. Control plane handlers** — `src/nex/control-plane/server-methods/memory.ts` (new file)

Structure:
```typescript
import type { RuntimeRequestHandlers } from './types.js';
import { openLedger } from '../../../db/ledgers.js';
import { ensureMemorySchema } from '../../../db/memory.js';
import { recall } from '../../../memory/recall.js';
import { ErrorCodes, errorShape } from '../protocol/index.js';

export const memoryHandlers: RuntimeRequestHandlers = {
  // Elements (11 ops)
  'memory.elements.query': async ({ params, respond }) => { /* ... */ },
  'memory.elements.get': async ({ params, respond }) => { /* ... */ },
  'memory.elements.create': async ({ params, respond }) => { /* ... */ },
  'memory.elements.head': async ({ params, respond }) => { /* ... */ },
  'memory.elements.history': async ({ params, respond }) => { /* ... */ },
  'memory.elements.entities.list': async ({ params, respond }) => { /* ... */ },
  'memory.elements.entities.link': async ({ params, respond }) => { /* ... */ },
  'memory.elements.entities.unlink': async ({ params, respond }) => { /* ... */ },
  'memory.elements.links.list': async ({ params, respond }) => { /* ... */ },
  'memory.elements.links.create': async ({ params, respond }) => { /* ... */ },
  'memory.elements.links.traverse': async ({ params, respond }) => { /* ... */ },

  // Recall (1 op)
  'memory.recall': async ({ params, respond }) => {
    // Direct wrapper around recall() function from recall.ts
    try {
      const result = await recall({
        query: params.query,
        scope: params.scope,
        entity: params.entity,
        time_after: params.time_after,
        time_before: params.time_before,
        platform: params.platform,
        thread_id: params.thread_id,
        thread_lookback_events: params.thread_lookback_events,
        max_results: params.max_results,
        budget: params.budget
      });
      respond(true, result, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL, String(error)));
    }
  },

  // Sets (5 ops)
  'memory.sets.list': async ({ params, respond }) => { /* ... */ },
  'memory.sets.get': async ({ params, respond }) => { /* ... */ },
  'memory.sets.create': async ({ params, respond }) => { /* ... */ },
  'memory.sets.members.list': async ({ params, respond }) => { /* ... */ },
  'memory.sets.members.add': async ({ params, respond }) => { /* ... */ },

  // Special agent tools (3 ops)
  'memory.entities.create': async ({ params, respond }) => { /* ... */ },
  'memory.entities.confirm': async ({ params, respond }) => { /* ... */ },
  'memory.consolidate': async ({ params, respond }) => { /* ... */ }
};
```

**2. Memory DB operations wrapper** — `src/db/memory.ts` additions

Add query/CRUD functions that don't currently exist:

```typescript
// Elements query
export interface ElementQueryOptions {
  type?: ElementType | ElementType[];
  entity_id?: string;
  pinned?: boolean;
  created_after?: number;
  created_before?: number;
  has_successor?: boolean;
  source_job_id?: string;
  source_event_id?: string;
  limit?: number;
  offset?: number;
}

export function queryElements(db: DatabaseSync, opts: ElementQueryOptions): ElementRow[] {
  const where: string[] = [];
  const values: SQLInputValue[] = [];

  if (opts.type) {
    if (Array.isArray(opts.type)) {
      where.push(`type IN (${opts.type.map(() => '?').join(',')})`);
      values.push(...opts.type);
    } else {
      where.push('type = ?');
      values.push(opts.type);
    }
  }
  if (opts.entity_id) {
    where.push('entity_id = ?');
    values.push(opts.entity_id);
  }
  if (opts.pinned !== undefined) {
    where.push('pinned = ?');
    values.push(opts.pinned ? 1 : 0);
  }
  if (opts.created_after) {
    where.push('created_at >= ?');
    values.push(opts.created_after);
  }
  if (opts.created_before) {
    where.push('created_at <= ?');
    values.push(opts.created_before);
  }
  if (opts.has_successor !== undefined) {
    // Check if this element is referenced as parent_id by any other element
    if (opts.has_successor) {
      where.push('EXISTS (SELECT 1 FROM elements e2 WHERE e2.parent_id = elements.id)');
    } else {
      where.push('NOT EXISTS (SELECT 1 FROM elements e2 WHERE e2.parent_id = elements.id)');
    }
  }
  if (opts.source_job_id) {
    where.push('source_job_id = ?');
    values.push(opts.source_job_id);
  }
  if (opts.source_event_id) {
    where.push('source_event_id = ?');
    values.push(opts.source_event_id);
  }

  const limit = typeof opts.limit === 'number' ? Math.max(1, opts.limit) : 100;
  const offset = typeof opts.offset === 'number' ? Math.max(0, opts.offset) : 0;

  const sql = `
    SELECT * FROM elements
    ${where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;

  return db.prepare(sql).all(...values, limit, offset) as ElementRow[];
}

// Element version chain resolution
export function resolveElementHead(db: DatabaseSync, elementId: string): ElementRow | null {
  let current = getElement(db, elementId);
  if (!current) return null;

  let depth = 0;
  const maxDepth = 100; // prevent infinite loops

  while (depth < maxDepth) {
    // Check if there's a successor (another element with parent_id pointing to current)
    const successor = db.prepare(
      'SELECT * FROM elements WHERE parent_id = ? LIMIT 1'
    ).get(current.id) as ElementRow | undefined;

    if (!successor) return current; // No successor = we're at HEAD
    current = successor;
    depth++;
  }

  return current; // Hit max depth, return whatever we have
}

export function getElementHistory(db: DatabaseSync, elementId: string): ElementRow[] {
  const history: ElementRow[] = [];
  let current = getElement(db, elementId);
  if (!current) return history;

  // Walk backwards to root
  const ancestors: ElementRow[] = [];
  let depth = 0;
  while (current && depth < 100) {
    ancestors.unshift(current);
    if (!current.parent_id) break;
    current = getElement(db, current.parent_id);
    depth++;
  }

  // Walk forwards from root to all descendants
  // This is a simple linear chain for now (mental models and observations)
  return ancestors;
}

// Element-entity links
export function listElementEntities(db: DatabaseSync, elementId: string): string[] {
  const rows = db.prepare(
    'SELECT entity_id FROM element_entities WHERE element_id = ?'
  ).all(elementId) as Array<{ entity_id: string }>;
  return rows.map(r => r.entity_id);
}

export function linkElementEntity(db: DatabaseSync, elementId: string, entityId: string): void {
  db.prepare(
    'INSERT OR IGNORE INTO element_entities (element_id, entity_id) VALUES (?, ?)'
  ).run(elementId, entityId);
}

export function unlinkElementEntity(db: DatabaseSync, elementId: string, entityId: string): void {
  db.prepare(
    'DELETE FROM element_entities WHERE element_id = ? AND entity_id = ?'
  ).run(elementId, entityId);
}

// Element links
export interface ElementLinkQueryOptions {
  element_id: string;
  direction?: 'outbound' | 'inbound' | 'both';
  link_type?: LinkType | LinkType[];
}

export function queryElementLinks(db: DatabaseSync, opts: ElementLinkQueryOptions): ElementLinkRow[] {
  const where: string[] = [];
  const values: SQLInputValue[] = [];

  if (opts.direction === 'outbound' || !opts.direction || opts.direction === 'both') {
    where.push('from_element_id = ?');
    values.push(opts.element_id);
  }
  if (opts.direction === 'inbound' || opts.direction === 'both') {
    if (where.length > 0) {
      where.push('OR to_element_id = ?');
    } else {
      where.push('to_element_id = ?');
    }
    values.push(opts.element_id);
  }

  if (opts.link_type) {
    if (Array.isArray(opts.link_type)) {
      where.push(`link_type IN (${opts.link_type.map(() => '?').join(',')})`);
      values.push(...opts.link_type);
    } else {
      where.push('link_type = ?');
      values.push(opts.link_type);
    }
  }

  const sql = `SELECT * FROM element_links WHERE ${where.join(' AND ')} ORDER BY created_at DESC`;
  return db.prepare(sql).all(...values) as ElementLinkRow[];
}

// Graph traversal
export interface TraverseOptions {
  start_id: string;
  link_types?: LinkType[];
  direction?: 'outbound' | 'inbound' | 'both';
  max_depth?: number;
  max_results?: number;
}

export function traverseElementLinks(db: DatabaseSync, opts: TraverseOptions): {
  nodes: ElementRow[];
  edges: ElementLinkRow[];
} {
  const visited = new Set<string>();
  const nodes: ElementRow[] = [];
  const edges: ElementLinkRow[] = [];
  const queue: Array<{ id: string; depth: number }> = [{ id: opts.start_id, depth: 0 }];
  const maxDepth = opts.max_depth ?? 3;
  const maxResults = opts.max_results ?? 100;

  while (queue.length > 0 && nodes.length < maxResults) {
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    if (current.depth > maxDepth) continue;

    visited.add(current.id);
    const element = getElement(db, current.id);
    if (!element) continue;
    nodes.push(element);

    // Find connected elements
    const links = queryElementLinks(db, {
      element_id: current.id,
      direction: opts.direction,
      link_type: opts.link_types
    });

    for (const link of links) {
      edges.push(link);
      const nextId = link.from_element_id === current.id ? link.to_element_id : link.from_element_id;
      if (!visited.has(nextId)) {
        queue.push({ id: nextId, depth: current.depth + 1 });
      }
    }
  }

  return { nodes, edges };
}

// Sets
export interface SetQueryOptions {
  definition_id?: string;
  created_after?: number;
  created_before?: number;
  metadata_filter?: Record<string, unknown>;
  limit?: number;
  offset?: number;
}

export function querySets(db: DatabaseSync, opts: SetQueryOptions): SetRow[] {
  const where: string[] = [];
  const values: SQLInputValue[] = [];

  if (opts.definition_id) {
    where.push('definition_id = ?');
    values.push(opts.definition_id);
  }
  if (opts.created_after) {
    where.push('created_at >= ?');
    values.push(opts.created_after);
  }
  if (opts.created_before) {
    where.push('created_at <= ?');
    values.push(opts.created_before);
  }
  // metadata_filter would require JSON query functions - skip for now

  const limit = typeof opts.limit === 'number' ? Math.max(1, opts.limit) : 100;
  const offset = typeof opts.offset === 'number' ? Math.max(0, opts.offset) : 0;

  const sql = `
    SELECT * FROM sets
    ${where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;

  return db.prepare(sql).all(...values, limit, offset) as SetRow[];
}

export function getSet(db: DatabaseSync, setId: string): SetRow | null {
  const row = db.prepare('SELECT * FROM sets WHERE id = ? LIMIT 1').get(setId) as SetRow | undefined;
  return row ?? null;
}

export function listSetMembers(db: DatabaseSync, setId: string): SetMemberRow[] {
  return db.prepare(
    'SELECT * FROM set_members WHERE set_id = ? ORDER BY position ASC, added_at ASC'
  ).all(setId) as SetMemberRow[];
}

export function addSetMember(db: DatabaseSync, input: {
  set_id: string;
  member_type: SetMemberType;
  member_id: string;
  position?: number;
}): void {
  db.prepare(`
    INSERT INTO set_members (set_id, member_type, member_id, position, added_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    input.set_id,
    input.member_type,
    input.member_id,
    input.position ?? null,
    Date.now()
  );
}
```

**3. Protocol schemas** — `src/nex/control-plane/protocol/schema/memory.ts` (new file)

TypeBox schemas for all 19 operations:

```typescript
import { Type } from '@sinclair/typebox';

export const MemoryElementsQueryParams = Type.Object({
  type: Type.Optional(Type.Union([
    Type.String(),
    Type.Array(Type.String())
  ])),
  entity_id: Type.Optional(Type.String()),
  pinned: Type.Optional(Type.Boolean()),
  created_after: Type.Optional(Type.Number()),
  created_before: Type.Optional(Type.Number()),
  has_successor: Type.Optional(Type.Boolean()),
  source_job_id: Type.Optional(Type.String()),
  source_event_id: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Number()),
  offset: Type.Optional(Type.Number())
});

// ... schemas for all 19 operations
```

### Modified Files

**src/nex/control-plane/server.ts** — Register 19 new memory operations:

```typescript
import { memoryHandlers } from './server-methods/memory.js';

// In initialization:
Object.entries(memoryHandlers).forEach(([op, handler]) => {
  registerHandler(op, handler);
});
```

**src/agents/tools/memory-writer-tools.ts** — NO CHANGES

These tools continue to work as-is. They directly call DB functions. Once the API is exposed, we COULD refactor these tools to call the RPC operations instead, but that's optional and not part of this workplan.

### Deleted Files/Code

**Delete entirely:**
- `src/nex/control-plane/server-methods/memory-review.ts` — all 11 operations replaced by unified primitives

**Unregister operations:**
```typescript
// Remove these from control plane
unregister('memory.review.runs.list');
unregister('memory.review.run.get');
unregister('memory.review.run.episodes.list');
unregister('memory.review.episode.get');
unregister('memory.review.episode.outputs.get');
unregister('memory.review.entity.get');
unregister('memory.review.fact.get');
unregister('memory.review.observation.get');
unregister('memory.review.quality.summary');
unregister('memory.review.quality.items.list');
unregister('memory.review.search');
```

### Operations to Register

**Control plane:** `src/nex/control-plane/server.ts`

```typescript
registerHandler('memory.elements.query', memoryHandlers['memory.elements.query']);
registerHandler('memory.elements.get', memoryHandlers['memory.elements.get']);
registerHandler('memory.elements.create', memoryHandlers['memory.elements.create']);
registerHandler('memory.elements.head', memoryHandlers['memory.elements.head']);
registerHandler('memory.elements.history', memoryHandlers['memory.elements.history']);
registerHandler('memory.elements.entities.list', memoryHandlers['memory.elements.entities.list']);
registerHandler('memory.elements.entities.link', memoryHandlers['memory.elements.entities.link']);
registerHandler('memory.elements.entities.unlink', memoryHandlers['memory.elements.entities.unlink']);
registerHandler('memory.elements.links.list', memoryHandlers['memory.elements.links.list']);
registerHandler('memory.elements.links.create', memoryHandlers['memory.elements.links.create']);
registerHandler('memory.elements.links.traverse', memoryHandlers['memory.elements.links.traverse']);

registerHandler('memory.recall', memoryHandlers['memory.recall']);

registerHandler('memory.sets.list', memoryHandlers['memory.sets.list']);
registerHandler('memory.sets.get', memoryHandlers['memory.sets.get']);
registerHandler('memory.sets.create', memoryHandlers['memory.sets.create']);
registerHandler('memory.sets.members.list', memoryHandlers['memory.sets.members.list']);
registerHandler('memory.sets.members.add', memoryHandlers['memory.sets.members.add']);

registerHandler('memory.entities.create', memoryHandlers['memory.entities.create']);
registerHandler('memory.entities.confirm', memoryHandlers['memory.entities.confirm']);
registerHandler('memory.consolidate', memoryHandlers['memory.consolidate']);
```

---

## Execution Order

### Phase 1: DB Primitives (No Dependencies)

1. **Add query/CRUD functions to memory.ts**
   - `queryElements()` — SQL builder with 8 filter options
   - `resolveElementHead()` — walk successor chain to HEAD
   - `getElementHistory()` — full version chain
   - `listElementEntities()`, `linkElementEntity()`, `unlinkElementEntity()`
   - `queryElementLinks()` — filter by direction + link_type
   - `traverseElementLinks()` — BFS graph traversal with depth/result limits
   - `querySets()`, `getSet()`, `listSetMembers()`, `addSetMember()`

### Phase 2: Protocol Schemas (Depends on Phase 1 for type signatures)

2. **Write TypeBox schemas** (`protocol/schema/memory.ts`)
   - 19 param schemas
   - 19 response schemas
   - Export validators

### Phase 3: Handlers (Depends on Phase 1 + 2)

3. **Write control plane handlers** (`server-methods/memory.ts`)
   - 11 elements operations
   - 1 recall operation (direct wrapper)
   - 5 sets operations
   - 3 special agent tools (wrap existing implementations)

4. **Register operations in control plane server**
   - Import memoryHandlers
   - Register 19 operations
   - Unregister old memory.review.* operations

### Phase 4: Cleanup (Depends on Phase 3)

5. **Delete deprecated code**
   - Remove `server-methods/memory-review.ts`

### Phase 5: Testing (Depends on Phase 4)

6. **Smoke tests**
   - memory.elements.query with various filters → verify results
   - memory.elements.create → verify auto-embedding + entity linking
   - memory.elements.head → verify version chain resolution
   - memory.recall → verify existing recall() function works via RPC
   - memory.sets.create + members.add → verify polymorphic members
   - memory.elements.links.traverse → verify graph traversal

---

## Critical Path

**No blocking dependencies.** The memory schema is stable. The recall engine is production-grade. All DB operations exist. This is pure API wrapping.

**Parallelizable:**
- Phase 1 and Phase 2 can be written in parallel
- All 19 handlers in Phase 3 can be written in parallel

**Estimated complexity:** MEDIUM — significant code to write (19 handlers + 15+ DB functions + 38 TypeBox schemas) but no complex logic or cross-system integration. Mostly wrapping existing implementations with RPC boilerplate.
