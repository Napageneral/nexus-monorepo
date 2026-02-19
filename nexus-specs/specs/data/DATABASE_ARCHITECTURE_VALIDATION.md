# Database Architecture — Validation Checklist

> Use this document to verify that all spec documents are aligned to DATABASE_ARCHITECTURE.md after the migration.
> Run each check. Mark PASS/FAIL. Any FAIL means the doc still has stale content.

---

## 1. Folder Structure

- [ ] `specs/data/cortex/` directory no longer exists (renamed to `specs/data/memory/`)
- [ ] `specs/data/memory/` exists and contains V2 memory specs
- [ ] `specs/data/memory/v2/` is flattened into `specs/data/memory/` (V2 is the only version)
- [ ] `specs/data/_archive/` exists and contains the 6 superseded docs:
  - [ ] `IDENTITY_GRAPH.md` (was `data/ledgers/`)
  - [ ] `MEMORY_SYSTEM.md` (was `data/cortex/`)
  - [ ] `CORTEX_NEX_MIGRATION.md` (was `data/cortex/`)
  - [ ] `CORTEX_AGENT_INTERFACE.md` (was `data/cortex/`)
  - [ ] `MEMORY_WRITER.md` (was `data/cortex/roles/`)
  - [ ] `MEMORY_READER.md` (was `data/cortex/roles/`)
- [ ] `specs/data/cortex/roles/` directory no longer exists
- [ ] `specs/data/ledgers/` still exists with updated docs

## 2. Term Elimination — Zero Occurrences Expected

The following terms should appear NOWHERE in the active (non-archived) spec corpus.
Search scope: `specs/` excluding `specs/data/_archive/` and any `upstream/` directories.

### 2.1 Database Names
- [ ] `cortex.db` — zero occurrences (replaced by `memory.db` or `identity.db` depending on context)
- [ ] `nexus.db` — zero occurrences (replaced by `runtime.db`)
- [ ] `cortex/cortex.db` — zero occurrences

### 2.2 Eliminated Tables
- [ ] `sync_watermarks` — zero occurrences as a table name (OK in historical/migration context if clearly marked)
- [ ] `identity_mappings` — zero occurrences as a table name
- [ ] `entity_aliases` — zero occurrences as a table name
- [ ] `agent_sessions` (in cortex context) — zero occurrences
- [ ] `agent_turns` (in cortex context) — zero occurrences
- [ ] `agent_messages` (in cortex context) — zero occurrences
- [ ] `agent_tool_calls` (in cortex context) — zero occurrences
- [ ] `persons` — zero occurrences as a table name
- [ ] `person_facts` — zero occurrences
- [ ] `person_contact_links` — zero occurrences
- [ ] `contact_identifiers` — zero occurrences

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
- [ ] `channel` used to mean "platform" — zero occurrences (note: `channel` in the context of `container_kind: "channel"` IS valid)
- [ ] `identifier` used to mean "sender_id" — zero occurrences
- [ ] `peer_kind` / `peer_id` — zero occurrences (replaced by delivery taxonomy)

### 2.5 Eliminated Infrastructure
- [ ] `cortex-search.sh` — zero occurrences (replaced by `recall()`)
- [ ] `cortex-write.sh` — zero occurrences
- [ ] `CortexClient` — zero occurrences (Go HTTP IPC eliminated)
- [ ] `CortexSupervisor` — zero occurrences or marked as deprecated/transitional
- [ ] `cortex serve` — zero occurrences or marked as deprecated/transitional
- [ ] `internal/adapters/` (Go cortex adapter paths) — zero occurrences
- [ ] `internal/sync/` (Go cortex sync paths) — zero occurrences
- [ ] `internal/bus/` (Go cortex bus paths) — zero occurrences

## 3. Required Terms — Must Be Present

### 3.1 Database Layout
- [ ] `events.db` mentioned in data/README.md and DATABASE_ARCHITECTURE.md
- [ ] `agents.db` mentioned in data/README.md and DATABASE_ARCHITECTURE.md
- [ ] `identity.db` mentioned in data/README.md and DATABASE_ARCHITECTURE.md
- [ ] `memory.db` mentioned in data/README.md and DATABASE_ARCHITECTURE.md
- [ ] `embeddings.db` mentioned in data/README.md and DATABASE_ARCHITECTURE.md
- [ ] `runtime.db` mentioned in data/README.md and DATABASE_ARCHITECTURE.md
- [ ] "6 databases" or equivalent phrasing in overview docs

### 3.2 Correct Table Locations
- [ ] `entities` described as being in `identity.db` (not memory.db or cortex.db)
- [ ] `entity_tags` described as being in `identity.db`
- [ ] `contacts` described as being in `identity.db`
- [ ] `grants` (ACL) described as being in `identity.db`
- [ ] `facts` described as being in `memory.db`
- [ ] `episodes` described as being in `memory.db`
- [ ] `embeddings` / `vec_embeddings` described as being in `embeddings.db`
- [ ] `automations` described as being in `runtime.db`
- [ ] `nexus_requests` described as being in `runtime.db`
- [ ] `bus_events` (Nex write-through) described as being in `runtime.db`

### 3.3 Delivery Taxonomy
- [ ] `platform` used instead of `channel` for adapter/source identification
- [ ] `space_id` used for server/workspace scoping
- [ ] `sender_id` used for sender identification
- [ ] `container_id` / `container_kind` used for channel/DM/group identification
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
- [ ] Not reference Go cortex adapters or sync pipeline as current/active
- [ ] Use delivery taxonomy terminology (platform, space_id, sender_id, container_id)

## 5. Cross-Reference Integrity

- [ ] Every spec that mentions a database name uses the correct 6-DB naming
- [ ] Every spec that mentions table locations is consistent with DATABASE_ARCHITECTURE.md §3
- [ ] No spec describes entities as living in cortex.db or memory.db
- [ ] No spec describes ACL tables as living in nexus.db or runtime.db
- [ ] The WORKSPACE_LIFECYCLE.md boot sequence references 6 databases
- [ ] The LIVE_E2E_HARNESS.md scenario references use correct DB names
