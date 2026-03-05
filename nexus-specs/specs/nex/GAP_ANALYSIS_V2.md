# Gap Analysis V2 — Unification & Cleanup

**Status:** ACTIVE
**Created:** 2026-03-05
**Method:** 4-agent parallel audit of all completed workplans vs actual codebase state
**Supersedes:** GAP_ANALYSIS.md (v1 — which incorrectly claimed ~90%+ completion)

---

## Executive Summary

The 12 workplans (WP1–WP12) successfully built the **new API surface** — data schemas, CRUD handlers, operation taxonomy entries, and HTTP routes. However, they consistently skipped the **hard part**: migrating old execution systems to use the new tables and deleting the old code.

The result is that every old system still runs independently in parallel with a new system that nothing talks to. There are also mechanical renames and type replacements that were specified but never executed.

**Bottom line: The data/API layer is ~95% done. The execution/runtime layer is ~0% unified. Multiple legacy systems remain that should have been removed. 19 gaps total, organized into 4 waves + 1 deferred.**

---

## Gap Index

| # | Gap | Category | Effort | Dependencies |
|---|-----|----------|--------|--------------|
| G1 | Plugin & channels system removal | Legacy removal | High | G3 |
| G2 | Automations → job_definitions migration | Unification | High | G3 |
| G3 | Job execution engine | New runtime | High | None |
| G4 | CronService → work.db unification | Unification | Medium | G3 |
| G5 | Clock tick → cron schedule | Unification | Low | G4 |
| G6 | Memory jobs → work.db migration | Unification | Medium | G3 |
| G7 | `session_label` → `session_key` rename | Incomplete WP4 | Medium | None |
| G8 | `SenderContext`/`ReceiverContext` → Entity | Incomplete CUTOVER_06 | Medium | None |
| G9 | TTS/voicewake/device/node legacy removal | Incomplete WP12 | Medium | None |
| G10 | Dead hooks code removal (`src/hooks/`) | Legacy removal | Low | G1, G2 |
| G11 | Dead cron JSON store removal | Legacy removal | Low | G4 |
| G12 | `element_definitions` table | New feature | Low | None |
| G13 | Memory metadata filter | New feature | Low | None |
| G14 | Adapter SDK wiring (onEvent/list) | SDK gap | Medium | None |
| G15 | Memory link traversal API | API exposure | Low | None |
| G16 | DAG advancement engine | New runtime | High | G3 (deferred) |
| G17 | Session routing pipeline unification | Incomplete WP4 | Medium | G7, G8 |
| G18 | Agent config DB migration | Incomplete WP7 | Medium | None |
| G19 | Verify 6 missed operations | Verification | Low | None |

---

## Gap Details

### G1: Plugin & Channels System Removal

**Spec:** HOOK_SYSTEM_UNIFICATION.md — "All four systems collapse into the automations system (System 1)"
**Current state:** Two legacy subsystems that are not part of the canonical nex spec remain in the codebase:

1. **`src/plugins/`** — 29 source + 8 test files, 71 import sites. The old OpenClaw plugin system (registry, discovery, loading, hooks, tools, providers, services, CLI, config, slots).
2. **`src/channels/`** — 66 files. The old channel subsystem (WhatsApp, Signal, etc. plugin wiring, inbound routing, channel config, dock, allowlists). This is legacy code — channels are **adapters** in the nex spec, managed by the adapter manager.

Both systems are legacy holdovers that predate the nex architecture. Neither appears in any canonical spec.

**What needs to happen:**

1. **Delete `src/channels/` entirely** (66 files). Channels are adapters. The adapter manager (`src/nex/control-plane/adapter-manager.ts`, 1,971 lines) already exists and is the canonical system. Any surviving channel-specific logic that isn't already in an adapter needs to be ported to the adapter model or dropped.
2. **Delete `src/plugins/` entirely** (37 files). Nex apps replace plugins. The capabilities the plugin system provided map as follows:

| Capability | Replacement |
|------------|-------------|
| Plugin registry (global singleton) | **Delete.** Nex apps replace plugins. |
| Lifecycle hooks (18 hook points) | **Delete.** Hook points fire into the job system (G2/G3). |
| Tool registration | **Nex app manifests.** Apps declare tools in their manifest. |
| Channel registration | **Adapter system.** Channels are adapters. |
| Provider registration | **Config-driven.** Model provider auth is configuration. |
| HTTP route registration | **Nex app routes.** Apps register HTTP routes. |
| Plugin CLI (install/update/status) | **Delete entirely.** |
| Plugin services (start/stop) | **Delete.** Services become jobs or nex app lifecycle. |
| Plugin commands (slash commands) | **Delete.** Commands register directly. |
| Plugin config/slots/discovery | **Delete entirely.** |

3. **Delete `src/nex/plugins.ts` and `src/nex/plugins-loader.ts`** — the old NEXPlugin pipeline interface (System 3). Per HOOK_SYSTEM_UNIFICATION, pipeline stages directly emit hook points into the job system instead.
4. **Update ~71 import sites** across the codebase that reference `src/plugins/`. Most are pure deletions; a handful need rewiring to nex app or adapter equivalents.
5. **Update any files that reference `src/channels/`** — these need rewiring to the adapter system or deletion.

**What's clear:** Both systems are legacy, neither is in the specs, both get deleted. The adapter manager already exists as the replacement for channels. Nex apps already exist as the replacement for plugins.

---

### G2: Automations → job_definitions Migration

**Spec:** WORK_DOMAIN_UNIFICATION.md — "`automations` table (events.db) → `job_definitions` in work.db"
**Spec:** HOOK_SYSTEM_UNIFICATION.md — "All four systems collapse into the automations system"
**Current state:** `evaluateAutomationsAtHook()` reads from the `automations` table in events.db/nexus.db. The new `job_definitions` table in work.db has a `hook_points` column but nothing reads from it for hook evaluation.

**What needs to happen:**

1. The 5 bundled automations (memory-reader, memory-writer, memory-consolidator, command-logger, boot-md) become seeded `job_definitions` rows instead of `automations` rows.
2. `evaluateAutomationsAtHook()` reads from `job_definitions WHERE hook_points LIKE '%"episode:created"%'` instead of `automations WHERE hook_point = 'episode_created'`.
3. Hook invocations write to `job_runs` instead of `hook_invocations`.
4. The automation-specific fields (`blocking`, `workspace_dir`, `peer_workspaces`, `self_improvement`) go into `config_json` on `job_definitions`.
5. The `HookScriptContext` that automation scripts receive stays the same — it's the context the job runner builds, not a schema-level concern.
6. Old `automations` and `hook_invocations` tables are dropped from `db/hooks.ts`.

**What's clear:** Field mapping is 1:1. The jiti script loading pattern is identical. The `job_definitions.script_path` + `job_definitions.hook_points` columns already exist for exactly this purpose.

**Depends on:** G3 (job execution engine must exist to run the jobs).

**Files to modify:** `src/nex/automations/seeder.ts` (seed into work.db), `src/memory/retain-dispatch.ts` (call job runner instead of evaluateAutomationsAtHook), `src/nex/workspace-lifecycle/runtime-boot.ts` (seed job_definitions).
**Files to delete:** `src/nex/automations/hooks-runtime.ts` (1846 lines — replaced by job runner), `src/db/hooks.ts` (old schema).

---

### G3: Job Execution Engine

**Spec:** WORK_DOMAIN_UNIFICATION.md — Jobs domain defines `job_definitions` + `job_runs` with execution semantics.
**Current state:** `jobs.invoke` creates a `job_run` row with `status: "pending"`. Nothing picks it up. No runner exists.

**What needs to be built:**

A job runner that:
1. Accepts a `job_definition_id` (or a set of them from a hook point match)
2. Creates a `job_run` row with `status: "running"`
3. Loads the script via `jiti(job_definition.script_path)`
4. Builds a `JobExecutionContext` (equivalent to current `HookScriptContext` — services, workspace, LLM, memory, ledger, request context)
5. Calls the handler with timeout enforcement
6. Records result in `job_run` (status → completed/failed, output_json, error, duration_ms, metrics_json)
7. Handles circuit-breaker logic (consecutive failures → disable)
8. Script hash versioning: detect when `script_hash` changes, auto-create new version row with `previous_version_id` FK for immutable lineage (per WORK_DOMAIN_UNIFICATION spec)

**Architecture reference:** The existing `hooks-runtime.ts` `runSingleHook()` function (lines 1342-1844) does exactly this for automations. The job runner is essentially `runSingleHook()` operating on `job_definitions`/`job_runs` instead of `automations`/`hook_invocations`.

**Performance reference:** The user's `taskengine` (Go, ~/nexus/home/projects/taskengine/) demonstrates the high-performance patterns to consider: batch leasing, TxBatchWriter, worker pool, exponential retry. For the TypeScript implementation, the key patterns to port are: batch status updates via transactions, configurable concurrency, and graceful shutdown.

**What's clear:** The execution contract (load script, build context, call handler, record result). The existing `runSingleHook()` is the template.

**Depends on:** Nothing — this is the foundation everything else depends on.

---

### G4: CronService → work.db Unification

**Spec:** WORK_DOMAIN_UNIFICATION.md — "Cron service handles all time-based scheduling" via `cron_schedules` in work.db.
**Current state:** `CronService` (`src/cron/service.ts`) reads from `cron_jobs` table in nexus.db. The new `cron_schedules` table in work.db exists but nothing reads from it. The API operations `cron.create`/`cron.list` etc. write to work.db. Two completely disconnected cron systems.

**What needs to happen:**

1. `CronService` reads from `work.db/cron_schedules` instead of `nexus.db/cron_jobs`.
2. When a cron schedule fires, the CronService creates a `job_run` and invokes the job runner (G3).
3. The three existing execution modes (internal event, main session enqueue, isolated agent job) map to different `job_definition` types.
4. The old `cron_jobs` table in nexus.db is dropped.
5. Data migration: existing `cron_jobs` rows → `job_definitions` + `cron_schedules` rows in work.db.
6. Delete `server-work.ts` — the old 30s polling work scheduler (already stubbed as no-op but still referenced from `server.impl.ts`).

**What's clear:** The CronService's timer/scheduler logic stays intact — only the storage backend changes. The `cron_schedules` schema already has all needed fields (cron_expression, timezone, next_run_at, enabled, job_definition FK).

**Depends on:** G3 (so fired cron schedules can invoke jobs).

---

### G5: Clock Tick → Cron Schedule

**Spec:** WORK_DOMAIN_UNIFICATION.md — "Clock tick service (30s setInterval) → A cron schedule: `*/30 * * * * *`"
**Current state:** `server-clock.ts` runs a hardcoded `setInterval(30000)`.

**What needs to happen:** Delete `server-clock.ts`. Add a `cron_schedules` entry with `*/30 * * * * *` that fires a `job_definition` emitting the clock tick event.

**Effort:** Trivial once G4 is done.
**Depends on:** G4.

---

### G6: Memory Jobs → work.db Migration

**Spec:** WORK_DOMAIN_UNIFICATION.md — "`job_types` (memory.db) → `job_definitions`", "`jobs` (memory.db) → `job_runs`"
**Current state:** `memory.db` has `job_types`, `jobs`, `job_outputs`, `processing_log` tables. Seeded with retain_v1, consolidate_v1, reflect_v1, inject_v1. Used by the memory retain/consolidation pipeline.

**What needs to happen:**

1. The 4 memory job types become `job_definitions` in work.db (with `hook_points` pointing to the relevant memory hook points).
2. Memory pipeline code that creates `jobs` rows in memory.db creates `job_runs` in work.db instead.
3. `processing_log` tracking absorbed into `job_runs.metrics_json`.
4. Old tables dropped from `src/db/memory.ts` schema.

**What's clear:** Straightforward data migration. The job types map 1:1 to job_definitions. The jobs table maps 1:1 to job_runs.

**Depends on:** G3.

---

### G7: `session_label` → `session_key` Rename

**Spec:** SESSION_ROUTING_UNIFICATION.md (WP4 spec)
**Current state:** WP4 was marked complete but `session_label` was never renamed. 49 files still use `session_label` across sessions, memory, IAM, pipeline, automations, and server methods.

**What needs to happen:** Mechanical find-and-replace of `session_label` → `session_key` across all 49 files. DB column rename in session schema. No behavioral change.

**What's clear:** Pure mechanical rename. No questions.
**Depends on:** Nothing.

---

### G8: `SenderContext`/`ReceiverContext` → Entity Type

**Spec:** CUTOVER_06 Part E (Entity Language Alignment)
**Current state:** 21 files still use `SenderContext` and/or `ReceiverContext` instead of the canonical Entity type.

**What needs to happen:** Replace the old types with Entity throughout IAM, session, and memory code. Drop the old type definitions.

**What's clear:** Pure mechanical type replacement. No questions.
**Depends on:** Nothing.

---

### G9: TTS/Voicewake/Device/Node Legacy Removal

**Spec:** TTS_EXTRACTION.md (WP12 spec), ADAPTER_INTERFACE_UNIFICATION.md
**Current state:** Multiple legacy subsystems that should have been extracted or deleted remain:

1. **TTS/talk/voicewake** — 34 files. Supposed to be extracted to standalone package per TTS_EXTRACTION.md.
2. **Device/node control** — Per ADAPTER_INTERFACE_UNIFICATION, `node.*` is replaced by adapter-model device control. Legacy files remain:
   - `src/nex/control-plane/server-methods/device-host.ts` and `devices.ts`
   - `src/cli/nodes-cli/` (7 files: pairing, status, screen, notify, location, invoke, canvas, camera)
   - `src/cli/devices-cli.ts`
   - `src/agents/tools/nodes-tool.ts` and `nodes-utils.ts`
   - `src/infra/system-presence.ts`
   - `src/cli/system-cli.ts` (system-presence references)

**What needs to happen:** Delete all TTS, voicewake, device-host, nodes-cli, nodes-tool, and system-presence files. If TTS is still needed as a standalone package, extract first. Device control is handled by the adapter model.

**What's clear:** All these are legacy code not present in canonical specs. Delete.
**Depends on:** Nothing.

---

### G10: Dead Hooks Code Removal (`src/hooks/`)

**Current state:** `src/hooks/` contains a mix of dead and legacy code:
- `loader.ts` — @deprecated, only test imports
- `plugin-hooks.ts` — dead, `registerPluginHooksFromDir()` never imported
- `internal-hooks.ts` — mostly dead, old System 2
- `bundled/boot-md/` and `bundled/command-logger/` — duplicated by `src/nex/automations/bundled/` versions

**What needs to happen:** Delete dead files. The live parts (`hooks-status.ts`, `install.ts`, `types.ts`) need to be evaluated — some are used by the CLI and may stay.

**Depends on:** G1 and G2 (once plugins and automations are unified, the remaining hooks code is clearly dead).

---

### G11: Dead Cron JSON Store Removal

**Current state:** `src/cron/store.ts` contains `saveCronStore()` (dead — never called) and `loadCronStore()`/`migrateJsonToSqlite()` (legacy migration path).

**What needs to happen:** Delete `saveCronStore()`. Once all users have migrated past JSON→SQLite, delete `loadCronStore()` and `migrateJsonToSqlite()` too.

**Depends on:** G4 (CronService unification makes the old store code fully obsolete).

---

### G12: `element_definitions` Table

**Current state:** Element types are hardcoded as `ElementType = "fact" | "observation" | "mental_model"` in TypeScript. The DB column is `TEXT NOT NULL` (already extensible). No formal registry exists, unlike `job_types` and `set_definitions` which are seeded registry tables.

**What needs to happen:**

1. Add `element_definitions` table to `memory.db` schema (mirrors `set_definitions` pattern).
2. Seed with `fact`, `observation`, `mental_model`.
3. Add CRUD operations: `memory.elements.definitions.list`, `.get`, `.create`.
4. Widen `ElementType` from union to `string` (or validate against registry).
5. Existing retain/consolidate/recall agents are unaffected — they create elements with known types that are now registered in the definitions table.

**What's clear:** Follows the existing `set_definitions`/`job_types` pattern exactly. No behavioral change for existing agents.
**Depends on:** Nothing.

---

### G13: Memory Metadata Filter

**Current state:** `memory.elements.list` filters by `type` and `entityId` only. Memory sets already use `json_extract()` for metadata filtering.

**What needs to happen:** Add `metadata_filter` parameter to `memory.elements.list` handler. Copy `json_extract()` pattern from sets.

**What's clear:** Pattern exists, copy it. Trivial.
**Depends on:** Nothing.

---

### G14: Adapter SDK Wiring (onEvent/list)

**Current state:** The nex app SDK context has stubs for `ctx.nex.adapters.onEvent()` and `ctx.nex.adapters.list()`. The adapter manager is fully implemented (1,971 lines) but not wired to the SDK context.

**What needs to happen:** Wire the SDK context stubs to the adapter manager. Quick plumbing to unblock GlowBot before a deeper SDK review pass.

**What's clear:** The adapter manager exists, the SDK stubs exist, this is just connecting them.
**Depends on:** Nothing.

---

### G15: Memory Link Traversal API

**Current state:** `runMpfpTraversal()` in `src/memory/recall/graph.ts` implements full graph traversal (Meta-Path Feature Propagation across semantic/entity/temporal/causal edges). `runLinkExpansion()` in `src/memory/recall/link_expansion.ts` provides link-based expansion. Both are used by the recall engine. Neither is exposed as a standalone API operation.

**What needs to happen:** Add `memory.elements.links.traverse` operation that wraps `runMpfpTraversal()` / `runLinkExpansion()` with appropriate parameters (start element, depth, edge types, etc.).

**What's clear:** Functionality exists. This is a thin API wrapper.
**Depends on:** Nothing.

---

### G16: DAG Advancement Engine (DEFERRED)

**Current state:** `dag_definitions`, `dag_nodes`, `dag_runs` tables exist in work.db with full CRUD. No orchestrator exists to advance nodes when predecessor jobs complete.

**What needs to happen:** Spec work first. The engine needs to:
1. Monitor `job_runs` completion for jobs that are part of a DAG
2. Evaluate which dag_nodes have all predecessors complete
3. Create new `job_runs` for ready nodes
4. Update `dag_runs` status as the DAG progresses

**Status:** DEFERRED until all other gaps are cleaned up. Needs careful spec work before implementation.

---

### G17: Session Routing Pipeline Unification

**Spec:** SESSION_ROUTING_UNIFICATION.md
**Current state:** G7 covers the `session_label` → `session_key` rename and G8 covers the `SenderContext`/`ReceiverContext` → Entity replacement, but the spec has 6 additional requirements that were never implemented:

1. **`SessionRouting` type** — A new interface on `NexusRequest` with `session_key`, `persona_ref`, `queue_mode`, `source`. Does not exist.
2. **Resolution pipeline** — Three-priority resolution (explicit > policy template > canonical, then automation override). Currently disjointed across multiple systems.
3. **`buildSessionKey()` Entity overload** — Needs an overload accepting `Entity` instead of `SenderContext`/`DeliveryContext`/`ReceiverContext`.
4. **`request.agent.session_key` derivation** — Should be derived from `request.session_routing.session_key` instead of set ad-hoc in multiple places.
5. **Bootstrap policy DM template fixes** — Remove `dm:{sender.id}`, use canonical default in `src/iam/policies.ts`.
6. **Routing discard fix** — `resolveAccessStage` currently strips routing information instead of preserving it.

**What needs to happen:** Create the `SessionRouting` type, add it to `NexusRequest`, implement the resolution pipeline, fix the routing discard, fix bootstrap policy templates, make `request.agent.session_key` derived.

**Depends on:** G7, G8 (mechanical renames first, then structural changes).

---

### G18: Agent Config DB Migration

**Spec:** WORK_DOMAIN_UNIFICATION.md — "`agent_configs` table replaces hardcoded `role-caps.ts`"
**Current state:** The `agent_configs` table exists in `work.db` with full CRUD (5 API operations: `agents.configs.list/get/create/update/delete`). However, `src/iam/role-caps.ts` still exists and hardcodes `MANAGER_MWP_TOOL_ALLOWLIST`, `WORKER_ROLE_TOOL_DENYLIST`, and other agent capability constants. The broker reads from `role-caps.ts`, not from the DB.

**What needs to happen:**

1. Seed `agent_configs` table with named presets from `role-caps.ts` values (deep_researcher, fast_worker, manager_v2, etc.).
2. Add `agent_config_id` FK on agent turns table so each execution is linked to its config.
3. Update the broker to look up configs from the DB instead of importing from `role-caps.ts`.
4. Delete `src/iam/role-caps.ts`.

**What's clear:** The schema and CRUD already exist. This is wiring the broker to read from DB instead of hardcoded file.
**Depends on:** Nothing.

---

### G19: Verify 6 Missed Operations from RESOLVED_DECISIONS

**Spec:** RESOLVED_DECISIONS.md (Decision 6 corrections)
**Current state:** The v1 gap analysis identified 6 operations that were missed from the original taxonomy and added as corrections. It's unverified whether they were actually implemented:

1. `agents.sessions.resolve`
2. `agents.sessions.preview`
3. `agents.sessions.history`
4. `agents.sessions.import.chunk`
5. `events.backfill`
6. `adapters.connections.upload`

**What needs to happen:** Verify each operation exists in the taxonomy, has a handler, and has an HTTP route (if applicable). Implement any that are missing.

**What's clear:** Quick verification pass — either they exist or they don't.
**Depends on:** Nothing.

---

## Execution Order

### Wave 1: Foundations (no dependencies, can parallelize)
- **G7** `session_label` → `session_key` (mechanical, 49 files)
- **G8** `SenderContext`/`ReceiverContext` → Entity (mechanical, 21 files)
- **G9** TTS/voicewake/device/node legacy removal (50+ files)
- **G12** `element_definitions` table (new table, follows existing pattern)
- **G13** Memory metadata filter (copy existing pattern)
- **G14** Adapter SDK wiring (connect stubs to adapter manager)
- **G15** Memory link traversal API (thin wrapper)
- **G18** Agent config DB migration (seed from role-caps.ts, wire broker)
- **G19** Verify 6 missed operations (quick audit)

### Wave 2: Session Routing + Job Engine
- **G17** Session routing pipeline unification (depends on G7, G8)
- **G3** Build job execution engine (the critical foundation)

### Wave 3: System Unification (depends on G3)
- **G2** Automations → job_definitions migration
- **G4** CronService → work.db unification
- **G6** Memory jobs → work.db migration

### Wave 4: Legacy Removal (depends on Wave 3)
- **G1** Plugin & channels system removal (biggest lift, depends on G2 for hook migration)
- **G5** Clock tick → cron schedule (depends on G4)
- **G10** Dead hooks code removal (depends on G1, G2)
- **G11** Dead cron JSON store removal (depends on G4)

### Deferred
- **G16** DAG advancement engine (needs spec work, all other gaps first)

---

## Corrected Status of Previous Workplans

The v1 GAP_ANALYSIS claimed ~90% completion. The corrected assessment:

| Workplan | Claimed | Actual | What Was Missed |
|----------|---------|--------|-----------------|
| WP1 Identity DB Overhaul | ✅ Complete | ✅ Complete | — |
| WP2 Credential System | ✅ Complete | ✅ Complete | — |
| WP3 Auth Unification | ✅ Complete | ✅ Complete | — |
| WP4 Session Routing | ✅ Complete | ⚠️ Partial | `session_label` → `session_key` rename never executed (49 files). `SessionRouting` type, resolution pipeline, routing discard fix — all missing. |
| WP5 Workspace Primitive | ✅ Complete | ✅ Complete | — |
| WP6 Hook System Collapse | ✅ Complete | ❌ Not Done | All 4 legacy hook systems still intact. Plugin system (29 files), internal hooks, NEXPlugin interface — none removed. |
| WP7 Work Domain Unification | ✅ Complete | ⚠️ Partial | Data layer done (7 tables, 30 ops). Execution layer not done — no job runner, CronService not wired to work.db, automations not migrated, clock tick not replaced. `agent_configs` not seeded from `role-caps.ts`, broker not wired. |
| WP8 Memory API Exposure | ✅ Complete | ✅ Complete | — |
| WP9 Agents/Sessions API | ✅ Complete | ✅ Complete | — |
| WP10 Adapters/Channels/Delivery | ✅ Complete | ✅ Complete | — |
| WP11 Apps/Skills/Models/Runtime | ✅ Complete | ✅ Complete | — |
| WP12 Drops & Extractions | ✅ Complete | ⚠️ Partial | TTS/voicewake (34 files) never extracted/deleted. Device/node legacy (15+ files), system-presence, device server methods all remain. |
| CUTOVER_06 Part E | ✅ Complete | ❌ Not Done | `SenderContext`/`ReceiverContext` → Entity replacement never executed (21 files) |

**Corrected bottom line: 7 of 13 items fully complete. 4 partially complete. 2 not done.**
