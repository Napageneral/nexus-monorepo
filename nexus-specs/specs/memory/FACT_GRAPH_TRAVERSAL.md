# Fact Graph Traversal — Relationship Query Patterns

**Status:** DESIGN SPEC
**Last Updated:** 2026-02-26
**Related:** UNIFIED_ENTITY_STORE.md, MEMORY_SYSTEM.md, ../iam/IDENTITY_RESOLUTION.md

---

## Overview

The fact graph (`facts` + `fact_entities` in memory.db, `entities` in identity.db) implicitly encodes all entity relationships. Rather than maintaining a separate typed relationship table, Nexus derives relationship information at read time by traversing the fact graph.

This spec defines the canonical query patterns that provide relationship-graph-equivalent power using existing primitives.

**Core insight:** A fact like "Tyler works at Anthropic building Nexus" links three entities through `fact_entities`. The relationship types are encoded in the natural language of the fact text. The agent reads the facts and understands the relationships in context — no structured triples needed.

---

## Query Patterns

### 1. Direct Relationships — Who Is Connected to Entity X?

Returns all entities that co-occur with X in at least one fact, ranked by co-mention frequency, with the fact text explaining how they're connected.

```sql
SELECT
  e.id,
  e.name,
  e.type,
  COUNT(fe1.fact_id) AS shared_fact_count,
  GROUP_CONCAT(f.text, ' | ') AS relationship_context,
  MAX(f.as_of) AS most_recent_fact
FROM fact_entities fe1
JOIN fact_entities fe2 ON fe1.fact_id = fe2.fact_id
  AND fe2.entity_id != fe1.entity_id
JOIN entities e ON e.id = fe2.entity_id
  AND e.merged_into IS NULL
JOIN facts f ON f.id = fe1.fact_id
WHERE fe1.entity_id = :entity_id
GROUP BY e.id
ORDER BY shared_fact_count DESC, most_recent_fact DESC;
```

**Use cases:**
- "Who does Sarah work with?"
- "What entities are related to Project Alpha?"
- Building a relationship map for an entity's mental model

### 2. Relationship Context — How Are Two Entities Related?

Returns all facts that link two specific entities, providing the full relationship narrative.

```sql
SELECT
  f.id,
  f.text,
  f.context,
  f.as_of,
  f.metadata
FROM facts f
JOIN fact_entities fe1 ON f.id = fe1.fact_id AND fe1.entity_id = :entity_a
JOIN fact_entities fe2 ON f.id = fe2.fact_id AND fe2.entity_id = :entity_b
ORDER BY f.as_of DESC;
```

**Use cases:**
- "What's the relationship between Tyler and Anthropic?"
- "What do I know about Sarah and Project Alpha?"
- Generating relationship context for follow-up drafts

### 3. Transitive Relationships — 2-Hop Graph Traversal

Finds entities connected through an intermediary ("friend-of-friend", org chart traversal).

```sql
WITH direct_connections AS (
  SELECT DISTINCT fe2.entity_id
  FROM fact_entities fe1
  JOIN fact_entities fe2 ON fe1.fact_id = fe2.fact_id
    AND fe2.entity_id != fe1.entity_id
  WHERE fe1.entity_id = :entity_id
)
SELECT DISTINCT
  e.id,
  e.name,
  e.type,
  intermediary.name AS connected_via,
  COUNT(DISTINCT fe2.fact_id) AS indirect_fact_count
FROM fact_entities fe1
JOIN fact_entities fe2 ON fe1.fact_id = fe2.fact_id
  AND fe2.entity_id != fe1.entity_id
JOIN entities e ON e.id = fe2.entity_id
  AND e.merged_into IS NULL
JOIN entities intermediary ON intermediary.id = fe1.entity_id
WHERE fe1.entity_id IN (SELECT entity_id FROM direct_connections)
  AND fe2.entity_id != :entity_id
  AND fe2.entity_id NOT IN (SELECT entity_id FROM direct_connections)
GROUP BY e.id, intermediary.id
ORDER BY indirect_fact_count DESC;
```

**Use cases:**
- "Who might be able to introduce me to someone at Company X?"
- "What projects are connected to my network?"
- Surfacing indirect connections for relationship expansion

### 4. Temporal Relationship Narrative — How Has This Relationship Changed?

Returns the chronological story of everything known about an entity.

```sql
SELECT
  f.id,
  f.text,
  f.context,
  f.as_of,
  f.source_event_id,
  f.metadata
FROM fact_entities fe
JOIN facts f ON f.id = fe.fact_id
WHERE fe.entity_id = :entity_id
ORDER BY f.as_of DESC;
```

With time windowing:

```sql
-- Facts about entity in the last 30 days
SELECT f.text, f.as_of, f.context
FROM fact_entities fe
JOIN facts f ON f.id = fe.fact_id
WHERE fe.entity_id = :entity_id
  AND f.as_of >= :thirty_days_ago
ORDER BY f.as_of DESC;
```

**Use cases:**
- Building relationship health mental models
- Understanding relationship trajectory
- Preparing for a meeting ("what's happened with Sarah recently?")

### 5. Relationship Strength Scoring

Composite score from multiple signals, all derivable from existing data.

```sql
-- Co-occurrence count (from entity_cooccurrences, already maintained)
SELECT count FROM entity_cooccurrences
WHERE (entity_id_1 = :entity_a AND entity_id_2 = :entity_b)
   OR (entity_id_1 = :entity_b AND entity_id_2 = :entity_a);

-- Fact count (shared facts between two entities)
SELECT COUNT(DISTINCT fe1.fact_id)
FROM fact_entities fe1
JOIN fact_entities fe2 ON fe1.fact_id = fe2.fact_id
WHERE fe1.entity_id = :entity_a AND fe2.entity_id = :entity_b;

-- Recency (most recent fact involving both)
SELECT MAX(f.as_of)
FROM facts f
JOIN fact_entities fe1 ON f.id = fe1.fact_id AND fe1.entity_id = :entity_a
JOIN fact_entities fe2 ON f.id = fe2.fact_id AND fe2.entity_id = :entity_b;

-- Communication volume (from contacts + events)
SELECT SUM(c.message_count)
FROM contacts c
WHERE c.entity_id = :entity_id;

-- Platform breadth
SELECT COUNT(DISTINCT c.platform)
FROM contacts c
WHERE c.entity_id = :entity_id;
```

**Composite scoring function (application layer):**

```typescript
function relationshipStrength(signals: {
  cooccurrence_count: number;
  shared_fact_count: number;
  most_recent_fact_ms: number;
  message_count: number;
  platform_count: number;
}): number {
  const recency_score = Math.exp(
    -(Date.now() - signals.most_recent_fact_ms) / (30 * 86400000)
  ); // exponential decay, 30-day half-life

  const frequency_score = Math.min(1, signals.shared_fact_count / 20);
  const volume_score = Math.min(1, signals.message_count / 100);
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
-- Top entity pairs by co-occurrence
SELECT
  e1.name AS entity_1,
  e2.name AS entity_2,
  ec.count AS cooccurrence_count,
  ec.last_cooccurred
FROM entity_cooccurrences ec
JOIN entities e1 ON e1.id = ec.entity_id_1 AND e1.merged_into IS NULL
JOIN entities e2 ON e2.id = ec.entity_id_2 AND e2.merged_into IS NULL
WHERE ec.entity_id_1 = :entity_id OR ec.entity_id_2 = :entity_id
ORDER BY ec.count DESC
LIMIT 20;
```

**Use cases:**
- "Who does Sarah usually appear with in conversations?"
- Discovering implicit groups/teams
- Identifying relationship clusters for the relationship monitor

### 7. Entity Relationship Type Extraction via Semantic Search

For "what kind of relationship does X have with Y?", combine fact retrieval with embedding search:

1. Query: `recall({ query: "relationship between Sarah and Anthropic", entity: "sarah", scope: ['facts'] })`
2. Results: facts mentioning both entities, ranked by semantic relevance
3. The agent reads the top facts and extracts the relationship type from natural language

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
  shared_fact_count: number;
  cooccurrence_count: number;
  most_recent_fact_at: number;
  strength_score: number;
  relationship_facts: Array<{ text: string; as_of: number }>;
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
    weight: number;             // shared_fact_count or cooccurrence_count
    label?: string;             // summarized relationship
  }>;
}
```

---

## Why This Is Sufficient (No Typed Relationship Table)

| Typed Relationship Table | Fact Graph Traversal |
|---|---|
| Fast typed queries (`WHERE type = 'works_at'`) | Semantic search handles type filtering via natural language |
| Requires sync between facts and relationship rows | Single source of truth — facts ARE the relationships |
| Fixed relationship vocabulary | Open-ended — any relationship expressible in language |
| Loses nuance ("works at" vs "used to work at") | Full temporal narrative preserved |
| O(n) maintenance on entity merges | No maintenance — follows merged_into chain |
| Schema changes for new relationship types | No schema changes ever |

The tradeoff is query speed for typed lookups. But with proper indexes on `fact_entities` and the `entity_cooccurrences` table (already maintained), the performance is adequate for interactive use. For batch analytics, the relationship strength scoring can be materialized periodically.

---

## See Also

- `UNIFIED_ENTITY_STORE.md` — Entity schema and merge mechanics
- `MEMORY_SYSTEM.md` — Fact extraction and recall API
- `../iam/IDENTITY_RESOLUTION.md` — Contact-to-entity resolution
- `../CRM_ANALYSIS_AND_WORK_SYSTEM.md` — CRM analysis, work.db schema, four-model pattern
- `../ENTITY_ACTIVITY_DASHBOARD.md` — Per-entity CRM metrics and aggregate dashboards
