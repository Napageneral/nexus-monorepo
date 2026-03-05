# Nex API Gap Analysis — Code vs Spec

**Generated:** 2026-03-04
**Method:** Systematic 8-agent parallel code walkthrough of full nex source tree
**Source:** `~/nexus/home/projects/nexus/nex/src/` (~196 target operations across 22 domains)

---

## Executive Summary

| Category | Ops | EXISTS | PARTIAL | MISSING |
|----------|-----|--------|---------|---------|
| Events, PubSub, Chat (B1) | 11 | 4 | 1 | 6 |
| Sessions, Turns, Messages, Queue (B1) | 17 | 2 | 3 | 12 |
| Identity (Entities–ACL) (B2) | 64 | 18 | 12 | 34 |
| Memory (B3) | 20 | 0* | 10 | 10 |
| Agents, Workspaces, Config (B4+B6) | 22 | 4 | 7 | 11 |
| Jobs, Cron, DAGs (B6) | 24 | 0† | 8 | 16 |
| Adapters, Channels, Skills, Models, Apps, Runtime (B5) | 43 | 11 | 12 | 20 |
| Browser, TTS, Wizard (B6) | 5+7‡ | 5 | 0 | 0 |
| **TOTALS** | **~206** | **~44** | **~53** | **~109** |

\* Memory ops exist as agent tools/internal functions but have 0 control-plane endpoints
† Jobs ops are NEW domain; cron has 8 existing ops to rename
‡ Browser(1)+Wizard(4) compliant, TTS(7) being extracted (removed from count)

**Bottom line: ~21% complete, ~26% partial, ~53% missing.**

---

## Domain-by-Domain Findings

### 1. Events, PubSub, Chat (Batch 1)

| Operation | Status | Notes |
|-----------|--------|-------|
| `events.ingest` | ✅ EXISTS | via `event.ingest` in agent.ts. Schema mismatch: `sender_id`→`author_entity_id`, `content`→`payload`, missing `type`/`subtype` |
| `events.list` | ❌ MISSING | DB function `listRecentEvents()` exists, no API endpoint |
| `events.get` | ❌ MISSING | DB function `getEventById()` exists, no API endpoint |
| `events.search` | ❌ MISSING | FTS infrastructure exists (`events_fts`), no search function or endpoint |
| `events.stream` | ✅ EXISTS | SSE endpoint at `GET /api/events/stream`. Streams bus events (observability), not stored events |
| `pubsub.subscribe` | ❌ MISSING | `InMemoryEventBus.subscribe()` exists but not exposed as operation |
| `pubsub.publish` | ❌ MISSING | `InMemoryEventBus.publish()` exists, internal only |
| `pubsub.unsubscribe` | ❌ MISSING | Unsubscribe callback exists, not exposed |
| `chat.send` | ⚠️ PARTIAL | Implemented as `event.ingest(sync=true)`, no dedicated `chat.send` operation |
| `chat.history` | ✅ EXISTS | Fully implemented, matches spec |
| `chat.abort` | ✅ EXISTS | Fully implemented, matches spec |
| `events.backfill` | ⚠️ PARTIAL | Backfill infrastructure exists (adapter SDK `event.backfill`), no dedicated Nex API operation |

**Orphaned:** `chat.inject` (assistant injection — folded into `chat.send` with `role: "assistant"`), `send` (direct platform delivery — becomes `channels.send`)
**Schema gaps:** events.db uses `sender_id/receiver_id/content/container_id` vs spec's `author_entity_id/payload/channel_id/type/subtype`
**Naming:** `event.ingest` → `events.ingest` (plural per resolved decision)

---

### 2. Sessions, Turns, Messages, Queue (Batch 1)

| Operation | Status | Notes |
|-----------|--------|-------|
| `agents.sessions.list` | ✅ EXISTS | Named `sessions.list` (namespace mismatch), missing `type` filter |
| `agents.sessions.get` | ❌ MISSING | No dedicated endpoint. `resolveSessionRecord()` exists internally |
| `agents.sessions.resolve` | ⚠️ PARTIAL | `resolveSessionRecord()` + `sessions.resolve` exist internally, namespace mismatch |
| `agents.sessions.create` | ❌ MISSING | Sessions created implicitly via messaging |
| `agents.sessions.fork` | ❌ MISSING | No fork capability. Needs `type` column on sessions table |
| `agents.sessions.archive` | ⚠️ PARTIAL | `archiveSession()` + soft-delete exist, different semantics from spec |
| `agents.sessions.transfer` | ❌ MISSING | Persona rebinding exists but not session transfer |
| `agents.sessions.import` | ✅ EXISTS | Works, only supports `source='aix'` |
| `agents.sessions.import.chunk` | ❌ MISSING | No chunked upload for large imports |
| `agents.sessions.history` | ⚠️ PARTIAL | `session_history` table exists, no API endpoint |
| `agents.sessions.preview` | ❌ MISSING | `sessions.preview` exists as orphan but not exposed |
| `agents.turns.list` | ❌ MISSING | Turns table populated, no API |
| `agents.turns.get` | ❌ MISSING | No endpoint |
| `agents.messages.list` | ❌ MISSING | `chat.history` returns messages but different format |
| `agents.messages.get` | ❌ MISSING | No endpoint |
| `agents.sessions.queue.list` | ❌ MISSING | `queue_items` table + `listQueueItems()` exist, no RPC |
| `agents.sessions.queue.cancel` | ❌ MISSING | `clearSessionQueues()` exists, no RPC |

**Schema gaps:** sessions table needs `type` column (main/isolated/forked), `forked_from_session_id`, `forked_at_turn_id`, `workspace_id` (replaces persona_id). Turns need `agent_config_id` (B6), `workspace_path`→`working_dir` rename.
**Note:** `sessions.update`/`sessions.patch` is REMOVED per spec (sessions are immutable). `sessions.delete` becomes `sessions.archive`. `sessions.reset`, `sessions.compact`, `sessions.usage` are dropped.

---

### 3. Identity — Entities, Contacts, Groups, Auth, Credentials, ACL (Batch 2)

**Entities (14 ops):** 3 EXISTS, 4 PARTIAL, 7 MISSING
- Tags (list/add/remove) and resolve work. Full CRUD missing. Merge workflow missing.
- Entity creation exists as `createDeliveryEntity()` (delivery-specific, not general)

**Contacts (7 ops):** 1 EXISTS, 3 PARTIAL, 3 MISSING
- `upsertContact()` works. List, search, history missing.
- Strong identifier classification system exists (`classifyAndNormalize`, E.164 normalization)

**Groups (8 ops):** 0 EXISTS, 0 PARTIAL, **8 MISSING** ⚠️ BLOCKING
- **No database tables.** No `groups` or `group_members` tables exist.
- Blocks ACL policy matching on `sender.groups[]`

**Auth (6 ops):** 4 EXISTS, 2 PARTIAL, 0 MISSING
- Token CRUD fully works. Password auth works. Login endpoint needs exposure.
- **`audience` field needs removal** per AUDIENCE_REMOVAL_CUTOVER.md workplan

**Credentials (9 ops):** 0 EXISTS, 1 PARTIAL, **8 MISSING**
- **File-based storage** (`~/nexus/state/credentials/index.json`). Spec requires DB migration.
- CLI credential readers exist for Claude/Codex/Qwen/MiniMax but no unified store.

**ACL (20 ops):** 10 EXISTS, 2 PARTIAL, 8 MISSING
- Grants (4/4) and Requests (5/5) fully work.
- **Policies are static** (YAML/bootstrap). Spec requires dynamic CRUD with DB storage. 0 of 7 policy ops exist.
- Audit log works, query/export missing.

---

### 4. Memory (Batch 3)

| Operation | Status | Notes |
|-----------|--------|-------|
| `memory.elements.query` | ⚠️ PARTIAL | Schema + indexes exist, no API |
| `memory.elements.get` | ⚠️ PARTIAL | Used internally, no API |
| `memory.elements.create` | ⚠️ PARTIAL | `insert_fact` agent tool only, needs unified type-discriminated endpoint |
| `memory.elements.head` | ⚠️ PARTIAL | `resolve_element_head` agent tool only |
| `memory.elements.history` | ❌ MISSING | No implementation |
| `memory.elements.entities.list` | ⚠️ PARTIAL | Schema exists, no API |
| `memory.elements.entities.link` | ⚠️ PARTIAL | `link_element_entity` agent tool only |
| `memory.elements.entities.unlink` | ❌ MISSING | No implementation |
| `memory.elements.links.list` | ⚠️ PARTIAL | Schema exists, no API |
| `memory.elements.links.create` | ⚠️ PARTIAL | `insert_element_link` agent tool only |
| `memory.elements.links.traverse` | ⚠️ PARTIAL | MPFP traversal + link expansion exist internally |
| `memory.recall` | ⚠️ PARTIAL | **Production-grade** 945-line recall engine. Not exposed as API. |
| `memory.sets.list` | ❌ MISSING | Schema exists, no API |
| `memory.sets.get` | ❌ MISSING | No API |
| `memory.sets.create` | ⚠️ PARTIAL | Hardcoded for `retain` definition only |
| `memory.sets.members.list` | ❌ MISSING | Schema exists, no API |
| `memory.sets.members.add` | ⚠️ PARTIAL | Internal retain pipeline only |
| `memory.entities.create` | ⚠️ PARTIAL | `create_entity` agent tool (recall-first pattern works) |
| `memory.entities.confirm` | ⚠️ PARTIAL | `confirm_entity` agent tool works |
| `memory.consolidate` | ⚠️ PARTIAL | `consolidate_facts` agent tool works (3 patterns) |

**Key insight:** Memory domain is the most mature internally — schema is excellent, recall engine is production-grade, agent tools work. The gap is purely **API exposure**. Most operations need wrapping as control-plane endpoints.

**Existing admin layer:** 11 `memory.review.*` operations exist for debugging (not in spec, keep separate)

---

### 5. Agents, Workspaces, Agent Configs (Batch 4 + 6)

**Agents CRUD (7 ops):** 4 EXISTS, 2 PARTIAL, 1 MISSING
- list, delete, identity.get, wait all work
- `agents.get` missing (no dedicated endpoint)
- create/update partial (no workspace_id binding)

**Workspaces (10 ops):** 0 EXISTS, 3 PARTIAL, **7 MISSING**
- **No `workspaces` table** in database. Workspaces are just directories.
- **No manifest concept.** Spec requires manifest_json for context injection control.
- File operations exist via `agents.files.*` but agent-scoped, not workspace-scoped.

**Agent Configs (5 ops):** 0 EXISTS, 0 PARTIAL, **5 MISSING**
- **No `agent_configs` table.** Config is file-based (`.nex/config.json5`).
- **role-caps.ts has hardcoded** `MANAGER_MWP_TOOL_ALLOWLIST` and `WORKER_ROLE_TOOL_DENYLIST`. These become database configs.
- Turns have `effective_config_json` column but no `agent_config_id` FK.

---

### 6. Jobs, Cron, DAGs — Unified Work Domain (Batch 6)

**This is the most complex migration.** Four separate systems being unified:

**Current Systems:**
| System | Tables | Exposed Ops | Internal Only |
|--------|--------|------------|---------------|
| Automations | `automations`, `hook_invocations` | 0 | ✓ (hooks-runtime.ts) |
| Work CRM | `tasks`, `work_items`, `workflows`, `workflow_steps`, `sequences`, `work_item_events` | 18 | — |
| Cron | `cron_jobs` | 8 (as `clock.schedule.*`) | — |
| Memory Jobs | `jobs`, `job_types`, `job_outputs`, `processing_log` | 0 | ✓ (pipeline internal) |

**Target: 24 new operations across 3 domains**

| Domain | Target Ops | Current Equivalent |
|--------|-----------|-------------------|
| `jobs.*` (8) | None exposed. Automations have DB functions only. |
| `cron.*` (6) | `clock.schedule.*` (8 ops) — rename + simplify |
| `dags.*` (10) | `work.workflows.*` + `work.sequences.*` — refactor |

**Schema mapping quality:**
- `automations` → `job_definitions`: **EXCELLENT** match (base schema)
- `hook_invocations` → `job_runs`: **GOOD** match (needs new FKs: cron_schedule_id, dag_run_id)
- `cron_jobs` → `cron_schedules`: **MODERATE** (3 schedule kinds→1, self-contained→triggers-job)
- `workflows` → `dag_definitions`: **GOOD** match
- `workflow_steps` → `dag_nodes`: **EXCELLENT** match (override_* → overrides_json)
- `sequences` → `dag_runs`: **GOOD** match
- `work_items` → `job_runs`: **POOR** (conceptual mismatch — work items are CRM tasks, not execution logs)

**Key orphaned features from current code:**
- Circuit breaker state (automations)
- Assignee/priority/due dates (work CRM)
- Delivery targets (cron)
- Processing logs / idempotency (memory)
- 3 schedule kinds: `at`, `every`, `cron` (cron — spec only keeps cron expressions)
- File-based run history (cron — spec puts runs in job_runs table)

---

### 7. Adapters, Channels, Skills, Models, Apps, Runtime (Batch 5)

**Adapter Connections (13 ops):** 7 EXISTS, 1 PARTIAL, 5 MISSING
- OAuth, API key, status, test all work. Naming: `adapter.` → `adapters.` (plural)
- Missing: get, create, update, delete, enable, disable

**Channels Data (6 ops):** 0 EXISTS, 0 PARTIAL, **6 MISSING**
- Only `channels.status` and `channels.logout` exist (not in spec)
- Channels are currently static plugins, spec wants first-class data entities

**Channels Delivery (7 ops):** 0 EXISTS, 5 PARTIAL, 2 MISSING
- `delivery.*` adapter operations exist but not exposed as `channels.*`
- `channels.read` and `channels.typing` fully missing

**Skills (3 ops):** 0 EXISTS, 0 PARTIAL, **3 MISSING**
- Current has `skills.status/install/update` (not in spec)
- Spec wants `skills.list/use/search`

**Models (2 ops):** 1 EXISTS, 0 PARTIAL, 1 MISSING
- `models.list` works. `models.get` missing.

**Apps (9 ops):** 0 EXISTS as WS ops, 2 PARTIAL, 4 MISSING
- App management exists as **HTTP-only** (not WebSocket control-plane methods)
- Missing: get, enable, disable, standalone start/stop

**Runtime (3 ops):** 3 EXISTS
- `health`, `status`, `tools.invoke` all work. Need namespace rename to `runtime.*`

---

### 8. Browser, TTS, Wizard (Batch 6)

| Domain | Status | Action |
|--------|--------|--------|
| Browser (1 op) | ✅ COMPLIANT | 42 internal HTTP routes stay. `browser.request` proxy works. |
| TTS (7→0 ops) | ❌ NEEDS EXTRACTION | 7 ops to remove from taxonomy. Extract to npm package. 3 providers (Edge/OpenAI/ElevenLabs) preserved. |
| Wizard (4 ops) | ✅ COMPLIANT | start/next/cancel/status all work. Content redesign deferred. |

---

## Critical Blockers

| Blocker | Domain | Impact |
|---------|--------|--------|
| **No `groups` tables** | Identity (B2) | Blocks ACL policy matching on group membership |
| **No `workspaces` table** | Workspaces (B4) | Blocks workspace-as-entity, manifest system, persona elimination |
| **No `agent_configs` table** | Agent Configs (B6) | Blocks database-backed config presets, A/B testing, turn attribution |
| **File-based credentials** | Credentials (B2) | Blocks unified outbound secret management |
| **Static policies** | ACL (B2) | Blocks dynamic policy CRUD, runtime policy management |
| **4 separate job systems** | Jobs/Cron/DAGs (B6) | Most complex migration — automations, work, cron, memory all need unification |

---

## New Database Tables Required

| Table | Database | Spec Source |
|-------|----------|-------------|
| `workspaces` | nexus.db | Batch 4 |
| `agent_configs` | agents.db or nexus.db | Batch 6 |
| `groups` | identity.db | Batch 2 |
| `group_members` | identity.db | Batch 2 |
| `policies` | identity.db | Batch 2 |
| `job_definitions` | nexus.db (unified) | Batch 6 |
| `cron_schedules` | nexus.db (unified) | Batch 6 |
| `job_runs` | nexus.db (unified) | Batch 6 |
| `dag_definitions` | nexus.db (unified) | Batch 6 |
| `dag_nodes` | nexus.db (unified) | Batch 6 |
| `dag_runs` | nexus.db (unified) | Batch 6 |

---

## Schema Modifications Required

| Table | Change | Spec Source |
|-------|--------|-------------|
| `sessions` | Add `type` column (main/isolated/forked) | B1 |
| `sessions` | Add `forked_from_session_id`, `forked_at_turn_id` | B1 |
| `turns` | Add `agent_config_id` FK | B6 |
| `turns` | Rename `workspace_path` → `working_dir` | B4 |
| `events` | Rename/add: `author_entity_id`, `payload`, `type`, `subtype`, `channel_id` | B1 |

---

## Top Patterns Observed

1. **"DB exists, no API"** — Most common pattern. Database functions exist but aren't exposed as control-plane operations. Applies to: events, sessions, turns, messages, queue, memory, automations.

2. **"Agent tool, no runtime API"** — Memory domain has 12 agent tools that implement spec operations but aren't exposed to non-agent callers.

3. **"HTTP-only, no WS"** — Apps domain has full HTTP management but no WebSocket control-plane methods.

4. **"Namespace mismatch"** — Many operations exist but under different names: `sessions.*` → `agents.sessions.*`, `adapter.*` → `adapters.*`, `clock.schedule.*` → `cron.*`, `health` → `runtime.health`.

5. **"Static config, needs DB"** — Policies (YAML), credentials (JSON file), agent configs (.nex.yaml), role-caps (hardcoded TS) all need migration to database-backed storage.

---

## Key Source Files Reference

| Purpose | Path |
|---------|------|
| Runtime operations taxonomy | `src/nex/control-plane/runtime-operations.ts` |
| Server method handlers | `src/nex/control-plane/server-methods/*.ts` |
| Protocol schemas | `src/nex/control-plane/protocol/schema/*.ts` |
| Database schemas | `src/db/*.ts` (events, agents, identity, memory, hooks, work, nexus, embeddings) |
| IAM core | `src/iam/*.ts` (identity, grants, policies, audit, password-auth, role-caps) |
| Memory subsystem | `src/memory/*.ts` (recall, retain, embeddings, graph) |
| Agent tools | `src/agents/tools/*.ts` (memory-writer-tools, etc.) |
| Automations runtime | `src/nex/automations/*.ts` (hooks-runtime, seeder, meeseeks/) |
| Cron service | `src/cron/*.ts` (service, store, schedule, delivery, run-log) |
| Browser | `src/browser/*.ts` (server, routes/, 42 HTTP routes) |
| TTS | `src/tts/tts.ts` (1500+ lines, 3 providers) |
| Apps | `src/apps/*.ts` (management-api, service-manager, manifest) |
| Config | `src/config/*.ts` (schema, types, io, validation) |
