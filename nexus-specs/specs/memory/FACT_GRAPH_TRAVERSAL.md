# Fact Graph Traversal — Relationship Query Patterns

**Status:** CANONICAL SPEC
**Last Updated:** 2026-03-02
**Related:** UNIFIED_ENTITY_STORE.md, MEMORY_SYSTEM.md, MEMORY_RECALL.md

> **Note:** The graph traversal patterns described here are the query-time relationship discovery mechanisms used by the recall API. See `MEMORY_RECALL.md` for how these integrate into the full recall pipeline (link expansion, MPFP, etc.).

---

## Overview

The knowledge graph (`elements` + `element_entities` in memory.db, `entities` in identity.db) implicitly encodes all entity relationships. Elements can be facts, observations, or mental models — all stored in the unified `elements` table and linked to entities via `element_entities`. Rather than maintaining a separate typed relationship table, Nexus derives relationship information at read time by traversing the element graph.

This spec defines the canonical query patterns that provide relationship-graph-equivalent power using existing primitives.

**Core insight:** A fact element like "Tyler works at Anthropic building Nexus" links three entities through `element_entities`. The relationship types are encoded in the natural language of the element content. The agent reads the elements and understands the relationships in context — no structured triples needed.

---

## Query Patterns

### 1. Direct Relationships — Who Is Connected to Entity X?

Returns all entities that co-occur with X in at least one element, ranked by co-mention frequency, with the element content explaining how they're connected.

```sql
SELECT
  e.id,
  e.name,
  e.type,
  COUNT(ee1.element_id) AS shared_element_count,
  GROUP_CONCAT(el.content, ' | ') AS relationship_context,
  MAX(el.as_of) AS most_recent_element
FROM element_entities ee1
JOIN element_entities ee2 ON ee1.element_id = ee2.element_id
  AND ee2.entity_id != ee1.entity_id
JOIN entities e ON e.id = ee2.entity_id
  AND e.merged_into IS NULL
JOIN elements el ON el.id = ee1.element_id
  AND el.type = 'fact'
WHERE ee1.entity_id = :entity_id
GROUP BY e.id
ORDER BY shared_element_count DESC, most_recent_element DESC;
```

**Use cases:**
- "Who does Sarah work with?"
- "What entities are related to Project Alpha?"
- Building a relationship map for an entity's mental model

### 2. Relationship Context — How Are Two Entities Related?

Returns all fact elements that link two specific entities, providing the full relationship narrative.

```sql
SELECT
  el.id,
  el.content,
  el.as_of,
  el.metadata
FROM elements el
JOIN element_entities ee1 ON el.id = ee1.element_id AND ee1.entity_id = :entity_a
JOIN element_entities ee2 ON el.id = ee2.element_id AND ee2.entity_id = :entity_b
WHERE el.type = 'fact'
ORDER BY el.as_of DESC;
```

**Use cases:**
- "What's the relationship between Tyler and Anthropic?"
- "What do I know about Sarah and Project Alpha?"
- Generating relationship context for follow-up drafts

### 3. Transitive Relationships — 2-Hop Graph Traversal

Finds entities connected through an intermediary ("friend-of-friend", org chart traversal).

```sql
WITH direct_connections AS (
  SELECT DISTINCT ee2.entity_id
  FROM element_entities ee1
  JOIN element_entities ee2 ON ee1.element_id = ee2.element_id
    AND ee2.entity_id != ee1.entity_id
  WHERE ee1.entity_id = :entity_id
)
SELECT DISTINCT
  e.id,
  e.name,
  e.type,
  intermediary.name AS connected_via,
  COUNT(DISTINCT ee2.element_id) AS indirect_element_count
FROM element_entities ee1
JOIN element_entities ee2 ON ee1.element_id = ee2.element_id
  AND ee2.entity_id != ee1.entity_id
JOIN entities e ON e.id = ee2.entity_id
  AND e.merged_into IS NULL
JOIN entities intermediary ON intermediary.id = ee1.entity_id
WHERE ee1.entity_id IN (SELECT entity_id FROM direct_connections)
  AND ee2.entity_id != :entity_id
  AND ee2.entity_id NOT IN (SELECT entity_id FROM direct_connections)
GROUP BY e.id, intermediary.id
ORDER BY indirect_element_count DESC;
```

**Use cases:**
- "Who might be able to introduce me to someone at Company X?"
- "What projects are connected to my network?"
- Surfacing indirect connections for relationship expansion

### 4. Temporal Relationship Narrative — How Has This Relationship Changed?

Returns the chronological story of everything known about an entity.

```sql
SELECT
  el.id,
  el.content,
  el.as_of,
  el.source_event_id,
  el.metadata
FROM element_entities ee
JOIN elements el ON el.id = ee.element_id
WHERE ee.entity_id = :entity_id
  AND el.type = 'fact'
ORDER BY el.as_of DESC;
```

With time windowing:

```sql
-- Fact elements about entity in the last 30 days
SELECT el.content, el.as_of
FROM element_entities ee
JOIN elements el ON el.id = ee.element_id
WHERE ee.entity_id = :entity_id
  AND el.type = 'fact'
  AND el.as_of >= :thirty_days_ago
ORDER BY el.as_of DESC;
```

**Use cases:**
- Building relationship health mental models
- Understanding relationship trajectory
- Preparing for a meeting ("what's happened with Sarah recently?")

### 5. Relationship Strength Scoring

Composite score from multiple signals, all derivable from existing data.

All signals are derived from `element_entities` — no denormalized co-occurrence table needed.

```sql
-- Co-occurrence count between two entities (shared fact elements)
SELECT COUNT(DISTINCT ee1.element_id) AS cooccurrence_count
FROM element_entities ee1
JOIN element_entities ee2 ON ee1.element_id = ee2.element_id
JOIN elements el ON el.id = ee1.element_id AND el.type = 'fact'
WHERE ee1.entity_id = :entity_a AND ee2.entity_id = :entity_b;

-- Recency (most recent fact element involving both)
SELECT MAX(el.as_of)
FROM elements el
JOIN element_entities ee1 ON el.id = ee1.element_id AND ee1.entity_id = :entity_a
JOIN element_entities ee2 ON el.id = ee2.element_id AND ee2.entity_id = :entity_b
WHERE el.type = 'fact';

-- Total relationship volume (all shared elements for an entity across all peers)
SELECT COUNT(DISTINCT ee1.element_id) AS total_shared_elements
FROM element_entities ee1
JOIN element_entities ee2 ON ee1.element_id = ee2.element_id
  AND ee2.entity_id != ee1.entity_id
WHERE ee1.entity_id = :entity_id;

-- Platform breadth
SELECT COUNT(DISTINCT c.platform)
FROM contacts c
WHERE c.entity_id = :entity_id;
```

**Composite scoring function (application layer):**

```typescript
function relationshipStrength(signals: {
  shared_element_count: number;
  most_recent_element_ms: number;
  total_shared_elements: number;
  platform_count: number;
}): number {
  const recency_score = Math.exp(
    -(Date.now() - signals.most_recent_element_ms) / (30 * 86400000)
  ); // exponential decay, 30-day half-life

  const frequency_score = Math.min(1, signals.shared_element_count / 20);
  const volume_score = Math.min(1, signals.total_shared_elements / 100);
  const breadth_score = Math.min(1, signals.platform_count / 3);

  return (
    0.3 * recency_score +
    0.25 * frequency_score +
    0.25 * volume_score +
    0.2 * breadth_score
  );
}
```

### 6. Entity Cluster Discovery — Related Entity Groups

Finds clusters of entities that frequently co-occur (e.g., a team, a friend group).

```sql
-- Top entity pairs by co-occurrence (derived from element_entities)
SELECT
  e.name AS related_entity,
  e.type AS entity_type,
  COUNT(DISTINCT ee1.element_id) AS shared_element_count,
  MAX(el.as_of) AS most_recent
FROM element_entities ee1
JOIN element_entities ee2 ON ee1.element_id = ee2.element_id
  AND ee2.entity_id != ee1.entity_id
JOIN entities e ON e.id = ee2.entity_id AND e.merged_into IS NULL
JOIN elements el ON el.id = ee1.element_id AND el.type = 'fact'
WHERE ee1.entity_id = :entity_id
GROUP BY ee2.entity_id
ORDER BY shared_element_count DESC
LIMIT 20;
```

**Use cases:**
- "Who does Sarah usually appear with in conversations?"
- Discovering implicit groups/teams
- Identifying relationship clusters for the relationship monitor

### 7. Entity Relationship Type Extraction via Semantic Search

For "what kind of relationship does X have with Y?", combine element retrieval with embedding search:

1. Query: `recall({ query: "relationship between Sarah and Anthropic", entity: "sarah", scope: ['facts'] })`
2. Results: fact elements mentioning both entities, ranked by semantic relevance
3. The agent reads the top elements and extracts the relationship type from natural language

This is more flexible than a typed `relationship_type` column because:
- Relationships are nuanced ("Sarah used to work at Anthropic, left in 2025, still consults occasionally")
- Multiple relationship types can coexist
- The agent handles temporal evolution ("works at" vs "worked at")

---

## Skill / API Surface

These queries should be exposed as:

### recall() Extension

The existing recall API already supports `entity` parameter. Ensure the implementation uses the patterns above for entity-scoped retrieval:

```typescript
recall({
  query: "who works with Sarah?",
  entity: "sarah",
  scope: ['facts', 'observations'],
  max_results: 20,
  budget: 'mid'
})
```

### Dedicated Relationship Query Tool

For structured relationship queries (not natural language search), expose a tool:

```typescript
interface RelationshipQueryInput {
  entity_id: string;
  related_to?: string;          // specific entity to check relationship with
  type_filter?: string;         // entity type filter: 'person', 'org', etc.
  time_after?: number;
  time_before?: number;
  min_strength?: number;        // minimum relationship strength score
  max_results?: number;
  include_indirect?: boolean;   // 2-hop traversal
}

interface RelationshipResult {
  entity_id: string;
  entity_name: string;
  entity_type: string;
  shared_element_count: number;
  cooccurrence_count: number;
  most_recent_element_at: number;
  strength_score: number;
  relationship_elements: Array<{ content: string; as_of: number }>;
  connection_type: 'direct' | 'indirect';
  connected_via?: string;       // for indirect connections
}
```

### Graph Visualization Data

For UI rendering of relationship maps:

```typescript
interface EntityGraphInput {
  center_entity_id: string;
  depth?: number;               // 1 = direct only, 2 = include indirect
  min_strength?: number;
  max_nodes?: number;
}

interface EntityGraph {
  nodes: Array<{
    id: string;
    name: string;
    type: string;
    strength: number;           // relative to center entity
  }>;
  edges: Array<{
    from: string;
    to: string;
    weight: number;             // shared_element_count or cooccurrence_count
    label?: string;             // summarized relationship
  }>;
}
```

---

## Why This Is Sufficient (No Typed Relationship Table)

| Typed Relationship Table | Element Graph Traversal |
|---|---|
| Fast typed queries (`WHERE type = 'works_at'`) | Semantic search handles type filtering via natural language |
| Requires sync between elements and relationship rows | Single source of truth — elements ARE the relationships |
| Fixed relationship vocabulary | Open-ended — any relationship expressible in language |
| Loses nuance ("works at" vs "used to work at") | Full temporal narrative preserved |
| O(n) maintenance on entity merges | No maintenance — follows merged_into chain |
| Schema changes for new relationship types | No schema changes ever |

The tradeoff is query speed for typed lookups. But with proper indexes on `element_entities`, the performance is adequate for interactive use. For batch analytics, the relationship strength scoring can be materialized periodically.

---

## See Also

- `UNIFIED_ENTITY_STORE.md` — Entity schema and merge mechanics
- `MEMORY_SYSTEM.md` — Element extraction and recall API
- `../iam/IDENTITY_RESOLUTION.md` — Contact-to-entity resolution
- `../work-system/CRM_ANALYSIS_AND_WORK_SYSTEM.md` — CRM analysis, work.db schema, four-model pattern
- `../work-system/ENTITY_ACTIVITY_DASHBOARD.md` — Per-entity CRM metrics and aggregate dashboards
