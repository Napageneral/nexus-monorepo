# Memory Storage Model — Elements, Sets, Jobs

**Status:** CANONICAL SPEC
**Last Updated:** 2026-03-01
**Related:** MEMORY_SYSTEM.md, MEMORY_WRITER.md, MEMORY_CONSOLIDATION.md, RETAIN_PIPELINE.md, MEMORY_RECALL.md, UNIFIED_ENTITY_STORE.md

---

## Overview

The memory storage model unifies all derived knowledge into three primitives: **elements**, **sets**, and **jobs**. This replaces the previous design where facts, observations, and mental models were stored in separate tables with separate schemas.

Events in `events.db` are the axiomatic bedrock — immutable raw messages from all platforms. Everything above events is a **derived element** produced by **jobs** operating on **sets** of inputs. The system is recursively composable: elements form sets, jobs process sets into new elements, and those elements can form the inputs to future jobs.

---

## The Three Primitives

### Elements

An **element** is an atomic unit of derived knowledge. All knowledge types share one table with a `type` discriminator.

| Element Type | Layer | Description | Examples |
|---|---|---|---|
| `fact` | 1 | Atomic extracted knowledge, immutable once written | "Tyler works at Anthropic building Nexus" |
| `observation` | 2 | Synthesized durable knowledge, version-chained | "Tyler's primary focus has shifted from ML research to systems architecture" |
| `mental_model` | 3 | High-level reports, refreshable, pinned or auto | "Tyler's Career" — work history, current role, career interests |

The type system is **open** — new element types can be added as the system evolves. Examples of future types: `humor_score`, `pii_extraction`, `sentiment`, `topic_tag`, `relationship_summary`. Any structured or unstructured output from a processing job becomes an element.

### Sets

A **set** is a collection of events, elements, or other sets. Sets have **definitions** that describe the grouping strategy — how and why the collection was constructed.

| Set Use Case | Members | Definition Strategy | Example |
|---|---|---|---|
| Retain episode | Events | `thread_time_gap` | "iMessage thread with Casey, 90-min silence window, 10k token budget" |
| Consolidation cluster | Facts + Observations | `knowledge_cluster` | "All facts about Tyler's career that haven't been consolidated yet" |
| Mental model evidence | Facts + Observations | `evidence_set` | "All supporting evidence for the 'Tyler's Career' mental model" |
| Arbitrary research set | Any mix | `manual` | "Facts and observations the reflect skill collected during deep research" |

Sets are themselves elements in a conceptual sense — they can be referenced, linked, and composed. But structurally, sets have their own table because they serve as **job inputs** and have **member lists** — a different shape than atomic content elements.

### Jobs

A **job** is a processing operation that takes a set as input and produces new elements as output. Jobs are typed (via `job_types`), tracked for status and retry, and linked to their outputs for full provenance.

| Job Type | Input Set | Output Elements | Agent |
|---|---|---|---|
| `retain_v1` | Episode (events) | Facts | Memory Writer meeseeks |
| `consolidate_v1` | Knowledge cluster (facts) | Observations, causal links between elements | Memory Consolidator meeseeks |
| `reflect_v1` | Evidence set (facts + observations) | Mental models | Agent using Reflect skill |
| `inject_v1` | (no input set — query-driven) | (no persistent output — context injection) | Memory Injection meeseeks |

Like element types, job types are **open**. Future job types might include: `pii_extract_v1`, `humor_score_v1`, `topic_extract_v1`, `relationship_map_v1`.

---

## Recursive Composition

The power of this model is that it composes recursively:

```
Layer 0:  EVENTS (axiom — raw immutable messages in events.db)
              │
              ├── Set: episode (events grouped by thread + time gap)
              │       │
              │       └── Job: retain_v1 (writer extracts knowledge)
              │               │
              │               └── Output: FACTS (elements, type='fact')
              │
Layer 1:  FACTS
              │
              ├── Set: knowledge cluster (facts grouped for consolidation)
              │       │
              │       └── Job: consolidate_v1 (consolidator synthesizes)
              │               │
              │               ├── Output: OBSERVATIONS (elements, type='observation')
              │               └── Output: Element links (causal/supports/contradicts)
              │
Layer 2:  OBSERVATIONS
              │
              ├── Set: evidence set (facts + observations for deep research)
              │       │
              │       └── Job: reflect_v1 (reflect skill creates reports)
              │               │
              │               └── Output: MENTAL MODELS (elements, type='mental_model')
              │
Layer 3:  MENTAL MODELS
              │
              └── (future: sets of mental models → meta-analysis jobs → higher-order elements)
```

Each layer follows the same pattern: **group inputs into a set → run a job on the set → produce new elements**. Adding a new layer (e.g., Layer 4 meta-models built from Layer 3 mental models) requires only a new job type and set definition — no schema changes.

---

## How Existing Concepts Map

### Facts → `elements WHERE type = 'fact'`

| Old Schema | New Schema | Notes |
|---|---|---|
| `facts.id` | `elements.id` | Same |
| `facts.text` | `elements.content` | Renamed for generality |
| `facts.as_of` | `elements.as_of` | Optional on elements (required for facts by convention) |
| `facts.ingested_at` | `elements.created_at` | The element's creation time IS when it was ingested |
| `facts.source_episode_id` | Derived: `jobs.input_set_id` → `sets.id` | The job that created this fact knows which set (episode) it came from |
| `facts.source_event_id` | `elements.source_event_id` | Optional — when a fact maps to a single source event |
| `facts.context` | Removed | Dead field — never written to |
| `facts.is_consolidated` | `processing_log` entry | See Processing Log section |
| `facts.metadata` | `elements.metadata` | Same |
| `fact_entities` | `element_entities` | Generalized for all element types |

### Observations → `elements WHERE type = 'observation'`

| Old Schema | New Schema | Notes |
|---|---|---|
| `analysis_runs.id` | `elements.id` | Observation IS the element |
| `analysis_runs.output_text` | `elements.content` | The synthesized knowledge text |
| `analysis_runs.episode_id` | Derived: `jobs.input_set_id` | Which set the job processed |
| `analysis_runs.analysis_type_id` | Derived: `jobs.type_id` → `job_types.id` | Job type, not analysis type |
| `analysis_runs.parent_id` | `elements.parent_id` | Version chain preserved |
| `analysis_runs.status` | `jobs.status` | Job execution state, not element state |
| `analysis_runs.raw_output` | `jobs.raw_output` | Raw LLM output stays on the job |
| `analysis_runs.error_message` | `jobs.error_message` | Job failure info stays on the job |
| `observation_facts` | `set_members` | Facts that went into consolidation = members of the input set |

### Mental Models → `elements WHERE type = 'mental_model'`

| Old Schema | New Schema | Notes |
|---|---|---|
| `mental_models.id` | `elements.id` | Same |
| `mental_models.name` | Stored in `elements.metadata` as JSON `{"name": "..."}` | Or as a convention: first line of content is the title |
| `mental_models.description` | `elements.content` | The full report markdown |
| `mental_models.entity_id` | `elements.entity_id` | Primary entity this element is about |
| `mental_models.parent_id` | `elements.parent_id` | Version chain preserved |
| `mental_models.pinned` | `elements.pinned` | User-curated flag preserved |
| `mental_models.last_refreshed` | Derived: most recent job that produced this element | Via `job_outputs` → `jobs.completed_at` |

### Episodes → `sets` with definition strategy `thread_time_gap`

| Old Schema | New Schema | Notes |
|---|---|---|
| `episodes.id` | `sets.id` | Same |
| `episodes.definition_id` | `sets.definition_id` | Same |
| `episodes.platform` | `sets.metadata` JSON `{"platform": "..."}` | Platform is set metadata |
| `episodes.thread_id` | `sets.metadata` JSON `{"thread_id": "..."}` | Thread is set metadata |
| `episodes.start_time` / `end_time` | Derived from member events | Or cached in `sets.metadata` for performance |
| `episodes.event_count` | `COUNT(set_members WHERE set_id = ?)` | Derived |
| `episode_events` | `set_members WHERE member_type = 'event'` | Events as set members |
| `episode_definitions` | `set_definitions` | Generalized |

### Causal Links → `element_links WHERE link_type = 'causal'`

| Old Schema | New Schema | Notes |
|---|---|---|
| `causal_links.from_fact_id` | `element_links.from_element_id` | Generalized — any element can link to any element |
| `causal_links.to_fact_id` | `element_links.to_element_id` | Same |
| `causal_links.strength` | `element_links.strength` | Same (0.0–1.0) |
| Link type was implicitly "causal" | `element_links.link_type` | Explicit discriminator |

### Analysis Types → `job_types`

| Old Schema | New Schema | Notes |
|---|---|---|
| `analysis_types.id` | `job_types.id` | Same |
| `analysis_types.name` | `job_types.name` | Same |
| `analysis_types.version` | `job_types.version` | Same |
| `analysis_types.prompt_template` | `job_types.prompt_template` | Same |
| `analysis_types.output_type` | Removed | Always 'structured' — dead field |
| `analysis_types.facets_config_json` | `job_types.config_json` | Generalized config |
| `analysis_types.model` | Removed from job_types, moved to `jobs.model` | Model is per-execution, not per-type |

---

## Schema

All tables live in `memory.db` unless otherwise noted.

### Elements

```sql
CREATE TABLE elements (
    id              TEXT PRIMARY KEY,
    type            TEXT NOT NULL,          -- 'fact', 'observation', 'mental_model', extensible
    content         TEXT NOT NULL,          -- the knowledge text (fact sentence, observation synthesis, model report)
    entity_id       TEXT,                   -- primary entity this element is about (optional)
    parent_id       TEXT REFERENCES elements(id),  -- version chain: points to previous version
    source_job_id   TEXT REFERENCES jobs(id),      -- which job created this element
    as_of           INTEGER,               -- when the thing described happened (required for facts, optional otherwise)
    source_event_id TEXT,                   -- which specific event triggered this (optional)
    pinned          INTEGER DEFAULT 0,     -- user-curated, not auto-overwritten
    created_at      INTEGER NOT NULL,
    metadata        TEXT                    -- JSON: type-specific fields (name for mental models, etc.)
);

CREATE INDEX idx_elements_type ON elements(type);
CREATE INDEX idx_elements_entity ON elements(entity_id);
CREATE INDEX idx_elements_parent ON elements(parent_id);
CREATE INDEX idx_elements_source_job ON elements(source_job_id);
CREATE INDEX idx_elements_as_of ON elements(as_of DESC);
CREATE INDEX idx_elements_created ON elements(created_at DESC);
CREATE INDEX idx_elements_pinned ON elements(pinned) WHERE pinned = 1;
```

### Full-Text Search

```sql
CREATE VIRTUAL TABLE elements_fts USING fts5(
    content,
    content='elements',
    content_rowid='rowid'
);

CREATE TRIGGER elements_fts_insert AFTER INSERT ON elements BEGIN
    INSERT INTO elements_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER elements_fts_update AFTER UPDATE OF content ON elements BEGIN
    UPDATE elements_fts SET content = new.content WHERE rowid = new.rowid;
END;

CREATE TRIGGER elements_fts_delete AFTER DELETE ON elements BEGIN
    DELETE FROM elements_fts WHERE rowid = old.rowid;
END;
```

**Design note:** FTS5 now covers ALL element types in one index. Previously only facts had FTS. Observations were searched with `LIKE` on `analysis_runs.output_text`, and mental models with `LIKE` on `mental_models.description`. The unified FTS index means keyword search finds facts, observations, and mental models equally — no more second-class search for higher layers.

### Element-Entity Links

```sql
CREATE TABLE element_entities (
    element_id  TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
    entity_id   TEXT NOT NULL,
    PRIMARY KEY (element_id, entity_id)
);

CREATE INDEX idx_element_entities_entity ON element_entities(entity_id);
CREATE INDEX idx_element_entities_element ON element_entities(element_id);
```

Generalizes the old `fact_entities` table. Observations and mental models can now be linked to entities with the same mechanism as facts. Previously only facts had entity links — observations linked to entities only via their constituent facts, and mental models had a single `entity_id` field. Now any element can have rich many-to-many entity associations.

### Element Links

```sql
CREATE TABLE element_links (
    id              TEXT PRIMARY KEY,
    from_element_id TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
    to_element_id   TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
    link_type       TEXT NOT NULL,          -- 'causal', 'supports', 'contradicts', 'supersedes', 'derived_from'
    strength        REAL,                   -- 0.0–1.0, optional
    created_at      INTEGER NOT NULL
);

CREATE INDEX idx_element_links_from ON element_links(from_element_id);
CREATE INDEX idx_element_links_to ON element_links(to_element_id);
CREATE INDEX idx_element_links_type ON element_links(link_type);
```

Generalizes the old `causal_links` table. The `link_type` discriminator enables multiple relationship types:

| Link Type | Meaning | Example |
|---|---|---|
| `causal` | A caused or led to B | "Tyler joined Anthropic" → "Tyler started building Nexus" |
| `supports` | A provides evidence for B | Fact supports an observation's conclusion |
| `contradicts` | A conflicts with B | New fact contradicts an older fact |
| `supersedes` | A replaces B (with explanation) | Updated observation replaces outdated one |
| `derived_from` | A was derived from B | Observation was derived from a set of facts |

The `strength` field is optional and carries over from causal links (0.0–1.0 scale, validated at write time, used in graph traversal with `COALESCE(strength, 0.5)` as default weight).

Link types are **open** — new types can be added without schema changes.

### Sets

```sql
CREATE TABLE sets (
    id              TEXT PRIMARY KEY,
    definition_id   TEXT NOT NULL REFERENCES set_definitions(id),
    created_at      INTEGER NOT NULL,
    metadata        TEXT                    -- JSON: platform, thread_id, time bounds, etc.
);

CREATE INDEX idx_sets_definition ON sets(definition_id);
CREATE INDEX idx_sets_created ON sets(created_at DESC);
```

### Set Members

```sql
CREATE TABLE set_members (
    set_id      TEXT NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
    member_type TEXT NOT NULL,              -- 'event', 'element', 'set'
    member_id   TEXT NOT NULL,
    position    INTEGER,                    -- ordering within the set (optional)
    added_at    INTEGER NOT NULL,
    PRIMARY KEY (set_id, member_type, member_id)
);

CREATE INDEX idx_set_members_member ON set_members(member_type, member_id);
```

**`member_type` values:**
- `'event'` — references an event in `events.db` (cross-DB by ID)
- `'element'` — references a row in `elements`
- `'set'` — references another set (nested composition)

This is **polymorphic membership**. A single set can contain events, elements, and sub-sets. The `position` field preserves ordering when it matters (e.g., event order within an episode).

### Set Definitions

```sql
CREATE TABLE set_definitions (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    version     TEXT,
    strategy    TEXT NOT NULL,              -- 'thread_time_gap', 'knowledge_cluster', 'evidence_set', 'manual'
    config_json TEXT,                       -- strategy-specific config (gap thresholds, token budgets, etc.)
    description TEXT,
    created_at  INTEGER NOT NULL
);
```

Set definitions describe **how** a type of set is constructed. They are templates, not instances.

| Definition | Strategy | Config | Description |
|---|---|---|---|
| `retain` | `thread_time_gap` | `{"silence_window_ms": 5400000, "token_budget": 10000}` | Retain episodes from adapter events |
| `consolidation` | `knowledge_cluster` | `{}` | Knowledge-cluster sets for consolidation |
| `evidence` | `evidence_set` | `{}` | Evidence sets for reflect/mental model creation |

### Job Types

```sql
CREATE TABLE job_types (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    version         TEXT,
    description     TEXT,
    prompt_template TEXT,                   -- role prompt or template for the agent
    config_json     TEXT,                   -- type-specific config
    created_at      INTEGER NOT NULL
);
```

### Jobs

```sql
CREATE TABLE jobs (
    id              TEXT PRIMARY KEY,
    type_id         TEXT NOT NULL REFERENCES job_types(id),
    input_set_id    TEXT REFERENCES sets(id),  -- NULL for query-driven jobs (injection)
    status          TEXT NOT NULL,              -- 'pending', 'running', 'completed', 'failed', 'blocked'
    model           TEXT,                       -- which model was used for this execution
    raw_output      TEXT,                       -- raw LLM output for debugging
    error_message   TEXT,
    blocked_reason  TEXT,
    retry_count     INTEGER DEFAULT 0,
    created_at      INTEGER NOT NULL,
    started_at      INTEGER,
    completed_at    INTEGER,
    UNIQUE(type_id, input_set_id)              -- idempotency: one job per (type, input set)
);

CREATE INDEX idx_jobs_type ON jobs(type_id);
CREATE INDEX idx_jobs_input_set ON jobs(input_set_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_created ON jobs(created_at DESC);
```

The `UNIQUE(type_id, input_set_id)` constraint prevents duplicate processing — you can't run the same job type on the same input set twice. This is the idempotency guarantee that the old `UNIQUE(analysis_type_id, episode_id)` provided.

### Job Outputs

```sql
CREATE TABLE job_outputs (
    job_id      TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    element_id  TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
    PRIMARY KEY (job_id, element_id)
);

CREATE INDEX idx_job_outputs_element ON job_outputs(element_id);
```

Tracks which elements a job produced. This is full provenance: for any element, you can trace back to the job that created it (via `elements.source_job_id`), and from any job, you can see all elements it produced (via `job_outputs`). The bidirectional link supports both "where did this fact come from?" and "what did this consolidation run produce?" queries.

### Processing Log

```sql
CREATE TABLE processing_log (
    target_type TEXT NOT NULL,             -- 'event', 'element'
    target_id   TEXT NOT NULL,
    job_type_id TEXT NOT NULL REFERENCES job_types(id),
    job_id      TEXT REFERENCES jobs(id),
    processed_at INTEGER NOT NULL,
    PRIMARY KEY (target_type, target_id, job_type_id)
);

CREATE INDEX idx_processing_log_job ON processing_log(job_id);
CREATE INDEX idx_processing_log_type ON processing_log(job_type_id);
```

**This replaces `is_consolidated`.** Instead of a boolean flag on each fact, the processing log tracks "has target X been processed by job type Y?"

**Why this is cleaner:**

1. **Applies to everything** — events processed by retain, facts processed by consolidation, observations processed by reflect. One mechanism for all processing state.

2. **Supports re-processing** — need to re-consolidate? Delete the processing_log rows for `job_type_id = 'consolidate_v1'` and the consolidator will pick them up again. No need to flip booleans back.

3. **Multi-job-type tracking** — a fact can be "consolidated" but not yet "humor-scored" and not yet "PII-checked". Each job type has its own processing_log entry. The boolean `is_consolidated` only tracked one dimension.

4. **Provenance** — the `job_id` reference tells you exactly which job run processed this target. The old boolean told you nothing about when or how it was consolidated.

**Query: "find unconsolidated facts"** (equivalent to the old `WHERE is_consolidated = FALSE`):

```sql
SELECT e.* FROM elements e
WHERE e.type = 'fact'
AND NOT EXISTS (
    SELECT 1 FROM processing_log pl
    WHERE pl.target_type = 'element'
    AND pl.target_id = e.id
    AND pl.job_type_id = 'consolidate_v1'
);
```

**Query: "find facts not yet humor-scored"** (impossible with old schema):

```sql
SELECT e.* FROM elements e
WHERE e.type = 'fact'
AND NOT EXISTS (
    SELECT 1 FROM processing_log pl
    WHERE pl.target_type = 'element'
    AND pl.target_id = e.id
    AND pl.job_type_id = 'humor_score_v1'
);
```

### Resolution Log

```sql
CREATE TABLE resolution_log (
    id              TEXT PRIMARY KEY,
    entity_id       TEXT NOT NULL,
    action          TEXT NOT NULL,          -- 'created', 'linked', 'merged', 'retyped'
    source_element_id TEXT,                 -- which element triggered this decision
    source_event_id TEXT,                   -- which event triggered this decision
    evidence        TEXT,                   -- reasoning (LLM-generated or rule-based)
    created_at      INTEGER NOT NULL
);

CREATE INDEX idx_resolution_log_entity ON resolution_log(entity_id);
CREATE INDEX idx_resolution_log_element ON resolution_log(source_element_id);
CREATE INDEX idx_resolution_log_event ON resolution_log(source_event_id);
```

The resolution log is an **entity resolution audit trail**. It tracks WHY entities exist and how they were linked, merged, or modified. It sits in memory.db but references entities in identity.db.

This is distinct from:
- `processing_log` — tracks "has X been processed by job type Y?"
- `jobs` — tracks job execution state
- `job_outputs` — tracks what elements a job produced

The resolution log tracks **identity decisions**: entity creation, entity-element linking, entity merges, entity re-typing. When investigating "why are there two Casey entities?" or "why did these get merged?", this is the audit trail.

| Action | Meaning | Example |
|---|---|---|
| `created` | New entity created based on evidence | "Created entity 'Casey Adams' — mentioned as Tyler's partner in fact elem-123" |
| `linked` | Element linked to entity | "Linked fact elem-456 to entity 'Casey Adams' — fact is about her" |
| `merged` | Entity merge proposed/executed | "Merged 'Casey A.' into 'Casey Adams' — same person based on co-occurrence + name similarity" |
| `retyped` | Entity type changed | "Changed 'Acme' from 'person' to 'organization' — new evidence indicates it's a company" |

### Schema Version

```sql
CREATE TABLE schema_version (
    version     INTEGER PRIMARY KEY,
    applied_at  INTEGER NOT NULL
);
```

---

## Seed Data

```sql
-- Set definitions (shipped with schema)
INSERT OR IGNORE INTO set_definitions (id, name, version, strategy, config_json, description, created_at)
VALUES
    ('retain', 'retain', '1.0.0', 'thread_time_gap',
     '{"silence_window_ms": 5400000, "token_budget": 10000}',
     'Retain episodes from adapter events',
     strftime('%s', 'now')),
    ('consolidation', 'consolidation', '1.0.0', 'knowledge_cluster',
     '{}',
     'Knowledge-cluster sets for consolidation',
     strftime('%s', 'now')),
    ('evidence', 'evidence', '1.0.0', 'evidence_set',
     '{}',
     'Evidence sets for reflect/mental model creation',
     strftime('%s', 'now'));

-- Job types (shipped with schema)
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
     strftime('%s', 'now')),
    ('reflect_v1', 'reflect_v1', '1.0.0',
     'Deep research and mental model creation from evidence sets',
     'See skills/MEMORY_REFLECT_SKILL.md for full role prompt',
     NULL,
     strftime('%s', 'now')),
    ('inject_v1', 'inject_v1', '1.0.0',
     'Pre-execution memory context injection (query-driven, no persistent output)',
     'See skills/MEMORY_INJECTION.md for full role prompt',
     NULL,
     strftime('%s', 'now'));

INSERT OR IGNORE INTO schema_version (version, applied_at)
VALUES (2, strftime('%s', 'now'));
```

---

## Design Decisions

### Why unify facts, observations, and mental models into one table?

The old schema had 3 separate tables (`facts`, `analysis_runs`/observations, `mental_models`) each with similar fields (text content, entity links, version chains, metadata). This meant:

1. **FTS was fact-only** — observations and mental models were searched with `LIKE`, a second-class experience.
2. **Entity links were fact-only** — the `fact_entities` table didn't cover observations or mental models.
3. **Causal links were fact-only** — you couldn't link an observation to a fact causally, even though "A supports B" is a valid relationship across layers.
4. **Adding a new element type** (humor scores, PII extractions) meant creating a new table, new FTS index, new entity link table, new link table. Every extension required schema changes.

The unified `elements` table with `type` discriminator gives every element type the same capabilities: FTS, entity links, inter-element links, version chains, provenance tracking. Adding a new element type is just a new `type` value — zero schema changes.

### Why separate sets from elements?

Sets have a fundamentally different shape: they have **members** (an ordered collection of references to other objects). Elements have **content** (text). Merging these would create a table where half the columns are NULL for every row.

Sets also serve as **job inputs** — the `jobs.input_set_id` foreign key enforces the "jobs process sets" contract. If sets were elements, this relationship would be ambiguous.

Conceptually, sets ARE elements in the recursive composition model. Structurally, they have their own table for clarity and query efficiency.

### Why polymorphic set membership?

Set members can be events (from events.db), elements (from elements table), or other sets. The `member_type` discriminator enables this without separate junction tables for each combination.

The alternative — separate `set_events`, `set_elements`, `set_sets` tables — would triple the junction tables and make "what's in this set?" a 3-way UNION query. Polymorphic membership with `member_type` is cleaner.

### Why processing_log instead of is_consolidated?

See the Processing Log section above for full rationale. In short: `is_consolidated` was a single boolean that only tracked one dimension (consolidation), couldn't be extended to new job types, told you nothing about when/how processing happened, and required flipping booleans back for re-processing.

### Why resolution_log is separate from processing_log?

Processing log tracks "what's been processed by what" — it's about workflow state. Resolution log tracks "what identity decisions were made and why" — it's about entity resolution auditing. Different audiences (workflow orchestration vs. identity debugging), different access patterns, different retention needs.

### Why keep raw_output on jobs instead of as an element?

The raw LLM output from a job is debugging metadata, not knowledge. It would pollute the FTS index and elements table with unstructured dump text that nobody searches for. Keeping it on the `jobs` row scopes it to operational debugging.

---

## Version Chains

Elements support version chains via `parent_id`. When an element is updated, a new element is created with `parent_id` pointing to the previous version. The latest version in a chain is the **head** — the element with no child pointing to it.

```
observation-v1 (parent_id = NULL)
    └── observation-v2 (parent_id = observation-v1)
            └── observation-v3 (parent_id = observation-v2)  ← HEAD
```

**Finding the head:**

```sql
SELECT e.* FROM elements e
LEFT JOIN elements successor ON successor.parent_id = e.id
WHERE e.type = 'observation'
AND successor.id IS NULL;
```

This applies to observations and mental models. Facts are immutable and do not have version chains.

---

## Embeddings (embeddings.db)

Embeddings are stored separately in `embeddings.db` using `sqlite-vec`:

```sql
CREATE TABLE embeddings (
    id          TEXT PRIMARY KEY,
    target_id   TEXT NOT NULL,              -- elements.id
    target_type TEXT NOT NULL,              -- 'fact', 'observation', 'mental_model' (matches elements.type)
    model       TEXT NOT NULL,
    vector      BLOB NOT NULL,
    created_at  INTEGER NOT NULL
);

CREATE VIRTUAL TABLE vec_embeddings USING vec0(
    target_id   TEXT,
    target_type TEXT,
    embedding   FLOAT[384]
);
```

The `target_type` matches `elements.type`, enabling type-scoped vector search. Embeddings are computed asynchronously and may not exist for all elements immediately.

---

## Access Tracking

Access tracking is handled by a lightweight log table:

```sql
CREATE TABLE access_log (
    target_type TEXT NOT NULL,              -- 'element', 'set', 'job'
    target_id   TEXT NOT NULL,
    accessed_at INTEGER NOT NULL
);

CREATE INDEX idx_access_log_target ON access_log(target_type, target_id);
CREATE INDEX idx_access_log_time ON access_log(accessed_at DESC);
```

Previously `access_count` was denormalized onto facts, observations, and mental models. In the unified model, access tracking is fully externalized to the access log. Access counts are derived via `COUNT(*)` queries against the log. This eliminates update contention on hot element rows during concurrent reads.

---

## Example Flows

### Retain Flow (Events → Facts)

1. Episode finalizes (silence window or token budget reached).
2. Retain pipeline creates a **set** with `definition_id = 'retain'`, adds episode events as **set members** (`member_type = 'event'`).
3. Pipeline creates a **job** with `type_id = 'retain_v1'`, `input_set_id` = the set.
4. Memory Writer meeseeks runs, extracts facts.
5. Each fact → **element** with `type = 'fact'`, `source_job_id` = the job.
6. Each fact → **element_entities** rows linking to resolved entities.
7. Each event → **processing_log** entry with `job_type_id = 'retain_v1'`.
8. Each fact → **job_outputs** row linking to the job.
9. Job marked `status = 'completed'`.

### Consolidation Flow (Facts → Observations)

1. Scheduler finds unconsolidated facts (no `processing_log` entry for `consolidate_v1`).
2. Groups facts into a **set** with `definition_id = 'consolidation'`, adds facts as **set members** (`member_type = 'element'`).
3. Creates a **job** with `type_id = 'consolidate_v1'`, `input_set_id` = the set.
4. Memory Consolidator meeseeks runs.
5. New observations → **elements** with `type = 'observation'`, `source_job_id` = the job.
6. Updated observations → new **elements** with `parent_id` pointing to previous version.
7. Causal links → **element_links** with `link_type = 'causal'`.
8. Entity merges → `propose_merge` tool (identity layer).
9. Each fact → **processing_log** entry with `job_type_id = 'consolidate_v1'`.
10. All outputs → **job_outputs** rows.
11. Job marked `status = 'completed'`.

### Reflect Flow (Facts + Observations → Mental Models)

1. Agent invokes Reflect skill on a topic.
2. Skill searches memory, collects relevant facts and observations.
3. Creates a **set** with `definition_id = 'evidence'`, adds collected elements as **set members**.
4. Creates a **job** with `type_id = 'reflect_v1'`, `input_set_id` = the set.
5. Agent synthesizes a mental model → **element** with `type = 'mental_model'`, `pinned = 0`.
6. If updating existing model → new element with `parent_id` pointing to previous version.
7. Job marked `status = 'completed'`.

---

## Migration Note

This is a **hard cutover** — no migration from the old schema is needed. The `ensureMemorySchema()` function in `nex/src/db/memory.ts` will be rewritten to create the new schema. Old data from development/testing is not preserved across schema revisions. This is the same policy used for all previous schema changes in the project.

---

## See Also

- `MEMORY_SYSTEM.md` — Master architecture: 4 layers, lifecycle, tool architecture
- `MEMORY_WRITER.md` — Writer meeseeks: workflow, extraction rules, entity resolution
- `MEMORY_CONSOLIDATION.md` — Consolidation meeseeks: observations, causal links, entity merges
- `RETAIN_PIPELINE.md` — Episode lifecycle, filtering, payload assembly, writer dispatch
- `MEMORY_RECALL.md` — Recall API: strategies, parameters, budget control, fusion
- `UNIFIED_ENTITY_STORE.md` — Identity layer: entities, contacts, merge chains
- `FACT_GRAPH_TRAVERSAL.md` — Graph traversal patterns for relationship queries
