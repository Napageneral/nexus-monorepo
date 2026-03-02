# Implementation Plan — Unified Cutover

**Status:** ACTIVE
**Last Updated:** 2026-03-02
**Policy:** Hard cutover. No migrations, no backwards compatibility. Nuke and rebuild.

---

## Overview

This plan unifies two parallel workstreams — the **nex runtime redesign** and the **memory system rewrite** — into a single execution sequence. Both workstreams share databases (events.db, identity.db), types (NexusRequest, Entity, Routing), and pipeline infrastructure (hookpoints, automations). They must be executed in a coordinated order.

### Source Documents

| Workstream | Index | Detail Workplans |
|---|---|---|
| **Memory** | `specs/memory/workplans/INDEX.md` | `01_SCHEMA`, `02_IDENTITY`, `03_WRITER_TOOLS`, `04_RECALL`, `05_PIPELINE`, `06_TESTS` |
| **Nex Runtime** | `specs/nex/workplans/CUTOVER_INDEX.md` | `CUTOVER_01` through `CUTOVER_06` |

### Canonical Specs

| Spec | What it defines |
|---|---|
| `specs/nex/NEXUS_REQUEST_TARGET.md` | NexusRequest bus, pipeline stages, event schema, entity model, episode detection, memory hooks |
| `specs/nex/AGENT_DELIVERY.md` | Agent-driven delivery model |
| `specs/nex/ATTACHMENTS.md` | Unified attachment schema |
| `specs/memory/MEMORY_SYSTEM.md` | Memory architecture overview |
| `specs/memory/MEMORY_STORAGE_MODEL.md` | Elements/Sets/Jobs schema (14 tables) |
| `specs/memory/UNIFIED_ENTITY_STORE.md` | Entities, contacts, identity resolution |
| `specs/memory/RETAIN_PIPELINE.md` | Episode lifecycle, detection, payload |
| `specs/memory/MEMORY_WRITER.md` | Writer meeseeks role spec |
| `specs/memory/MEMORY_CONSOLIDATION.md` | Consolidator meeseeks role spec |
| `specs/memory/MEMORY_RECALL.md` | Recall API, strategies, result types |

---

## Execution Phases

```
Phase 1: Database Foundations
    1a: Memory Schema (memory.db)          ← self-contained
    1b: Events Schema (events.db)          ← self-contained
    1c: Identity Schema (identity.db)      ← self-contained, merges both workstreams

Phase 2: Code Layer 1 — Types + Tools
    2a: NexusRequest Bus (request.ts)      ← core types everything references
    2b: Writer Tools (memory-writer-tools) ← depends on 1a (memory schema)
    2c: Adapter Protocol (protocol.ts)     ← depends on 2a (new types)

Phase 3: Code Layer 2 — Query + Pipeline
    3a: Recall Rewrite (recall.ts)         ← depends on 1a + 1b
    3b: Pipeline Rewrite (pipeline.ts)     ← depends on 2a
    3c: Memory Pipeline (retain/dispatch)  ← depends on 1a + 2b + 3b

Phase 4: Cleanup
    4a: Reply Module Deletion              ← depends on 3b
    4b: Automations Collapse               ← depends on 3b
    4c: Dead Import Sweep                  ← depends on everything
    4d: Tests                              ← final gate
```

---

## Phase 1: Database Foundations

All three databases are nuked and rebuilt from scratch. No migrations. These are independent of each other and can run in parallel.

### 1a: Memory Schema (memory.db)

**Source:** `specs/memory/workplans/01_SCHEMA.md`
**File:** `src/db/memory.ts`
**What:** Delete all old DDL + migration helpers. Write new `ensureMemorySchema()` with 14 tables from MEMORY_STORAGE_MODEL.md: `elements`, `sets`, `jobs`, `set_members`, `element_links`, `element_entities`, `processing_log`, `resolution_log`, `job_outputs`, `access_log`, `elements_fts`, `embeddings`, `vec_embeddings`, `schema_version`. Plus seed data for `job_type_definitions`.

**Validation Gate:**
- [ ] `ensureMemorySchema(db)` creates all 14 tables
- [ ] Seed data present (`retain_v1`, `consolidate_v1`, `reflect_v1` in job_type_definitions)
- [ ] FTS5 triggers fire on INSERT/UPDATE/DELETE
- [ ] Old tables absent (`facts`, `episodes`, `analysis_runs`, `mental_models`, etc.)
- [ ] TypeScript interfaces compile (`ElementRow`, `SetRow`, `JobRow`)

### 1b: Events Schema (events.db)

**Source:** `specs/nex/workplans/CUTOVER_03_EVENTS_DB.md`
**File:** `src/db/events.ts`
**What:** Nuke entire schema. Rebuild with new `events` table (columns: `id`, `event_id`, `content`, `content_type`, `attachments`, `recipients`, `timestamp`, `received_at`, `platform`, `sender_id`, `receiver_id`, `space_id`, `container_kind`, `container_id`, `thread_id`, `reply_to_id`, `request_id`, `metadata`). New `attachments` table with composite PK `(event_id, id)`. New `attachment_interpretations` table. Delete ~600 lines of SQL triggers. Delete 8 auxiliary tables. Delete all migration helpers.

**Validation Gate:**
- [ ] `ensureEventsSchema(db)` creates `events`, `attachments`, `attachment_interpretations`, `events_fts`
- [ ] `UNIQUE(platform, event_id)` constraint works
- [ ] Attachments PK is `(event_id, id)`
- [ ] FTS triggers fire correctly
- [ ] Old tables absent (`threads`, `event_participants`, `event_state`, `tags`, etc.)
- [ ] `insertEvent()` uses new column names
- [ ] `insertEventWithAttachments()` works
- [ ] TypeScript interfaces compile (`EventRow`, `InsertEventInput`)

### 1c: Identity Schema (identity.db)

**Source:** `specs/nex/workplans/CUTOVER_04_IDENTITY_AND_NEXUS_DB.md` + `specs/memory/workplans/02_IDENTITY.md`
**File:** `src/db/identity.ts`
**What:** Rewrite contacts table to locked-in schema (`id` PK, `contact_id`, `contact_name`, `origin`, `avatar_url`, `metadata`). Add `origin TEXT` to entities table. Rename throughout codebase: `sender_id`→`contact_id` (contacts context only), `sender_name`→`contact_name`, `source`→`origin`. Value mapping: `"observed"`→`"writer"`.

**Validation Gate:**
- [ ] Contacts table has new schema with `UNIQUE(platform, space_id, contact_id)`
- [ ] Entities table has `origin` column
- [ ] `ContactRow` interface uses `contact_id`, `contact_name`, `origin`
- [ ] `grep sender_id src/db/identity.ts` returns zero matches
- [ ] `grep "source" src/db/identity.ts` returns zero matches (in column context)
- [ ] Contact CRUD works (insert, query by platform+contact_id, resolve to entity)

---

## Phase 2: Code Layer 1 — Types + Tools

### 2a: NexusRequest Bus (request.ts)

**Source:** `specs/nex/workplans/CUTOVER_01_NEXUS_REQUEST_BUS.md`
**File:** `src/nex/request.ts`
**What:** Delete 18 old Zod schemas. Create 11 new ones: `Attachment`, `RoutingParticipant`, `Routing`, `EventPayload`, `Entity`, `AccessContext`, `AutomationContext`, `AgentContext`, `StageTrace`, `RequestStatus`, `QueueMode`. Rewrite `NexusRequest` interface with new shape. This is the most impactful change — everything imports from this file.

**Validation Gate:**
- [ ] `NexusRequest` has `routing`, `payload`, `entity`, `access`, `automations`, `agent`, `stages`
- [ ] Old types deleted (`SenderContext`, `ReceiverContext`, `EventContext`, `DeliveryContext`, etc.)
- [ ] New types export correctly
- [ ] `npm run build` on request.ts itself compiles (callers will break — expected)

### 2b: Writer Tools Rewrite

**Source:** `specs/memory/workplans/03_WRITER_TOOLS.md`
**File:** `src/agents/tools/memory-writer-tools.ts`
**What:** Rewrite all 12 tools for elements/sets/jobs model. Key renames: `insert_fact`→same but writes to `elements`, `link_fact_entity`→`link_element_entity`, `create_observation`→same but writes to `elements`. Add job context threading. Add `consolidate_facts` tool.

**Validation Gate:**
- [ ] Each tool writes correct rows to correct tables
- [ ] `insert_fact` creates element with `type='fact'`
- [ ] `link_element_entity` creates `element_entities` row
- [ ] `create_observation` creates element with `type='observation'`
- [ ] `insert_causal_link` creates `element_links` row
- [ ] Job ID threading works (tools reference `currentJobId`)

### 2c: Adapter Protocol Update

**Source:** `specs/nex/workplans/CUTOVER_05_ADAPTER_PROTOCOL.md`
**File:** `src/nex/adapters/protocol.ts`
**What:** Rename `CanonicalFlatAdapterEventSchema`→`AdapterEventSchema`. Update attachment fields to canonical names. Rewrite `parseAdapterEventLine()` to produce `{ operation, routing, payload }`.

**Validation Gate:**
- [ ] `parseAdapterEventLine()` returns `{ operation, routing, payload }` shape
- [ ] Adapter attachment fields use `mime_type`, `size`, `local_path`
- [ ] `delivery_metadata`→`routing_metadata`

---

## Phase 3: Code Layer 2 — Query + Pipeline

### 3a: Recall Rewrite

**Source:** `specs/memory/workplans/04_RECALL.md`
**File:** `src/memory/recall.ts`
**What:** Rewrite all queries against unified `elements` + `elements_fts`. Discriminated union result types (`FactResult | ObservationResult | MentalModelResult | EntityResult`). Cross-DB queries use new events.db column names. `processing_log` anti-join replaces `is_retained`.

**Validation Gate:**
- [ ] FTS search returns results from `elements_fts`
- [ ] Result types are correctly discriminated by `type` field
- [ ] Cross-DB queries compile (memory.db ↔ identity.db ↔ events.db)
- [ ] Short-term events strategy uses `processing_log` anti-join

### 3b: Pipeline Rewrite (nex stages)

**Source:** `specs/nex/workplans/CUTOVER_02_PIPELINE_AND_STAGES.md`
**File:** `src/nex/pipeline.ts` + stage files
**What:** Rewrite from 8→5 stages (`acceptRequest`, `resolvePrincipals`, `resolveAccess`, `executeOperation`, `finalizeRequest`). Delete `runAutomations`, `assembleContext`, `runAgent`, `deliverResponse` stages. Remove ~190 lines of inline memory code.

**Validation Gate:**
- [ ] Pipeline runs 5 stages in order
- [ ] Deleted stage files removed
- [ ] No inline memory code in pipeline.ts
- [ ] `executeOperation` delegates to broker
- [ ] Hookpoints fire at correct stages

### 3c: Memory Pipeline (retain + dispatch)

**Source:** `specs/memory/workplans/05_PIPELINE.md`
**Files:** `src/memory/retain-dispatch.ts`, `retain-episodes.ts`, meeseeks automations
**What:** Episode payload construction uses sets/set_members. Job tracking wraps meeseeks dispatch. Episode detection: inline token-budget check + cron timer for silence window. `episode-created` and `episode-retained` hookpoints.

**Validation Gate:**
- [ ] Episode payload builds from set members with participants legend
- [ ] Job row created before meeseeks dispatch, outputs recorded after
- [ ] `processing_log` entries written (no `is_retained`)
- [ ] Episode detection: token budget clips inline, silence timer via cron
- [ ] `episode-created` fires → writer meeseeks dispatched
- [ ] `episode-retained` fires → consolidator meeseeks dispatched

---

## Phase 4: Cleanup

### 4a: Reply Module Deletion

**Source:** `specs/nex/workplans/CUTOVER_06_REPLY_DELETION_AND_CLEANUP.md` Part A
**What:** Archive `src/reply/` for adapter SDK reference, then `rm -rf src/reply/`. Fix all broken imports.

### 4b: Automations Collapse

**Source:** `specs/nex/workplans/CUTOVER_06_REPLY_DELETION_AND_CLEANUP.md` Part B
**What:** Merge `evaluateDurableAutomations()` into `evaluateAutomationsAtHook()`. Single unified function. Delete old function.

### 4c: Dead Import Sweep

**Source:** `specs/nex/workplans/CUTOVER_06_REPLY_DELETION_AND_CLEANUP.md` Part E
**What:** Grep for all broken imports, deleted types, old field names. Fix everything.

### 4d: Tests

**Source:** `specs/memory/workplans/06_TESTS.md` + nex test updates
**What:** Update all test files for new schemas, types, and interfaces. This is mechanical but voluminous.

**Final Gate:**
- [ ] `npm run build` — zero errors
- [ ] `npm test` — all tests pass
- [ ] No references to old types (`SenderContext`, `EventContext`, `DeliveryContext`, etc.)
- [ ] No references to old column names (`from_identifier`, `source_id`, `is_retained`, etc.)
- [ ] No references to old hook names (`memory:retain-episode`, `after:runAgent` for memory)

---

## Parallelization Map

```
         ┌─── 1a: Memory Schema ─── 2b: Writer Tools ──┐
         │                                               │
Start ───┼─── 1b: Events Schema ─── 3a: Recall ─────────┼─── 3c: Memory Pipeline ─── 4a-d: Cleanup
         │                                               │
         ├─── 1c: Identity Schema                        │
         │                                               │
         └─── 2a: NexusRequest Bus ─── 2c: Adapter ─────┘
                        │
                        └──────── 3b: Pipeline ──────────┘
```

**What can run in parallel:**
- 1a, 1b, 1c (all database rewrites — independent files, independent DBs)
- 2a can start once types are designed (doesn't need DBs)
- 2b depends on 1a only
- 2c depends on 2a only
- 3a depends on 1a + 1b
- 3b depends on 2a
- 3c depends on 1a + 2b + 3b (the bottleneck — needs everything)
- 4a-d are serial cleanup after everything

---

## Validation Ladder (Rung-by-Rung)

Each rung is a discrete, dispatchable task. Validate the gate before climbing to the next rung.

| Rung | Phase | Task | Files | Gate |
|------|-------|------|-------|------|
| 0 | Pre-flight | Baseline snapshot | — | `npm run build` + `npm test` results recorded |
| 1 | 1a | Memory schema DDL | `db/memory.ts` | 14 tables created, seed data present |
| 2 | 1a | Memory TypeScript interfaces | `db/memory.ts` | `ElementRow`, `SetRow`, `JobRow` compile |
| 3 | 1b | Events schema DDL | `db/events.ts` | New tables, old tables gone, FTS works |
| 4 | 1b | Events TypeScript interfaces | `db/events.ts` | `EventRow`, `InsertEventInput` compile |
| 5 | 1c | Identity schema rewrite | `db/identity.ts` | Contacts + entities with new columns |
| 6 | 1c | Identity ripple | grep across codebase | Zero stale `sender_id`/`source` in identity context |
| 7 | 2a | NexusRequest types | `nex/request.ts` | 11 new schemas export, old schemas deleted |
| 8 | 2b | Writer tools — core | `memory-writer-tools.ts` | `insert_fact`, `link_element_entity` write correct rows |
| 9 | 2b | Writer tools — full | `memory-writer-tools.ts` | All 12 tools compile + write correctly |
| 10 | 2c | Adapter protocol | `adapters/protocol.ts` | `parseAdapterEventLine()` returns new shape |
| 11 | 3a | Recall — FTS + types | `memory/recall.ts` | FTS returns typed results |
| 12 | 3a | Recall — consumers | injection, search, reflect | All consumers compile with new types |
| 13 | 3b | Pipeline stages | `nex/pipeline.ts` + stages | 5 stages execute in order |
| 14 | 3c | Episode payload | `retain-episodes.ts` | Payload builds from set members |
| 15 | 3c | Job tracking | meeseeks automations | Job row created → tools reference it → outputs recorded |
| 16 | 3c | Episode detection | pipeline + cron | Token budget clips, silence timer fires |
| 17 | 4a | Reply deletion | `src/reply/` | Directory gone, imports fixed |
| 18 | 4b | Automations collapse | `hooks-runtime.ts` | Single unified function |
| 19 | 4c | Dead import sweep | entire `src/` | Zero stale references |
| 20 | 4d | Full test suite | all tests | `npm run build` + `npm test` green |
