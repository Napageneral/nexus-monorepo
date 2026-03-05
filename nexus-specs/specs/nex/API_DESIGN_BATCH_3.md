# API Design: Batch 3 — Memory

**Status:** COMPLETE — all decisions locked
**Last Updated:** 2026-03-03

---

## Overview

The memory domain exposes the unified elements/sets/jobs storage model as API operations. All derived knowledge (facts, observations, mental models) lives in one `elements` table with a `type` discriminator. Sets group inputs. Jobs process sets into new elements. The model is recursively composable.

Full storage schema: [MEMORY_STORAGE_MODEL.md](../../memory/MEMORY_STORAGE_MODEL.md)
Full system architecture: [MEMORY_SYSTEM.md](../../memory/MEMORY_SYSTEM.md)
**NOTE (Batch 6):** `memory.jobs.*` operations are absorbed into the unified `jobs.*` domain. Memory pipeline uses unified job definitions internally. See [WORK_DOMAIN_UNIFICATION.md](./WORK_DOMAIN_UNIFICATION.md) and [API_DESIGN_BATCH_6.md](./API_DESIGN_BATCH_6.md).

### Design Principles

**Pipeline uses the same operations as external callers.** The memory writer meeseeks calls `memory.elements.create` to insert facts — the same operation available to any API caller. No parallel internal-only write paths.

**Embeddings are auto-generated.** Creating an element or ingesting an event automatically generates embeddings. No explicit embedding operations needed.

**Element types are open.** The `type` discriminator on elements is extensible: `fact`, `observation`, `mental_model`, `attachment_interpretation` today, with future types like `humor_score`, `pii_extraction`, `sentiment` requiring zero schema changes.

**Three special agent tools.** The memory meeseeks (writer, consolidator) need compound workflow operations that compose multiple base operations into ergonomic tool calls. These are exposed in the taxonomy but purpose-built for specific agents.

---

## Domain: Elements

**Database:** `memory.db` — `elements`, `elements_fts`, `element_entities`, `element_links`

### Decisions

**Unified `elements` table with type discriminator.** All knowledge types share one table. Every element gets FTS, entity links, inter-element links, version chains, and provenance tracking. Adding a new element type is just a new `type` value.

**`memory.elements.query` for SQL-style filtering.** Filter by type, entity_id, pinned, created_at range, has_successor (staleness), source_job_id, etc. This is the structured query path — you know what shape of data you want.

**`memory.recall` for search.** FTS, semantic embeddings, entity traversal, link traversal, short-term events, thread lookback — all fused via RRF. This is the "find relevant things" path. No separate `memory.elements.search` — recall covers all search use cases across all layers.

**`memory.elements.create` accepts `entity_ids[]` for auto-linking.** Instead of requiring separate `elements.create` + `elements.entities.link` calls, the create operation can accept entity IDs and auto-create the junction rows. Reduces round-trips for the writer.

**Version chains via `parent_id`.** Observations and mental models use version chains. Creating a new version = `memory.elements.create` with `parent_id` pointing to the previous element. The HEAD of a chain is the element with no successor. Facts are immutable and don't use version chains.

**Graph traversal is a first-class operation.** `memory.elements.links.traverse` enables multi-hop traversal across element links (causal, supports, contradicts, supersedes, derived_from). This powers deep research workflows and the reflect skill's evidence gathering.

### Operations

| Operation | Verb | Description |
|-----------|------|-------------|
| `memory.elements.query` | read | SQL-style filtering (type, entity_id, pinned, created_at range, has_successor, source_job_id, source_event_id) |
| `memory.elements.get` | read | Get element by ID with entity links and link summary |
| `memory.elements.create` | write | Create element (type-discriminated). Accepts `entity_ids[]` for auto-linking. Accepts `parent_id` for version chains. Embeddings auto-generated. |
| `memory.elements.head` | read | Resolve to HEAD of a version chain (follow successors to tip) |
| `memory.elements.history` | read | Get full version chain for an element (all ancestors and successors) |
| `memory.elements.entities.list` | read | List entity links for an element |
| `memory.elements.entities.link` | write | Link element to entity |
| `memory.elements.entities.unlink` | write | Remove element-entity link |
| `memory.elements.links.list` | read | List links for an element (filter by link_type, direction) |
| `memory.elements.links.create` | write | Create typed link between elements (causal, supports, contradicts, supersedes, derived_from) |
| `memory.elements.links.traverse` | read | Multi-hop graph traversal from seed element. Params: start_id, link_types[], direction (outbound/inbound/both), max_depth, max_results. Returns subgraph with paths. |

---

## Domain: Recall

### Decisions

**One unified search operation.** `memory.recall` searches across all four layers (events, facts, observations, mental models) using multiple retrieval strategies in parallel, fused via Reciprocal Rank Fusion. Budget control (`low`/`mid`/`high`) determines which strategies run.

**Returns grouped + ranked results.** Grouped arrays by type for type-specific access, plus a single ranked interleaved list for cross-type relevance. Discriminated union for TypeScript type narrowing.

Full recall spec: [MEMORY_RECALL.md](../../memory/MEMORY_RECALL.md)

### Operations

| Operation | Verb | Description |
|-----------|------|-------------|
| `memory.recall` | read | Unified search across all layers. Params: query, scope[], entity, time_after, time_before, platform, thread_id, thread_lookback_events, max_results, budget. Returns RecallResult with grouped arrays + ranked list. |

---

## Domain: Sets

**Database:** `memory.db` — `sets`, `set_members`, `set_definitions`

### Decisions

**Sets are grouping containers with polymorphic membership.** A set can contain events (from events.db), elements, or other sets. The `member_type` discriminator enables this without separate junction tables.

**Sets have definitions.** `set_definitions` describe the grouping strategy — `thread_time_gap` for retain episodes, `knowledge_cluster` for consolidation, `evidence_set` for reflect, `manual` for arbitrary grouping.

**Episodes are just retain sets.** An "episode" is a set with `definition_id = 'retain'`. No separate episode concept in the API — use `memory.sets.list` with `definition: 'retain'` to list episodes.

### Operations

| Operation | Verb | Description |
|-----------|------|-------------|
| `memory.sets.list` | read | List sets (filter by definition_id, time range, metadata fields) |
| `memory.sets.get` | read | Get set with member summary (counts by member_type, time range) |
| `memory.sets.create` | write | Create a set with definition reference and optional metadata |
| `memory.sets.members.list` | read | List members of a set (polymorphic: events, elements, sub-sets) |
| `memory.sets.members.add` | write | Add member to set (specify member_type and member_id) |

---

## Domain: Jobs

**Database:** `memory.db` — `jobs`, `job_types`, `job_outputs`, `processing_log`

### Decisions

**Jobs are processing operations with full provenance.** Each job takes a set as input and produces elements as output. `job_outputs` tracks which elements came from which job. `elements.source_job_id` provides the reverse link. Bidirectional provenance.

**Job types are open.** `retain_v1`, `consolidate_v1`, `reflect_v1`, `inject_v1` today — extensible to `humor_score_v1`, `pii_extract_v1`, etc. without schema changes.

**Idempotency via `UNIQUE(type_id, input_set_id)`.** You can't run the same job type on the same input set twice. Prevents duplicate processing.

**Processing log replaces `is_consolidated`.** Tracks "has target X been processed by job type Y?" — works for all job types, supports re-processing (delete log entries), and provides full provenance (which job_id processed this target).

### Operations

| Operation | Verb | Description |
|-----------|------|-------------|
| `memory.jobs.list` | read | List jobs (filter by type_id, status, input_set_id, time range) |
| `memory.jobs.get` | read | Get job with output elements and input set reference |
| `memory.jobs.create` | write | Create/trigger a job (specify type_id and input_set_id) |
| `memory.jobs.outputs.list` | read | List elements produced by a job |

---

## Special Agent Tools

These operations compose multiple base operations into ergonomic tool calls for the memory meeseeks. They are exposed in the taxonomy and available to any caller, but purpose-built for specific agent workflows.

### Decisions

**`memory.entities.create` wraps entity creation with proactive search.** The writer meeseeks needs a "create or find" flow: search for similar entities first, then decide whether to create new or use existing. This wraps `memory.recall` (entity-scoped) + `entities.create` (Batch 2) into one tool call that returns candidates for the agent to decide.

**`memory.entities.confirm` completes the create-or-find flow.** After `memory.entities.create` returns candidates, the agent calls `confirm` to declare its decision: use an existing entity, create the new one, or merge. Wraps `entities.get` / `entities.merge` as needed.

**`memory.consolidate` is the compound consolidation operation.** The consolidator agent needs to: examine a set of facts, decide what to do (create observation, update observation, or skip), then execute. This operation handles the full workflow: creates/updates observation elements (with version chains), creates element links, marks facts processed in the processing_log. Three action patterns:
- **Create:** new observation element + element_links to supporting facts
- **Update:** new observation element with `parent_id` pointing to previous version + updated element_links
- **Skip:** marks facts as processed without creating an observation (facts that don't yield higher-level knowledge)

### Operations

| Operation | Verb | Description |
|-----------|------|-------------|
| `memory.entities.create` | write | Recall-first entity creation. Searches for similar entities, returns candidates with confidence scores. Agent decides next step. |
| `memory.entities.confirm` | write | Confirm entity decision after create. Accept existing match, create new, or merge. Completes the create-or-find flow. |
| `memory.consolidate` | write | Compound consolidation: create/update observation from facts, add element_links, mark processing_log. Three patterns: create, update, skip. |

---

## CLI Tool Migration

All 13 current `nexus memory <subcommand>` CLI tools map to the new operations:

| Current CLI Tool | New Operation | Notes |
|---|---|---|
| `recall` | `memory.recall` | Direct rename |
| `insert_fact` | `memory.elements.create` | Generalized. `{type:'fact', entity_ids:[...]}` |
| `create_entity` | `memory.entities.create` | Kept as special tool (recall-first flow) |
| `confirm_entity` | `memory.entities.confirm` | Kept as special tool (interactive follow-up) |
| `link_element_entity` | `memory.elements.entities.link` | Direct rename |
| `propose_merge` | `entities.merge.propose` | Moved to Batch 2 entities domain |
| `consolidate_facts` | `memory.consolidate` | Kept as special tool (compound workflow) |
| `insert_element_link` | `memory.elements.links.create` | Direct rename |
| `resolve_element_head` | `memory.elements.head` | Direct rename |
| `create_mental_model` | `memory.elements.create` | `{type:'mental_model', pinned:false}` |
| `update_mental_model` | `memory.elements.create` | `{type:'mental_model', parent_id:'prev_id'}` |
| `write_attachment_interpretation` | `memory.elements.create` | `{type:'attachment_interpretation'}` |
| `read_attachment_interpretation` | `memory.elements.query` | `{type:'attachment_interpretation', source_event_id:...}` |

10 of 13 tools map to core operations. 3 stay as special agent tools because they have compound workflow semantics.

---

## Operation Count Summary

| Domain | Operations |
|--------|-----------|
| `memory.elements.*` | 11 |
| `memory.recall` | 1 |
| `memory.sets.*` | 5 |
| `memory.jobs.*` | 4 |
| Special agent tools | 3 |
| **Total** | **24** |

Plus `entities.merge.propose` added to Batch 2 (1 operation).

---

## Dropped: `memory.review.*`

The 11 `memory.review.*` operations from the previous taxonomy are fully replaced by the primitives above:

| Old Operation | Replacement |
|---|---|
| `memory.review.runs.list` | `memory.jobs.list` |
| `memory.review.run.get` | `memory.jobs.get` |
| `memory.review.run.episodes.list` | `memory.sets.list` `{definition:'retain'}` |
| `memory.review.episode.get` | `memory.sets.get` |
| `memory.review.episode.outputs.get` | `memory.jobs.outputs.list` |
| `memory.review.entity.get` | `entities.get` (Batch 2) |
| `memory.review.fact.get` | `memory.elements.get` |
| `memory.review.observation.get` | `memory.elements.get` + `memory.elements.history` |
| `memory.review.quality.summary` | Queries on `memory.elements.query` + `memory.jobs.list` |
| `memory.review.quality.items.list` | Queries on `memory.elements.query` with filters |
| `memory.review.search` | `memory.recall` |

No dedicated quality operations — quality checks are just filtered queries on the core primitives (e.g., unconsolidated facts = `memory.elements.query` where type='fact' with no processing_log entry for consolidate_v1).

---

## Related Spec Documents

| Document | Scope |
|----------|-------|
| [MEMORY_SYSTEM.md](../../memory/MEMORY_SYSTEM.md) | Master architecture: 4 layers, lifecycle, tool architecture |
| [MEMORY_STORAGE_MODEL.md](../../memory/MEMORY_STORAGE_MODEL.md) | Storage schema: elements, sets, jobs — full SQL, design decisions |
| [MEMORY_RECALL.md](../../memory/MEMORY_RECALL.md) | Recall API: retrieval strategies, parameters, budget control, fusion |
| [RETAIN_PIPELINE.md](../../memory/RETAIN_PIPELINE.md) | Episode lifecycle, filtering, payload assembly, writer dispatch |
| [MEMORY_WRITER.md](../../memory/MEMORY_WRITER.md) | Writer meeseeks: workflow, extraction rules, entity resolution |
| [MEMORY_CONSOLIDATION.md](../../memory/MEMORY_CONSOLIDATION.md) | Consolidation meeseeks: observations, causal links, entity merges |
| [FACT_GRAPH_TRAVERSAL.md](../../memory/FACT_GRAPH_TRAVERSAL.md) | Graph traversal patterns for relationship queries |
