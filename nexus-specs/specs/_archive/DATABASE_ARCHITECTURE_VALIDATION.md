# Database Architecture — Validation Checklist

> Use this document to verify that all spec documents are aligned to DATABASE_ARCHITECTURE.md after the migration.
> Run each check. Mark PASS/FAIL. Any FAIL means the doc still has stale content.

---

## 1. Folder Structure

- [ ] `specs/memory/` exists and contains canonical memory specs (MEMORY_SYSTEM.md, MEMORY_STORAGE_MODEL.md, etc.)
- [ ] `specs/memory/README.md` lists all spec documents in correct reading order
- [ ] `specs/memory/MEMORY_STORAGE_MODEL.md` exists (elements/sets/jobs unified storage model)
- [ ] `specs/memory/skills/` contains skill docs (MEMORY_INJECTION.md, MEMORY_SEARCH_SKILL.md, MEMORY_REFLECT_SKILL.md)
- [ ] `specs/memory/workplans/` contains V4 workplans (WORKPLAN_V4_INDEX.md, WORKPLAN_V4_01-06)
- [ ] Old paths `specs/data/cortex/`, `specs/data/memory/`, `specs/data/cortex/roles/` no longer exist
- [ ] `specs/data/_archive/` exists and contains the superseded docs:
  - [ ] `IDENTITY_GRAPH.md` (was `data/ledgers/`)
  - [ ] `MEMORY_SYSTEM.md` (was `data/cortex/`)
  - [ ] `CORTEX_NEX_MIGRATION.md` (was `data/cortex/`)
  - [ ] `CORTEX_AGENT_INTERFACE.md` (was `data/cortex/`)
  - [ ] `MEMORY_WRITER.md` (was `data/cortex/roles/`)
  - [ ] `MEMORY_READER.md` (was `data/cortex/roles/`)
- [ ] `specs/ledgers/` still exists with updated docs

## 2. Term Elimination — Zero Occurrences Expected

The following terms should appear NOWHERE in the active (non-archived) spec corpus.
Search scope: `specs/` excluding `specs/data/_archive/` and any `upstream/` directories.

### 2.1 Database Names
- [ ] `cortex.db` — zero occurrences in active prose (replaced by `memory.db` or `identity.db` depending on context; OK in file paths describing legacy files to delete)
- [ ] `nexus.db` — zero occurrences (replaced by `runtime.db`)
- [ ] `cortex/cortex.db` — zero occurrences in active prose (OK in file paths describing legacy files to delete)

### 2.2 Eliminated Tables
- [ ] `sync_watermarks` — zero occurrences as a table name (OK in historical/migration context if clearly marked)
- [ ] `identity_mappings` — zero occurrences as a table name
- [ ] `entity_aliases` — zero occurrences as a table name
- [ ] `agent_sessions` (in legacy memory DB context) — zero occurrences
- [ ] `agent_turns` (in legacy memory DB context) — zero occurrences
- [ ] `agent_messages` (in legacy memory DB context) — zero occurrences
- [ ] `agent_tool_calls` (in legacy memory DB context) — zero occurrences
- [ ] `persons` — zero occurrences as a table name
- [ ] `person_facts` — zero occurrences
- [ ] `person_contact_links` — zero occurrences
- [ ] `contact_identifiers` — zero occurrences

### 2.2b Superseded Memory Tables (replaced by elements/sets/jobs model)
- [ ] `facts` as a standalone table — zero occurrences (now `elements WHERE type = 'fact'`)
- [ ] `observations` as a standalone table — zero occurrences (now `elements WHERE type = 'observation'`)
- [ ] `mental_models` as a standalone table — zero occurrences (now `elements WHERE type = 'mental_model'`)
- [ ] `analysis_runs` — zero occurrences (replaced by `jobs`)
- [ ] `analysis_types` — zero occurrences (replaced by `job_types`)
- [ ] `fact_entities` — zero occurrences (replaced by `element_entities`)
- [ ] `observation_facts` — zero occurrences (replaced by `set_members`)
- [ ] `causal_links` — zero occurrences (replaced by `element_links`)
- [ ] `episodes` as a standalone table — zero occurrences (replaced by `sets`)
- [ ] `episode_events` — zero occurrences (replaced by `set_members`)
- [ ] `episode_definitions` — zero occurrences (replaced by `set_definitions`)
- [ ] `facets` — zero occurrences (absorbed into elements/job_outputs model)
- [ ] `is_consolidated` as a column — zero occurrences (replaced by `processing_log`)

### 2.3 Eliminated Prefixes
- [ ] `acl_grants` — zero occurrences (now just `grants` in identity.db)
- [ ] `acl_grant_log` — zero occurrences (now `grant_log`)
- [ ] `acl_access_log` — zero occurrences (now `access_log`)
- [ ] `acl_permission_requests` — zero occurrences (now `permission_requests`)
- [ ] `delivery_spaces` — zero occurrences (now `spaces`)
- [ ] `delivery_containers` — zero occurrences (now `containers`)
- [ ] `delivery_space_names` — zero occurrences (consolidated into `names`)
- [ ] `delivery_container_names` — zero occurrences (consolidated into `names`)
- [ ] `delivery_thread_names` — zero occurrences (consolidated into `names`)
- [ ] `delivery_container_participants` — zero occurrences (now `container_participants`)
- [ ] `delivery_membership_events` — zero occurrences (now `membership_events`)
- [ ] `aix_import_jobs` — zero occurrences (now `import_jobs`)

### 2.4 Stale Terminology
- [ ] `from_channel` as a field name — zero occurrences in spec prose (OK in actual events.db SQL schema since that column hasn't been renamed in code yet)
- [ ] `from_identifier` as a field name — same caveat as above
- [ ] `channel` used to mean "platform" — zero occurrences (note: vendor/API nouns and target-kind labels may still use `channel`)
- [ ] `identifier` used to mean "sender_id" — zero occurrences
- [ ] `peer_kind` / `peer_id` — zero occurrences (replaced by delivery taxonomy)

### 2.5 Eliminated Infrastructure
- [ ] `cortex-search.sh` — zero occurrences (replaced by `recall()`)
- [ ] `cortex-write.sh` — zero occurrences
- [ ] `CortexClient` — zero occurrences (Go HTTP IPC eliminated)
- [ ] `CortexSupervisor` — zero occurrences (Go subprocess eliminated)
- [ ] `cortex serve` — zero occurrences (Go subprocess eliminated)
- [ ] `internal/adapters/` (Go adapter paths) — zero occurrences
- [ ] `internal/sync/` (Go sync paths) — zero occurrences
- [ ] `internal/bus/` (Go bus paths) — zero occurrences

## 3. Required Terms — Must Be Present

### 3.1 Database Layout
- [ ] `events.db` mentioned in data/README.md and DATABASE_ARCHITECTURE.md
- [ ] `agents.db` mentioned in data/README.md and DATABASE_ARCHITECTURE.md
- [ ] `identity.db` mentioned in data/README.md and DATABASE_ARCHITECTURE.md
- [ ] `memory.db` mentioned in data/README.md and DATABASE_ARCHITECTURE.md
- [ ] `embeddings.db` mentioned in data/README.md and DATABASE_ARCHITECTURE.md
- [ ] `runtime.db` mentioned in data/README.md and DATABASE_ARCHITECTURE.md
- [ ] `work.db` mentioned in DATABASE_ARCHITECTURE.md
- [ ] "7 databases" or equivalent phrasing in overview docs

### 3.2 Correct Table Locations
- [ ] `entities` described as being in `identity.db` (not memory.db or cortex.db)
- [ ] `entity_tags` described as being in `identity.db`
- [ ] `contacts` described as being in `identity.db` with `(platform, space_id, contact_id)` compound key
- [ ] `grants` (ACL) described as being in `identity.db`
- [ ] `elements` described as being in `memory.db` (unified table for facts, observations, mental models)
- [ ] `sets` described as being in `memory.db` (replaces old `episodes` table)
- [ ] `jobs` described as being in `memory.db` (replaces old `analysis_runs` table)
- [ ] `element_entities` described as being in `memory.db` (replaces old `fact_entities`)
- [ ] `element_links` described as being in `memory.db` (replaces old `causal_links`)
- [ ] `processing_log` described as being in `memory.db` (replaces `is_consolidated` flag)
- [ ] `embeddings` / `vec_embeddings` described as being in `embeddings.db`
- [ ] `automations` described as being in `runtime.db`
- [ ] `nexus_requests` described as being in `runtime.db`
- [ ] `bus_events` (Nex write-through) described as being in `runtime.db`

### 3.3 Delivery Taxonomy
- [ ] `platform` used instead of `channel` for adapter/source identification
- [ ] `space_id` used for server/workspace scoping
- [ ] `contact_id` used for contact identification in identity layer (renamed from `sender_id`)
- [ ] `contact_name` used for display name in contacts table (renamed from `sender_name`)
- [ ] `container_id` / `container_kind` used for direct/group container identification
- [ ] `DeliveryContext` type referenced where appropriate

### 3.4 Adapter Sync
- [ ] Adapters described as owning their own sync state (no centralized watermarks)
- [ ] `getSyncStatus()` interface documented
- [ ] `backfill_cursor` on `adapter_instances` described as cached snapshot, not source of truth

## 4. Document-Level Checks

Each updated document should:
- [ ] Use `memory.db` not `cortex.db` when referring to the memory/facts database
- [ ] Use `identity.db` when referring to entities, contacts, ACL, auth, directory
- [ ] Use `runtime.db` not `nexus.db` when referring to the runtime operations database
- [ ] Use `embeddings.db` when referring to vector embeddings
- [ ] Reference DATABASE_ARCHITECTURE.md as the canonical source for DB layout
- [ ] Not reference Go memory subprocess adapters or sync pipeline as current/active
- [ ] Use delivery taxonomy terminology (platform, space_id, sender_id, container_id)
- [ ] Use `contact_id`/`contact_name` (not `sender_id`/`sender_name`) when referring to contacts table columns
- [ ] Use `memory-injection` (not `memory-reader`) when referring to the injection meeseeks

## 4b. Storage Model Alignment (memory.db)

Every spec that references memory.db tables should use the unified elements/sets/jobs model:
- [ ] `MEMORY_STORAGE_MODEL.md` is the single source of truth for memory.db schema
- [ ] `MEMORY_SYSTEM.md` references `MEMORY_STORAGE_MODEL.md` for schema details
- [ ] All specs use `elements` (not `facts`, `observations`, `mental_models` as separate tables)
- [ ] All specs use `element_entities` (not `fact_entities`)
- [ ] All specs use `element_links` with `link_type` discriminator (not `causal_links`)
- [ ] All specs use `sets` and `set_members` (not `episodes` and `episode_events`)
- [ ] All specs use `jobs` and `job_types` (not `analysis_runs` and `analysis_types`)
- [ ] All specs use `processing_log` (not `is_consolidated` flag)
- [ ] `MEMORY_RECALL.md` references `elements_fts` (not `facts_fts`)
- [ ] `MEMORY_WRITER.md` references `insert_fact` creating elements with `type='fact'`
- [ ] `MEMORY_CONSOLIDATION.md` references `insert_element_link` (not `insert_causal_link`)
- [ ] `UNIFIED_ENTITY_STORE.md` contacts use `(platform, space_id, contact_id)` compound key

## 5. Cross-Reference Integrity

- [ ] Every spec that mentions a database name uses the correct 7-DB naming
- [ ] Every spec that mentions table locations is consistent with DATABASE_ARCHITECTURE.md §3
- [ ] No spec describes entities as living in a legacy memory DB or memory.db
- [ ] No spec describes ACL tables as living in nexus.db or runtime.db
- [ ] The WORKSPACE_LIFECYCLE.md boot sequence references 7 databases
- [ ] The LIVE_E2E_HARNESS.md scenario references use correct DB names
- [ ] No spec uses `memory-reader` to refer to the injection meeseeks (renamed to `memory-injection`)
