# Context — Nexus Runtime + Memory System Redesign

**Last Updated:** 2026-03-03
**Policy:** Hard cutover. No migrations, no backwards compatibility. Nuke and rebuild. Dev/test data is not preserved. The spec is the source of truth.

---

## What We're Building

Nexus is an agent runtime. Two major subsystems are being redesigned simultaneously:

1. **Nex Runtime** — The pipeline that processes inbound events, resolves identity, evaluates automations, and dispatches agent execution. Being simplified from 8 stages to 5, with agent-driven delivery replacing pipeline-managed delivery.

2. **Memory System** — The system that retains conversation episodes, extracts durable knowledge as facts/entities/observations, and injects relevant memory context into agent execution. Being rebuilt on a unified Elements/Sets/Jobs storage model.

Both subsystems share databases (events.db, identity.db), types (NexusRequest, Entity, Routing), and pipeline infrastructure (hookpoints, automations). They are coordinated via `IMPLEMENTATION_PLAN.md`.

---

## Document Inventory

Read canonical specs for the target state. Read workplans for mechanical execution detail.

### Canonical Specs — Nex Runtime

| Path | Lines | What It Defines |
|------|-------|-----------------|
| `specs/nex/NEXUS_REQUEST_TARGET.md` | 839 | **The core spec.** NexusRequest data bus, 5-stage pipeline, Entity model, Routing/EventPayload types, events.db schema, episode detection, memory hookpoints. |
| `specs/nex/AGENT_DELIVERY.md` | 287 | Agent-driven delivery. Pipeline doesn't deliver — agent invokes a single delivery tool. Adapter owns typing/chunking/streaming. |
| `specs/nex/ATTACHMENTS.md` | 277 | Unified attachment schema. Zero translation across layers. Composite PK `(event_id, id)`. |

### Canonical Specs — Memory System

| Path | Lines | What It Defines |
|------|-------|-----------------|
| `specs/memory/MEMORY_SYSTEM.md` | 268 | Master architecture: 4 layers (ingest, retain, consolidate, inject), 3 agent roles, episode detection overview. |
| `specs/memory/MEMORY_STORAGE_MODEL.md` | 686 | **The schema spec.** Full SQL DDL for 14 tables in memory.db. Elements, sets, jobs, FTS, seed data, design rationale. |
| `specs/memory/UNIFIED_ENTITY_STORE.md` | 280 | Identity layer: entities, contacts (locked-in schema), merge candidates, entity tags, contact seeding. |
| `specs/memory/RETAIN_PIPELINE.md` | 282 | Episode lifecycle: hybrid detection, payload format, participants-as-legend, filtering, writer dispatch. |
| `specs/memory/EPISODE_DETECTION.md` | 230 | Episode detection mechanism: CronService-based per-episode timers, SQLite migration, internal event emission, crash recovery. Design decisions and alternatives considered. |
| `specs/memory/MEMORY_WRITER.md` | 264 | Writer meeseeks: 12 CLI tools, extraction workflow, entity resolution, attachment interpretation. |
| `specs/memory/MEMORY_CONSOLIDATION.md` | 166 | Consolidator meeseeks: `consolidate_facts` tool, observations, causal links, entity merge proposals. |
| `specs/memory/MEMORY_RECALL.md` | 236 | Recall API: 7+ retrieval strategies, budget tiers, discriminated union result types, embedding provider. |
| `specs/memory/FACT_GRAPH_TRAVERSAL.md` | 347 | Graph traversal SQL: entity relationships, temporal narratives, strength scoring, cluster discovery. |

### Canonical Specs — Supporting

| Path | What It Defines |
|------|-----------------|
| `specs/DATABASE_ARCHITECTURE.md` | 7 SQLite databases: topology, table allocation, cross-DB query patterns. |
| `specs/iam/IDENTITY_RESOLUTION.md` | Identity resolution pipeline in `resolvePrincipals`. Contact lookup, entity creation. |
| `specs/nex/ADAPTER_INTERFACE_UNIFICATION.md` | NexusAdapter interface, operation catalog (70+ operations), SDK contract. |
| `specs/nex/DAEMON.md` | Process lifecycle: startup, signals, shutdown, crash recovery. |

### Skills

| Path | Lines | What It Defines |
|------|-------|-----------------|
| `specs/memory/skills/MEMORY_INJECTION.md` | 126 | Pre-execution meeseeks at `worker:pre_execution`. Forked from session, searches memory, injects context. |
| `specs/memory/skills/MEMORY_SEARCH_SKILL.md` | 203 | User-facing `memory_search` tool. Hierarchical retrieval, query decomposition. |
| `specs/memory/skills/MEMORY_REFLECT_SKILL.md` | 146 | `memory_reflect` tool. Deep research, mental model creation/update, evidence guardrails. |

### Workplans — Master Plan

| Path | Lines | What It Defines |
|------|-------|-----------------|
| `IMPLEMENTATION_PLAN.md` | 280 | **Start here for execution.** Unified phases across both workstreams, parallelization map, 20-rung validation ladder. |

### Workplans — Memory

| Path | Lines | Phase | What It Changes | Status |
|------|-------|-------|-----------------|--------|
| `specs/memory/workplans/INDEX.md` | 103 | — | Index, dependency graph, key decisions. | Active |
| `specs/memory/workplans/_archive/05_PIPELINE.md` | 455 | 3c | retain-dispatch, meeseeks automations — sets, job tracking, hookpoints. | ✅ Archived |
| `specs/memory/workplans/06_TESTS.md` | 233 | 4d | All test files — schema helpers, tool mocks, assertion updates. | Blocked on Phase 7 |
| `specs/memory/workplans/07_EPISODE_DETECTION.md` | 505 | 7 | CronService JSON→SQLite migration, episode detection via cron timers, delete pending_retain_triggers. | Active |
| `specs/memory/workplans/_archive/01_SCHEMA.md` | 248 | 1a | `db/memory.ts` — 14-table Elements/Sets/Jobs schema. | ✅ Archived |
| `specs/memory/workplans/_archive/02_IDENTITY.md` | 257 | 1c | `db/identity.ts` — contacts rewrite. | ✅ Archived |
| `specs/memory/workplans/_archive/03_WRITER_TOOLS.md` | 391 | 2b | `memory-writer-tools.ts` — 12 tool rewrites. | ✅ Archived |
| `specs/memory/workplans/_archive/04_RECALL.md` | 358 | 3a | `recall.ts` — unified FTS, discriminated union types. | ✅ Archived |

### Workplans — Nex Cutover

| Path | Lines | Phase | What It Changes | Status |
|------|-------|-------|-----------------|--------|
| `specs/nex/workplans/CUTOVER_INDEX.md` | 107 | — | Master index, design decisions. | Active |
| `specs/nex/workplans/CUTOVER_06_REPLY_DELETION_AND_CLEANUP.md` | 324 | 4a-c | Reply deletion (90+ files), automations collapse, dead imports. | Active |
| `specs/nex/workplans/_archive/CUTOVER_01_NEXUS_REQUEST_BUS.md` | 480 | 2a | `request.ts` — delete 18 old Zod schemas, create 11 new ones. | ✅ Archived |
| `specs/nex/workplans/_archive/CUTOVER_02_PIPELINE_AND_STAGES.md` | 482 | 3b | `pipeline.ts` + stages — 8->5 stages, delete 4 stage files. | ✅ Archived |
| `specs/nex/workplans/_archive/CUTOVER_03_EVENTS_DB.md` | 475 | 1b | `events.ts` — nuke schema, rebuild events + attachments tables. | ✅ Archived |
| `specs/nex/workplans/_archive/CUTOVER_04_IDENTITY_AND_NEXUS_DB.md` | 538 | 1c | `identity.ts` — contacts rewrite, entities origin. | ✅ Archived |
| `specs/nex/workplans/_archive/CUTOVER_05_ADAPTER_PROTOCOL.md` | 229 | 2c | `protocol.ts` — adapter schema rename, `parseAdapterEventLine()` rewrite. | ✅ Archived |

**Total: 30 active documents** (1 master plan + 15 canonical specs + 3 skills + 11 workplans) — completed workplans are in `_archive/` directories.

---

## Execution Phases

```
Phase 1: Database Foundations (all parallel — independent files, independent DBs)
    1a: Memory Schema    (memory.db)    <- specs/memory/workplans/01_SCHEMA.md
    1b: Events Schema    (events.db)    <- specs/nex/workplans/CUTOVER_03_EVENTS_DB.md
    1c: Identity Schema  (identity.db)  <- CUTOVER_04 + memory/02_IDENTITY.md (merged)

Phase 2: Types + Tools
    2a: NexusRequest Bus (request.ts)   <- CUTOVER_01
    2b: Writer Tools                    <- memory/03_WRITER_TOOLS.md (depends on 1a)
    2c: Adapter Protocol                <- CUTOVER_05 (depends on 2a)

Phase 3: Query + Pipeline
    3a: Recall Rewrite                  <- memory/04_RECALL.md (depends on 1a + 1b)
    3b: Pipeline Rewrite                <- CUTOVER_02 (depends on 2a)
    3c: Memory Pipeline                 <- memory/05_PIPELINE.md (depends on 1a + 2b + 3b)

Phase 4: Cleanup
    4a: Reply Module Deletion           <- CUTOVER_06 Part A
    4b: Automations Collapse            <- CUTOVER_06 Part B
    4c: Dead Import Sweep               <- CUTOVER_06 Part E
    4d: Tests                           <- memory/06_TESTS.md + nex tests
```

**Critical path:** 1a -> 2b -> 3c -> 4d (memory pipeline needs everything)

**Parallelization:** 1a, 1b, 1c all start immediately. 2a can start once types are designed (doesn't need DBs). See `IMPLEMENTATION_PLAN.md` for the full parallelization map and 20-rung validation ladder.

**Start here:** Phase 1 — all three DB schema rewrites can run in parallel.

---

## Locked Design Decisions

These are final. Applied to all specs. Not up for debate.

### Architecture

| Decision | Detail |
|----------|--------|
| **Pipeline stages** | `acceptRequest -> resolvePrincipals -> resolveAccess -> executeOperation -> finalizeRequest` (5 stages, down from 8) |
| **Automations** | Hookpoints at stage boundaries, NOT a separate pipeline stage |
| **Memory decoupled** | Zero memory code in pipeline.ts. Memory hooks fire via hookpoint system |
| **Episode timeout** | Internal runtime event. Timer handler invoked directly — no principals to resolve, no access to check |
| **Agent delivery** | Agent invokes ONE delivery tool. Adapter owns typing/chunking/streaming. No deliverResponse stage |
| **SessionQueue** | Lives INSIDE the broker, NOT at the pipeline level |

### Storage Model: Elements/Sets/Jobs

Everything in memory is one of three primitives:
- **Elements** — atomic knowledge units (facts, observations, mental models). Single `elements` table with `type` discriminator. Unified FTS via `elements_fts`.
- **Sets** — ordered collections (episodes, fact groups, consolidation inputs). `sets` table + `set_members` junction with polymorphic membership.
- **Jobs** — processing runs (retain, consolidate, reflect). `jobs` table with typed inputs/outputs.

### Episode Detection: Hybrid Inline + Cron Timer

During `event.ingest`, events are slotted into active episodes (sets) in real-time:
- Token budget exceeded -> clip immediately, fire `episode-created`
- Per-episode cron timer (90 min silence) -> fires `episode.timeout` -> clip episode
- Each new event resets that episode's timer
- Crash recovery: on startup, scan `pending_retain_triggers`, clip expired, reschedule active

### Hookpoints

| Hookpoint | Automation | When | Blocking |
|-----------|-----------|------|----------|
| `worker:pre_execution` | `memory-injection` | Before every agent execution | Yes |
| `episode-created` | `memory-writer` | Episode clips (token budget or silence timer) | No |
| `episode-retained` | `memory-consolidator` | After writer completes successfully | No |

### Data Model Decisions

| Decision | Detail |
|----------|--------|
| **Entity type** | `{ id, name, type, normalized, is_user, origin, persona_path, tags, merged_into, created_at, updated_at }`. No `mention_count`, `first_seen`, `last_seen`, or `metadata`. |
| **Content types** | `"text" \| "reaction" \| "membership"` only. Image/audio/video/file are attachment media types, NOT content types. |
| **entity_tags** | Lifecycle pattern: `(id, entity_id, tag, created_at, deleted_at)` with partial unique index `WHERE deleted_at IS NULL`. |
| **entity_cooccurrences** | **NUKED.** Co-occurrence derived at query time from `element_entities` joins. No denormalized table. |
| **Identifier policy** | No platform prefix. `(platform, space_id, contact_id)` compound unique. Universal identifiers use `phone`/`email` as platform. |
| **`origin` not `source`** | Both entities and contacts use `origin` ('adapter', 'writer', 'manual'). Renamed because `source` was overloaded. |
| **`contact_id` not `sender_id`** | Contacts table uses `contact_id` — neutral, resolves both senders and receivers. Events still use `sender_id`/`receiver_id`. |
| **`processing_log` not `is_retained`** | No boolean flag on events. `processing_log` table in memory.db tracks which elements/events have been processed by which job types. Short-term event retrieval uses an anti-join. |
| **Attachments PK** | Composite `(event_id, id)`. No SQL triggers — application code via `insertEventWithAttachments()`. |

---

## Key Schemas (Locked In)

### Contacts Table (identity.db)

```sql
CREATE TABLE contacts (
    id            TEXT PRIMARY KEY,
    entity_id     TEXT NOT NULL REFERENCES entities(id),
    platform      TEXT NOT NULL,
    space_id      TEXT NOT NULL DEFAULT '',
    contact_id    TEXT NOT NULL,
    contact_name  TEXT,
    avatar_url    TEXT,
    origin        TEXT NOT NULL,  -- 'adapter' | 'writer' | 'manual'
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER,
    metadata      TEXT,
    UNIQUE(platform, space_id, contact_id)
);
```

### Events Table (events.db)

```sql
CREATE TABLE events (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    content TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'text',
    attachments TEXT,                     -- JSON: Attachment[]
    recipients TEXT,                      -- JSON: RoutingParticipant[]
    timestamp INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    platform TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    space_id TEXT,
    container_kind TEXT NOT NULL DEFAULT 'direct',
    container_id TEXT NOT NULL,
    thread_id TEXT,
    reply_to_id TEXT,
    request_id TEXT,
    metadata TEXT,
    UNIQUE(platform, event_id)
);
```

### Attachments Table (events.db)

```sql
CREATE TABLE attachments (
    id TEXT NOT NULL,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    filename TEXT,
    mime_type TEXT,
    media_type TEXT,
    size INTEGER,
    url TEXT,
    local_path TEXT,
    content_hash TEXT,
    metadata_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (event_id, id)
);
```

### Memory Tables

Full DDL for all 14 memory.db tables is in `specs/memory/MEMORY_STORAGE_MODEL.md` (686 lines). Key tables: `elements`, `sets`, `jobs`, `set_members`, `element_links`, `element_entities`, `processing_log`, `elements_fts`.

---

## Database Allocation

| Database | Owned By | Key Tables |
|----------|----------|------------|
| **events.db** | nex | events, attachments, attachment_interpretations, events_fts |
| **identity.db** | nex (shared) | entities, entity_tags, merge_candidates, contacts, spaces, containers, threads |
| **memory.db** | memory | elements, element_entities, element_links, elements_fts, sets, set_members, jobs, job_outputs, processing_log, resolution_log, access_log |
| **embeddings.db** | memory | embeddings, vec_embeddings |
| **runtime.db** | nex | nexus_requests, pending_retain_triggers, adapter_instances, automations, hook_invocations, import_jobs, bus_events |
| **agents.db** | agents | sessions, turns, tool_calls |

---

## Codebase Files Touched

### Database Layer

| File | Database | Workplan |
|------|----------|---------|
| `src/db/memory.ts` | memory.db | Memory Phase 1 (01_SCHEMA) |
| `src/db/events.ts` | events.db | Nex CUTOVER_03 |
| `src/db/identity.ts` | identity.db | Memory Phase 2 (02_IDENTITY) + Nex CUTOVER_04 |

### Type Definitions

| File | Workplan |
|------|---------|
| `src/nex/request.ts` | Nex CUTOVER_01 |
| `src/nex/adapters/protocol.ts` | Nex CUTOVER_05 |

### Memory Code

| File | Workplan |
|------|---------|
| `src/agents/tools/memory-writer-tools.ts` | Memory Phase 3 (03_WRITER_TOOLS) |
| `src/memory/recall.ts` | Memory Phase 4 (04_RECALL) |
| `src/memory/retain-dispatch.ts` | Memory Phase 5 (05_PIPELINE) |
| `src/memory/retain-episodes.ts` | Memory Phase 5 (05_PIPELINE) |
| `src/nex/automations/meeseeks/memory-retain-episode.ts` | Memory Phase 5 (05_PIPELINE) |
| `src/nex/automations/meeseeks/memory-consolidate-episode.ts` | Memory Phase 5 (05_PIPELINE) |
| `src/nex/automations/meeseeks/memory-reader.ts` | Memory Phase 5 (05_PIPELINE) |

### Pipeline

| File | Workplan |
|------|---------|
| `src/nex/pipeline.ts` | Nex CUTOVER_02 |
| `src/nex/stages/*.ts` | Nex CUTOVER_02 |
| `src/nex/automations/hooks-runtime.ts` | Nex CUTOVER_06 |

### Deleted

| Target | Workplan |
|--------|---------|
| `src/reply/` (90+ files) | Nex CUTOVER_06 |

---

## Terminology

| Term | Meaning |
|------|---------|
| **Element** | Atomic knowledge unit in memory.db. Types: `fact`, `observation`, `mental_model` |
| **Set** | Ordered collection in memory.db. Episodes are sets with `definition_id = 'retain'` |
| **Job** | Processing run record. Types: `retain_v1`, `consolidate_v1`, `reflect_v1` |
| **Episode** | A retain set containing events as `set_members`. Clips on token budget or silence timer |
| **Meeseeks** | Short-lived agent forked from a parent session. Performs a task and terminates |
| **Hookpoint** | Named pipeline point where automations fire. Replaces the old plugin system |
| **Routing** | Where an event came from: platform, sender, receiver, container, thread |
| **EventPayload** | Event content: text, content_type, attachments, recipients, timestamp |
| **Entity** | Resolved identity in identity.db. Has contacts (platform bindings) linked to it |
| **Contact** | Platform-specific binding: `(platform, space_id, contact_id)` -> `entity_id` |
| **Adapter** | External platform connector (iMessage, Discord, email) that emits JSONL events |
| **Broker** | Internal agent execution engine. Manages sessions, model selection, tool dispatch |

---

## Not In Scope (Deferred)

- Review UI dashboard
- Vision recall strategies (temporal, link expansion, MPFP, cross-encoder)
- Mental model auto-refresh lifecycle
- CLI tool subcommands
- jobs/hook_invocations table consolidation
- Slash command architecture
- Rate limiting on AccessContext
- Adapter SDK update for new fields
- Relay/federation/MCP architecture

---

## Archives

All superseded documents are in archive directories. They are NOT sources of truth.

| Location | Contents |
|----------|----------|
| `specs/_archive/` | 23+ superseded top-level specs |
| `specs/nex/archive/` | Superseded nex specs and old workplans |
| `specs/memory/workplans/_archive/` | 14 old memory workplans (V2 tracks, V3, infrastructure) |

---

## Reading Order for New Sessions

1. **This file** (`CONTEXT.md`) — overview, decisions, document map
2. **`IMPLEMENTATION_PLAN.md`** — execution sequence, parallelization, validation ladder
3. **`specs/nex/NEXUS_REQUEST_TARGET.md`** — the core nex spec (pipeline, types, schemas)
4. **`specs/memory/MEMORY_SYSTEM.md`** — memory architecture overview
5. **`specs/memory/MEMORY_STORAGE_MODEL.md`** — the 14-table storage model
6. Then dive into specific workplans for whichever phase you're executing.

---

## Session History

This redesign was developed across 5 collaborative sessions:

- **Sessions 1-3:** Wrote 10 canonical memory specs. Developed Elements/Sets/Jobs unification model. Created MEMORY_STORAGE_MODEL.md. Performed code-vs-spec gap analysis.
- **Session 4:** Created memory workplans (6 files). Audited and updated 39 spec documents for consistency.
- **Session 5:** Cross-spec compatibility review between memory and nex workstreams. Locked in contacts schema. Designed episode detection mechanism. Updated 20+ spec/workplan files for alignment. Archived old workplans. Created unified IMPLEMENTATION_PLAN.md and this context document.
