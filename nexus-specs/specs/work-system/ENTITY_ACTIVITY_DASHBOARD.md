# Entity Activity Dashboard — Data Exploration Spec

**Status:** DESIGN SPEC
**Last Updated:** 2026-02-26
**Related:** memory/UNIFIED_ENTITY_STORE.md, ledgers/EVENTS_LEDGER.md, DATABASE_ARCHITECTURE.md

---

## Overview

The Entity Activity Dashboard provides deterministic aggregate metrics and visualizations built on top of the entity store (identity.db) and event ledger (events.db). This is a read-only data exploration layer — no new tables, just queries and computed views over existing data.

**Purpose:** Surface per-entity and cross-entity communication patterns, interaction timelines, and relationship health indicators for CRM-style exploration.

---

## Data Sources

All metrics are derived from existing tables:

| Source | Database | What It Provides |
|---|---|---|
| `events` | events.db | Raw communication history, timestamps, direction, content |
| `event_participants` | events.db | Who participated in each event |
| `threads` | events.db | Thread aggregates |
| `contacts` | identity.db | Platform identifiers, display names, entity links |
| `entities` | identity.db | Entity metadata (name, type, tags) |
| `entity_tags` | identity.db | Classification and lifecycle tags |
| `container_participants` | identity.db | Per-container participation stats |
| `containers` | identity.db | Conversation containers with kinds |
| `elements` + `element_entities` | memory.db | Knowledge graph, relationship context (elements with type='fact') |
| `elements` (type='mental_model') | memory.db | Synthesized relationship assessments |
| `element_entities` (co-occurrence joins) | memory.db | Co-mention frequency (derived, not denormalized) |

---

## Per-Entity Metrics

### Communication Volume

```sql
-- Total messages per platform for an entity, bucketed by day
SELECT
  c.platform,
  (e.created_at / 86400000) * 86400000 AS day_bucket,
  COUNT(*) AS message_count,
  SUM(CASE WHEN e.direction = 'inbound' THEN 1 ELSE 0 END) AS inbound_count,
  SUM(CASE WHEN e.direction = 'outbound' THEN 1 ELSE 0 END) AS outbound_count
FROM events e
JOIN event_participants ep ON ep.event_id = e.id
JOIN contacts c ON c.entity_id = ep.entity_id AND c.platform = e.source
WHERE ep.entity_id = :entity_id
GROUP BY c.platform, day_bucket
ORDER BY day_bucket DESC;
```

### Platform Distribution

```sql
-- Which platforms does this entity communicate on?
SELECT
  c.platform,
  c.message_count,
  c.first_seen,
  c.last_seen,
  c.contact_name
FROM contacts c
WHERE c.entity_id = :entity_id
  AND c.platform NOT IN ('phone', 'email')  -- skip universal contacts, show platform contacts
ORDER BY c.last_seen DESC;
```

### Interaction Frequency Trend

```sql
-- Weekly message counts over last 12 weeks
SELECT
  (e.created_at / 604800000) * 604800000 AS week_bucket,
  COUNT(*) AS message_count
FROM events e
JOIN event_participants ep ON ep.event_id = e.id
WHERE ep.entity_id = :entity_id
  AND e.created_at >= :twelve_weeks_ago
GROUP BY week_bucket
ORDER BY week_bucket ASC;
```

### Average Gap Between Interactions

```sql
-- Calculate average time between consecutive messages
WITH ordered_events AS (
  SELECT
    e.created_at,
    LAG(e.created_at) OVER (ORDER BY e.created_at) AS prev_created_at
  FROM events e
  JOIN event_participants ep ON ep.event_id = e.id
  WHERE ep.entity_id = :entity_id
)
SELECT
  AVG(created_at - prev_created_at) AS avg_gap_ms,
  MIN(created_at - prev_created_at) AS min_gap_ms,
  MAX(created_at - prev_created_at) AS max_gap_ms,
  COUNT(*) AS interaction_count
FROM ordered_events
WHERE prev_created_at IS NOT NULL;
```

### Inbound vs Outbound Ratio

```sql
SELECT
  SUM(CASE WHEN e.direction = 'inbound' THEN 1 ELSE 0 END) AS inbound,
  SUM(CASE WHEN e.direction = 'outbound' THEN 1 ELSE 0 END) AS outbound,
  ROUND(
    CAST(SUM(CASE WHEN e.direction = 'outbound' THEN 1 ELSE 0 END) AS REAL) /
    NULLIF(SUM(CASE WHEN e.direction = 'inbound' THEN 1 ELSE 0 END), 0),
    2
  ) AS outbound_inbound_ratio
FROM events e
JOIN event_participants ep ON ep.event_id = e.id
WHERE ep.entity_id = :entity_id;
```

### Active Hours Distribution

```sql
-- When does communication with this entity typically happen?
-- Hour-of-day distribution (in local time, adjust for timezone)
SELECT
  (e.created_at / 3600000) % 24 AS hour_of_day,
  COUNT(*) AS message_count
FROM events e
JOIN event_participants ep ON ep.event_id = e.id
WHERE ep.entity_id = :entity_id
GROUP BY hour_of_day
ORDER BY hour_of_day;
```

### Thread Engagement

```sql
-- Conversations with this entity: how many threads, average length
SELECT
  e.source AS platform,
  COUNT(DISTINCT t.id) AS thread_count,
  AVG(t.message_count) AS avg_thread_length,
  MAX(t.last_message_at) AS most_recent_thread
FROM threads t
JOIN events e ON e.thread_id = t.id
JOIN event_participants ep ON ep.event_id = e.id
WHERE ep.entity_id = :entity_id
GROUP BY e.source;
```

### Relationship Context (from Memory)

```sql
-- Recent facts about this entity
SELECT el.content, el.as_of, el.context
FROM element_entities ee
JOIN elements el ON el.id = ee.element_id
WHERE ee.entity_id = :entity_id
  AND el.type = 'fact'
ORDER BY el.as_of DESC
LIMIT 20;

-- Mental model (if exists)
SELECT
  json_extract(el.metadata, '$.name') AS name,
  el.content AS description,
  el.last_refreshed,
  el.is_stale
FROM element_entities ee
JOIN elements el ON el.id = ee.element_id
WHERE ee.entity_id = :entity_id
  AND el.type = 'mental_model'
ORDER BY el.updated_at DESC
LIMIT 1;
```

---

## Aggregate CRM Dashboard Metrics

### Entity Overview by Lifecycle

```sql
-- Count of entities by lifecycle tag
SELECT
  et.tag,
  COUNT(DISTINCT et.entity_id) AS entity_count
FROM entity_tags et
JOIN entities e ON e.id = et.entity_id AND e.merged_into IS NULL
WHERE et.tag LIKE 'lifecycle:%'
  AND et.deleted_at IS NULL
GROUP BY et.tag
ORDER BY entity_count DESC;
```

### Dormancy Alerts

```sql
-- Active-tagged entities with no recent contact (configurable threshold)
SELECT
  e.id,
  e.name,
  e.type,
  MAX(c.last_seen) AS last_contact,
  ((:now - MAX(c.last_seen)) / 86400000) AS days_since_contact
FROM entities e
JOIN entity_tags et ON et.entity_id = e.id AND et.tag = 'lifecycle:active' AND et.deleted_at IS NULL
JOIN contacts c ON c.entity_id = e.id
WHERE e.merged_into IS NULL
GROUP BY e.id
HAVING days_since_contact > :dormancy_threshold_days
ORDER BY days_since_contact DESC;
```

### Most Active Relationships (Time Period)

```sql
-- Top entities by interaction volume in a time window
SELECT
  e.id,
  e.name,
  e.type,
  COUNT(*) AS interaction_count,
  COUNT(DISTINCT ep.event_id) AS unique_events,
  MAX(ev.created_at) AS most_recent
FROM event_participants ep
JOIN events ev ON ev.id = ep.event_id
JOIN entities e ON e.id = ep.entity_id AND e.merged_into IS NULL
WHERE ev.created_at BETWEEN :period_start AND :period_end
  AND e.is_user = FALSE  -- exclude self
GROUP BY e.id
ORDER BY interaction_count DESC
LIMIT 20;
```

### New Entities This Period

```sql
SELECT
  e.id,
  e.name,
  e.type,
  e.created_at,
  GROUP_CONCAT(et.tag, ', ') AS tags
FROM entities e
LEFT JOIN entity_tags et ON et.entity_id = e.id AND et.deleted_at IS NULL
WHERE e.created_at BETWEEN :period_start AND :period_end
  AND e.merged_into IS NULL
  AND e.type = 'person'
GROUP BY e.id
ORDER BY e.created_at DESC;
```

### Interaction Heatmap (Cross-Entity)

```sql
-- Daily interaction counts across all entities
SELECT
  (ev.created_at / 86400000) * 86400000 AS day_bucket,
  COUNT(DISTINCT ep.entity_id) AS active_entities,
  COUNT(*) AS total_interactions
FROM events ev
JOIN event_participants ep ON ep.event_id = ev.id
JOIN entities e ON e.id = ep.entity_id AND e.is_user = FALSE AND e.merged_into IS NULL
WHERE ev.created_at >= :lookback_start
GROUP BY day_bucket
ORDER BY day_bucket ASC;
```

### Platform Distribution (Global)

```sql
-- Which platforms carry the most communication?
SELECT
  c.platform,
  COUNT(DISTINCT c.entity_id) AS entity_count,
  SUM(c.message_count) AS total_messages
FROM contacts c
JOIN entities e ON e.id = c.entity_id AND e.merged_into IS NULL
WHERE c.platform NOT IN ('phone', 'email', 'login', 'agent')
GROUP BY c.platform
ORDER BY total_messages DESC;
```

---

## Composite Entity Profile

A single API call that assembles the full CRM profile for an entity:

```typescript
interface EntityProfile {
  // Identity
  entity: {
    id: string;
    name: string;
    type: string;
    tags: string[];
    groups: Array<{ id: string; name: string; role: string }>;
  };

  // Contact points
  contacts: Array<{
    platform: string;
    contact_id: string;
    contact_name: string | null;
    message_count: number;
    first_seen: number;
    last_seen: number;
  }>;

  // Communication metrics
  metrics: {
    total_messages: number;
    inbound_count: number;
    outbound_count: number;
    outbound_inbound_ratio: number;
    first_interaction: number;
    last_interaction: number;
    days_since_last_contact: number;
    avg_gap_days: number;
    platform_count: number;
    thread_count: number;
    avg_thread_length: number;
  };

  // Trends
  trends: {
    weekly_volume: Array<{ week: number; count: number }>;
    platform_breakdown: Array<{ platform: string; count: number }>;
    active_hours: Array<{ hour: number; count: number }>;
    frequency_trend: 'increasing' | 'stable' | 'decreasing';
  };

  // Relationship context (from memory)
  context: {
    recent_facts: Array<{ content: string; as_of: number }>;
    mental_model: { name: string; description: string; last_refreshed: number; is_stale: boolean } | null;
    related_entities: Array<{
      id: string;
      name: string;
      type: string;
      shared_element_count: number;
      strength_score: number;
    }>;
  };

  // Work items (from work.db, when implemented)
  work: {
    active_items: number;
    pending_items: number;
    active_sequences: number;
    next_due: { title: string; due_at: number } | null;
  };
}
```

---

## Visualization Components

### Recommended Visualizations

1. **Communication Timeline** — horizontal timeline showing interactions as dots/bars, color-coded by platform, with density indicating frequency

2. **Platform Distribution Pie/Ring** — breakdown of communication volume by platform

3. **Frequency Trend Line** — weekly/monthly interaction counts over time with trend indicator

4. **Relationship Map** — node graph centered on entity, showing connected entities sized by relationship strength

5. **Inbound/Outbound Balance** — bar chart or gauge showing who initiates more

6. **Active Hours Heatmap** — 24-hour clock or heatmap showing typical communication times

7. **Dormancy Alert List** — sorted table of entities approaching or exceeding dormancy thresholds

8. **Entity Cards** — compact cards showing entity photo/avatar, name, last contact, lifecycle tag, platform icons, and key metric sparklines

---

## Implementation Notes

- All queries use existing tables and indexes. No schema changes required.
- Cross-database queries (events.db + identity.db) must be performed at the application layer (two separate queries, joined in code) since SQLite doesn't support cross-database JOINs without ATTACH.
- For performance on large event sets, consider materializing key aggregates (total messages, last contact per entity) as entity properties or cached snapshots.
- The `event_participants` table is trigger-populated from events — ensure it's populated for all event types used in these queries.
- Timezone handling: all timestamps are UTC unix ms. Apply timezone offset in the visualization layer.

---

## See Also

- `CRM_ANALYSIS_AND_WORK_SYSTEM.md` — CRM analysis, work.db schema, four-model pattern
- `memory/UNIFIED_ENTITY_STORE.md` — Entity schema
- `memory/FACT_GRAPH_TRAVERSAL.md` — Relationship query patterns
- `ledgers/EVENTS_LEDGER.md` — Event schema
- `DATABASE_ARCHITECTURE.md` — Database layout
