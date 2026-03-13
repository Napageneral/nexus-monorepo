# Strict Gap Tracker

**Status:** REFERENCE — historical branch gap tracker  
**Created:** 2026-03-05  
**Updated:** 2026-03-08  
**Source analysis:** [GAP_ANALYSIS_V2.md](./GAP_ANALYSIS_V2.md)  
**Canonical specs:** [SESSION_ROUTING_UNIFICATION.md](./SESSION_ROUTING_UNIFICATION.md) · [WORK_DOMAIN_UNIFICATION.md](./WORK_DOMAIN_UNIFICATION.md) · [HOOK_SYSTEM_UNIFICATION.md](./HOOK_SYSTEM_UNIFICATION.md) · [CUTOVER_INDEX.md](./workplans/CUTOVER_INDEX.md)

---

## Purpose

This document is the **strict execution tracker** for the 19 gaps identified in `GAP_ANALYSIS_V2.md`.

It does **not** replace the reasoning in the original gap analysis. It preserves a branch-time execution snapshot from March 2026.

The tracker is based on the live repository state on **March 5, 2026**.

Use the active `nex` specs and active `nex/workplans` for current canonical direction.

---

## Status Rules

### Status values

- `COMPLETE` — canonical behavior is live, the legacy path is removed or inert, and the gap no longer blocks cutover
- `PARTIAL` — meaningful implementation exists, but the canonical cutover is not finished
- `REMAINING` — little or no meaningful cutover work has landed yet
- `DEFERRED` — intentionally postponed by spec

### Completion rule

A gap may be marked `COMPLETE` only when all of the following are true:

1. The canonical path is authoritative.
2. Legacy parallel behavior is removed or no longer used.
3. Naming/type/schema alignment required by the spec is finished for that gap.
4. The touched path has validation coverage appropriate to the change.

---

## Summary

| Gap | Status | Short reason |
|---|---|---|
| G1 | PARTIAL | The session/import validation slice is repaired, but many `src/channels/*` / `src/plugins/*` import sites and `src/nex/plugins*.ts` still remain |
| G2 | PARTIAL | Bundled automations seed `job_definitions` and mirror `job_runs`, but hooks runtime + hooks DB are still authoritative |
| G3 | PARTIAL | A real work scheduler / job runner exists and is wired, but the full spec-level runtime contract is not finished |
| G4 | PARTIAL | `cron_schedules` exists and `server-work` evaluates it, but CronService still runs on `cron_jobs` |
| G5 | PARTIAL | `server-clock.ts` is gone, but clock ticks still come from an interval timer, not a `cron_schedules` row |
| G6 | PARTIAL | Memory jobs mirror into `job_runs`, but memory.db remains the source of truth |
| G7 | COMPLETE | Repo-wide `session_label` / `sessionLabel` hits in `src/` + `test/` are gone and the affected session/import validation slice passes |
| G8 | COMPLETE | Exact `SenderContext` / `ReceiverContext` type hits are gone from the live source tree |
| G9 | PARTIAL | Old node/device/system-presence surfaces remain even though TTS/voicewake appears largely gone |
| G10 | REMAINING | `src/hooks/` still contains legacy and duplicated hook code |
| G11 | COMPLETE | The old JSON cron-store migration helpers described by the gap doc are gone |
| G12 | COMPLETE | `element_definitions` table + CRUD exist |
| G13 | COMPLETE | Metadata filtering for `memory.elements.list` exists |
| G14 | PARTIAL | Wired adapter SDK implementation exists, but app contexts still default to stubs |
| G15 | COMPLETE | `memory.elements.links.traverse` exists |
| G16 | DEFERRED | Still deferred by design |
| G17 | PARTIAL | The core session-routing pipeline is implemented, but downstream cleanup and repo-wide normalization are unfinished |
| G18 | PARTIAL | `agent_configs` exists and is seeded, but broker/runtime still reads `role-caps.ts` |
| G19 | COMPLETE | All 6 previously-missed operations exist in taxonomy + handlers |

---

## Gap Tracker

## G1 — Plugin & Channels System Removal

**Status:** `PARTIAL`

**Evidence**
- The worktree is deleting most of `src/channels/` and `src/plugins/`.
- `src/nex/plugins.ts` and `src/nex/plugins-loader.ts` still exist.
- `test/setup.ts` is now hard-cut off the deleted plugin runtime and the targeted Vitest slice (`src/nex/import/service.test.ts`, `src/nex/session.test.ts`, `src/db/agents.queue-items.test.ts`) passes again.
- `src/config/validation.ts` is now hard-cut off deleted channel/plugin registries for the current config/import path.
- `src/utils/message-channel.ts` is now hard-cut off deleted channel/plugin registries and uses local canonical runtime-channel definitions; `src/utils/message-channel.test.ts` passes on the new behavior.
- `src/infra/outbound/channel-selection.ts` is now hard-cut off deleted channel plugin registries and derives configured channels from canonical `cfg.channels` entries; direct tests now cover single-channel auto-selection, multi-channel explicit selection, and alias normalization.
- `src/cron/isolated-agent/delivery-target.ts` no longer falls back to deleted `DEFAULT_CHAT_CHANNEL`; cron delivery now either reuses session context, selects the single configured channel, or returns an explicit route error.
- Large residual deleted-import footprint still exists across commands, outbound delivery, runtime-api paths, security, and test helpers (`channels/plugins/*`, `channels/registry.js`, `plugins/runtime.js`, `plugins/registry.js`, `plugins/config-state.js`, `plugins/manifest-registry.js`).

**Why this is not complete**
- The hard cutover is not stable until the remaining channel/plugin import sites are removed or rewritten and the legacy `src/nex/plugins*.ts` surface is gone.

**Exit criteria**
1. Delete `src/nex/plugins.ts` and `src/nex/plugins-loader.ts`.
2. Remove or rewrite all remaining imports of `src/plugins/*` and `src/channels/*`.
3. Finish cutting runtime/test/config consumers off deleted plugin/channel registries.
4. Restore validation for the broader command/outbound/runtime-api paths still blocked by stale imports.

**Next file set**
- `src/nex/plugins.ts`
- `src/nex/plugins-loader.ts`
- outbound/runtime surfaces still depending on deleted channel plugin modules:
  `src/nex/runtime-api/server-methods/send.ts`
  `src/infra/outbound/targets.ts`
  `src/infra/outbound/message.ts`
  `src/infra/outbound/deliver.ts`
- residual import sites returned by `rg "channels/registry\\.js|channels/plugins|plugins/runtime\\.js|plugins/registry\\.js|plugins/config-state\\.js|plugins/manifest-registry\\.js|plugins/schema-validator\\.js"`

---

## G2 — Automations → job_definitions Migration

**Status:** `PARTIAL`

**Evidence**
- Bundled automations seed `job_definitions` in `src/nex/automations/seeder.ts`.
- `src/nex/automations/hooks-runtime.ts` inserts mirrored `job_runs`.
- `src/db/hooks.ts` and `hook_invocations` still exist and remain active.
- `src/memory/retain-dispatch.ts` still calls `evaluateAutomationsAtHook()`.

**Why this is not complete**
- The legacy hooks runtime is still the execution system. `job_definitions`/`job_runs` are currently a bridge, not the canonical replacement.

**Exit criteria**
1. `evaluateAutomationsAtHook()` no longer drives hook execution.
2. Hook execution loads from `job_definitions` and records only to `job_runs`.
3. `db/hooks.ts` and `hook_invocations` are deleted or made inert.
4. `memory/retain-dispatch.ts` and other callers route through the job runner.

**Next file set**
- `src/nex/automations/hooks-runtime.ts`
- `src/db/hooks.ts`
- `src/memory/retain-dispatch.ts`
- `src/nex/workspace-lifecycle/runtime-boot.ts`

---

## G3 — Job Execution Engine

**Status:** `PARTIAL`

**Evidence**
- `src/nex/runtime-api/server-work.ts` now implements a real poller/job runner and is wired from `src/nex/runtime-api/server.impl.ts`.
- The runner loads job scripts via `jiti`, marks runs `running/completed/failed`, and evaluates `cron_schedules`.

**Why this is not complete**
- The current runner context is still minimal relative to the original gap spec.
- The richer execution contract is missing: broader execution context, circuit-breaker semantics, and version-lineage behavior around `script_hash` / `previous_version_id`.

**Exit criteria**
1. Runner context matches the canonical job runtime contract.
2. Failure handling includes the intended circuit-breaker behavior.
3. Script versioning / lineage is implemented, not just schema-present.
4. G2/G4/G6 dependents use this runner as their real execution backend.

**Next file set**
- `src/nex/runtime-api/server-work.ts`
- `src/db/work.ts`

---

## G4 — CronService → work.db Unification

**Status:** `PARTIAL`

**Evidence**
- `cron_schedules` exists in `src/db/work.ts`.
- `src/nex/runtime-api/server-work.ts` evaluates `cron_schedules`.
- CronService still runs off `cron_jobs` via `src/cron/service.ts`, `src/cron/service/ops.ts`, and `src/cron/store.ts`.
- `src/db/work.ts` still contains a `cron_jobs` table.

**Why this is not complete**
- The repo still has two cron systems: a `cron_schedules`/job-runs path and a separate CronService `cron_jobs` path.

**Exit criteria**
1. CronService reads/writes `cron_schedules` only.
2. Fired schedules produce canonical `job_runs`.
3. Legacy `cron_jobs` runtime storage is removed.
4. `server-work.ts` and CronService stop representing parallel scheduling systems.

**Next file set**
- `src/cron/service.ts`
- `src/cron/service/ops.ts`
- `src/cron/store.ts`
- `src/db/work.ts`
- `src/nex/runtime-api/server-work.ts`

---

## G5 — Clock Tick → Cron Schedule

**Status:** `PARTIAL`

**Evidence**
- `src/nex/runtime-api/server-clock.ts` is deleted from the worktree.
- CronService now owns a clock tick interval in `src/cron/service/ops.ts`.

**Why this is not complete**
- The spec requires clock ticks to be emitted by a canonical `cron_schedules` entry, not by another hardcoded timer.

**Exit criteria**
1. No dedicated `setInterval` clock tick path remains.
2. Clock tick is represented by a canonical `cron_schedules` row and routed through the job runner.

**Next file set**
- `src/cron/service/ops.ts`
- `src/nex/runtime-api/server-cron.ts`
- schedule seeding/bootstrap path

---

## G6 — Memory Jobs → work.db Migration

**Status:** `PARTIAL`

**Evidence**
- `src/memory/work-bridge.ts` mirrors memory job lifecycle into `job_runs`.
- `src/memory/work-bridge.test.ts` exists.

**Why this is not complete**
- The bridge explicitly documents that `memory.db` remains the source of truth.
- This is observability mirroring, not a hard cutover.

**Exit criteria**
1. Memory job definitions live canonically in `work.db`.
2. Memory execution writes canonical `job_runs`, not shadow copies.
3. Old memory job tables are removed or retired.

**Next file set**
- `src/memory/work-bridge.ts`
- memory pipeline execution sites
- `src/db/memory.ts`

---

## G7 — `session_label` → `session_key` Rename

**Status:** `COMPLETE`

**Evidence**
- The core routing slice is on `session_key`.
- Session continuity/history/import runtime code is now aligned to the live schema in `src/db/agents.ts` (`session_history.session_key`, `tool_calls.spawned_session_key`, `session_imports.session_key`).
- Session runtime-api handlers now use canonical params for the affected operations (`from_session_key`, `from_turn_id`, `source_key`, `target_key`, `session_key`).
- Repo-wide grep for `session_label` / `sessionLabel` across `src/` and `test/` is now clean.
- Targeted validation is green: `src/nex/import/service.test.ts`, `src/nex/session.test.ts`, and `src/db/agents.queue-items.test.ts` all pass.

**Why this is complete**
- The naming cutover is repo-clean for live source/test paths.
- The affected schema/runtime/runtime-api surfaces are aligned.
- The touched slice now has direct validation coverage and passes.

**Exit criteria**
1. Zero non-test `session_label` / `sessionLabel` holdouts remain.
2. Session DB/history/import code uses `session_key` consistently.
3. Control-plane/session APIs use canonical naming.
4. The touched session/import slice has passing validation.

---

## G8 — `SenderContext` / `ReceiverContext` → Entity

**Status:** `COMPLETE`

**Evidence**
- Exact `SenderContext` / `ReceiverContext` type hits are gone from the live `src/iam`, `src/nex`, `src/memory`, and `src/cli` trees.

**Why this is complete**
- The specific legacy wrapper types named by the gap no longer appear in live source.

---

## G9 — TTS / Voicewake / Device / Node Legacy Removal

**Status:** `PARTIAL`

**Evidence**
- I do not see `src/tts/`, `src/talk/`, or `src/voicewake/` trees in the current repo.
- Remaining device/node/system-presence artifacts still exist:
  - `src/infra/system-presence.ts`
  - `src/agents/tools/nodes-tool.ts`
  - `src/agents/tools/nodes-utils.ts`
  - `src/cli/nodes-cli/*`

**Why this is not complete**
- The node/device side of the legacy surface still exists.

**Exit criteria**
1. Remove remaining node/device/system-presence files.
2. Confirm no runtime or CLI path still depends on them.

**Next file set**
- `src/infra/system-presence.ts`
- `src/agents/tools/nodes-tool.ts`
- `src/agents/tools/nodes-utils.ts`
- `src/cli/nodes-cli/`

---

## G10 — Dead Hooks Code Removal

**Status:** `REMAINING`

**Evidence**
- `src/hooks/` still contains `plugin-hooks.ts`, `internal-hooks.ts`, loader/install code, and bundled hook duplicates.

**Why this is not complete**
- The legacy hooks tree is still present and still mixed with canonical automation code.

**Exit criteria**
1. Remove dead hook files and duplicated bundled hook content.
2. Keep only the hook-facing pieces that are still genuinely required after G1/G2 finish.

**Next file set**
- `src/hooks/plugin-hooks.ts`
- `src/hooks/internal-hooks.ts`
- `src/hooks/loader.ts`
- duplicated bundled hook content under `src/hooks/bundled/`

---

## G11 — Dead Cron JSON Store Removal

**Status:** `COMPLETE`

**Evidence**
- The specific JSON-store migration helpers named in the original gap (`saveCronStore`, `loadCronStore`, `migrateJsonToSqlite`) are no longer present in the live cron store files.

**Why this is complete**
- The exact legacy JSON-store removal described by the gap analysis appears to have already happened.

**Note**
- This does **not** mean cron unification is done. `G4` remains open because the runtime still uses legacy `cron_jobs`.

---

## G12 — `element_definitions` Table

**Status:** `COMPLETE`

**Evidence**
- `element_definitions` exists and is seeded in `src/db/memory.ts`.
- CRUD handlers exist in `src/nex/runtime-api/server-methods/memory-elements.ts`.

---

## G13 — Memory Metadata Filter

**Status:** `COMPLETE`

**Evidence**
- Metadata filtering exists in `src/nex/runtime-api/server-methods/memory-elements.ts`.

---

## G14 — Adapter SDK Wiring (`onEvent` / `list`)

**Status:** `PARTIAL`

**Evidence**
- `createWiredPlatformSDK()` exists in `src/apps/context.ts` and wires `adapters.list()` and `adapters.onEvent()`.
- I do not see a live call site using `createWiredPlatformSDK()`.
- App contexts still default to `createStubPlatformSDK()`.

**Why this is not complete**
- The wiring exists on disk but is not yet the canonical runtime path for apps.

**Exit criteria**
1. App runtime creation uses the wired platform SDK, not the stub.
2. `ctx.nex.adapters.list()` and `ctx.nex.adapters.onEvent()` are live in actual app execution.

**Next file set**
- `src/apps/context.ts`
- app runtime / management setup path

---

## G15 — Memory Link Traversal API

**Status:** `COMPLETE`

**Evidence**
- `memory.elements.links.traverse` exists in `src/nex/runtime-api/server-methods/memory-elements.ts`.

---

## G16 — DAG Advancement Engine

**Status:** `DEFERRED`

**Evidence**
- DAG tables exist in `src/db/work.ts`.
- No DAG advancement/orchestration engine is present in runtime execution.

---

## G17 — Session Routing Pipeline Unification

**Status:** `PARTIAL`

**Evidence**
- `SessionRouting` exists on `NexusRequest` in `src/nex/request.ts`.
- `resolveAccess.ts` now computes canonical routing and writes `request.session_routing`.
- `resolvePrincipals.ts` no longer synthesizes ad-hoc session keys.
- `iam/policies.ts` no longer uses the broken DM bootstrap templates.
- `hooks-runtime.ts` now routes automation overrides through `request.session_routing`.
- `src/nex/session.ts` already accepts `Entity` in `buildSessionKey()`.

**Why this is not complete**
- Repo-wide naming cleanup (`G7`) is still unfinished.
- Some downstream session/import/runtime-api paths still preserve legacy session naming.

**Exit criteria**
1. `request.session_routing` is the undisputed session-routing source across the remaining runtime consumers.
2. `request.agent.session_key` is only a derivation/mirror.
3. G7 holdouts are finished.

**Next file set**
- residual session/import/session-history consumers after the G7 sweep

---

## G18 — Agent Config DB Migration

**Status:** `PARTIAL`

**Evidence**
- `agent_configs` schema + CRUD exist in `src/db/work.ts` and `src/nex/runtime-api/server-methods/agent-configs.ts`.
- `src/db/work.ts` seeds manager/worker presets.
- Runtime policy still imports `src/iam/role-caps.ts`.
- I do not see `agent_config_id` wired through turns/runtime execution.

**Why this is not complete**
- The DB exists, but the broker/runtime does not use it as the source of truth.

**Exit criteria**
1. Broker/runtime reads agent config from `agent_configs`, not `role-caps.ts`.
2. Agent executions are linked to config identity.
3. `role-caps.ts` is removed.

**Next file set**
- `src/iam/role-caps.ts`
- broker/runtime config resolution path
- turns schema / execution metadata

---

## G19 — Verify 6 Missed Operations

**Status:** `COMPLETE`

**Evidence**
- All 6 operations exist in the live runtime taxonomy and handlers.

---

## Execution Order From Here

### Phase A — Finish already-started mechanical/runtime alignment

1. `G7` — finish repo-wide `session_key` normalization
2. `G17` — close remaining downstream session-routing consumers after G7
3. `G14` — make the wired adapter SDK the real app runtime path
4. `G18` — move broker/runtime off `role-caps.ts`
5. `G9` — finish remaining device/node removal

### Phase B — Finish work-domain canonicalization

1. `G3` — finish the job runner contract
2. `G2` — move automations fully onto `job_definitions` / `job_runs`
3. `G4` — collapse cron onto `cron_schedules`
4. `G5` — move clock tick to canonical cron schedule
5. `G6` — finish memory job migration to work.db

### Phase C — Remove superseded legacy systems

1. `G1` — complete plugin/channels removal and fix validation fallout
2. `G10` — remove dead hooks tree once G1/G2 are complete

### Deferred

1. `G16` — DAG advancement engine

---

## Practical Branch Blockers

These are not separate gaps, but they matter operationally:

1. **Broader G1 deleted-import fallout remains** — the session/import slice is repaired, but many command/outbound/runtime-api files still import deleted channel/plugin modules.
2. **The branch is in a large destructive-delete state** for channels/plugins, so new work must avoid accidentally rebuilding legacy behavior during cleanup.
3. **Several gaps in the original analysis are stale** and should now be judged against this tracker, not against the March 5 snapshot.
