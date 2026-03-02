# Work System True End-to-End Integration Spec

**Status:** PLANNING SPEC  
**Last Updated:** 2026-02-27  
**Related:** `CRM_ANALYSIS_AND_WORK_SYSTEM.md`, `WORK_SYSTEM_WORKPLAN.md`, `ENTITY_ACTIVITY_DASHBOARD.md`

---

## 1. Scope

This spec defines the hard-cutover target for true CRM end-to-end integration across:

1. Work backend execution path (work.db + runtime scheduler + NEX pipeline dispatch)
2. Control-plane API contract (`work.*` runtime methods)
3. SDK-facing operation contract for control clients
4. Control UI (`Work` tab and workflows)
5. Validation ladder up to full unmocked runtime E2E

---

## 2. Customer Experience First

Done means an operator can do this without touching SQL or internal test helpers:

1. Open Control UI and go to `Work`.
2. Create a follow-up tied to an entity from the identity/contact system.
3. See the item progress through `scheduled -> active -> completed` with a visible audit trail.
4. Create a campaign from a workflow and an entity tag (example: `pipeline:lead`) and watch each entity sequence advance independently.
5. Mark an item recurring and verify the next scheduled instance is automatically spawned.
6. View work state and aggregates in one place (queue, sequences, campaign progress, per-entity activity).

If any one of those flows requires direct DB mutation or internal test-only entrypoints in normal operation, integration is incomplete.

---

## 3. Research Findings (Current State)

As of 2026-02-27:

1. Work schema, CRUD, sequence advancement, campaign instantiation, and recurrence exist in `nex/src/db/work.ts`.
2. Runtime polling scheduler exists in `nex/src/nex/control-plane/server-work.ts` and is started/stopped in `server.impl.ts`.
3. Strong orchestration tests exist in `nex/src/nex/control-plane/server-work.test.ts`, including campaign + recurrence flow.
4. The scheduler test suite mocks `dispatchNexusEvent`, so current coverage is not a full live runtime pipeline test.
5. No `work.*` control-plane methods exist in `nex/src/nex/control-plane/server-methods`.
6. Runtime operation taxonomy currently has no work operations in `nex/src/nex/control-plane/runtime-operations.ts`.
7. Adapter protocol schema in `nex/src/nex/adapters/protocol.ts` is bound to the current external adapter operation list and has no work-domain contract surface.
8. Control UI has no `work` tab wiring (`ui/src/ui/navigation.ts`, `ui/src/ui/app-render.ts`, `ui/src/ui/app-settings.ts`, `ui/src/ui/app-view-state.ts`).
9. `WORK_SYSTEM_WORKPLAN.md` expects Level 6 test `integration/crm-flow.test.ts`, but no equivalent true unmocked CRM flow integration test currently exists.

---

## 4. Hard-Cutover Decisions

1. **Single execution path:** runtime `server-work` scheduler is the canonical due-work executor for this cutover.
2. **Single API contract:** use canonical `work.*` runtime methods only; no legacy aliases.
3. **Single UI surface:** first-class `Work` tab in Control UI; no hidden/experimental path.
4. **No backward compatibility layer:** do not keep old method names or duplicate route aliases for this feature.
5. **No split truth:** UI reads/writes only through runtime methods; no direct UI DB access.

---

## 5. Target Architecture

### 5.1 Control-Plane Runtime Methods (Canonical)

Add these methods and handlers as the minimum complete contract:

1. `work.tasks.list`
2. `work.tasks.create`
3. `work.workflows.list`
4. `work.workflows.create`
5. `work.workflows.instantiate`
6. `work.campaigns.instantiate`
7. `work.items.list`
8. `work.items.get`
9. `work.items.create`
10. `work.items.events.list`
11. `work.items.assign`
12. `work.items.snooze`
13. `work.items.complete`
14. `work.items.cancel`
15. `work.sequences.list`
16. `work.sequences.get`
17. `work.dashboard.summary`

Implementation files:

1. `nex/src/nex/control-plane/server-methods/work.ts` (new)
2. `nex/src/nex/control-plane/server-methods.ts` (register handlers)
3. `nex/src/nex/control-plane/runtime-operations.ts` (taxonomy + action/resource mapping)

### 5.2 SDK Contract Integration

For this project, SDK integration means control clients and integration code get a stable typed work operation contract.

Implementation:

1. Add a shared work operation ID export (and schemas/types) under `nex/src/extensions-api`.
2. Re-export the work contract via `nex/src/extensions-api/index.ts`.
3. Add conformance tests that ensure:
   - work method IDs in runtime taxonomy and SDK exports stay aligned
   - method names are parseable by the relevant schemas

Note: external channel adapter operation IDs remain channel/delivery focused; work control methods are runtime control-plane operations.

### 5.3 Control UI Integration

Add a complete `Work` surface in Control UI:

1. Navigation and tab routing:
   - add `work` in `ui/src/ui/navigation.ts`
2. View state:
   - add work state fields in `ui/src/ui/app.ts` and `ui/src/ui/app-view-state.ts`
3. Data controller:
   - add `ui/src/ui/controllers/work.ts` using runtime `work.*` methods
4. Rendering:
   - add `ui/src/ui/views/work-view.ts`
   - mount in `ui/src/ui/app-render.ts`
5. Tab refresh lifecycle:
   - wire in `ui/src/ui/app-settings.ts`

Minimum UX in first cut:

1. Work queue list + filters
2. Item detail with event timeline
3. Quick actions (assign, snooze, complete, cancel)
4. Workflow/campaign instantiate actions
5. Summary cards (due, active, completed, campaign totals)

### 5.4 True Level 6 E2E Test Contract

Add a true unmocked integration test (runtime server + RPC calls + real scheduler dispatch path) with no `dispatchNexusEvent` mock.

Test requirements:

1. Start runtime with standard control-plane test helpers.
2. Seed identity entities + `pipeline:lead` tags.
3. Create tasks/workflow via `work.*` methods.
4. Instantiate campaign via `work.campaigns.instantiate`.
5. Run scheduler execution path and verify per-entity sequence progression.
6. Validate lifecycle transitions and `work_item_events`.
7. Validate recurring item spawn behavior.
8. Validate `work.dashboard.summary` aggregates.
9. Assert operation/taxonomy conformance still passes.

---

## 6. Updated Validation Ladder

Run in order; each level depends on previous levels passing.

### Level 0: Regression Baseline

1. Existing cron/identity/pipeline/runtime conformance suites stay green.

### Level 1: Work Data Foundation

1. `work-schema`, `work-crud`, `work-sequence`, `work-campaign`, `recurrence` suites pass.

### Level 2: Runtime Scheduler Semantics

1. `server-work.test.ts` passes for due dispatch, sequence advancement, recurrence spawn.

### Level 3: Control-Plane Work API

1. New `server-methods/work.test.ts` passes for all `work.*` methods.
2. Runtime operation conformance passes with new work methods in taxonomy.

### Level 4: SDK Contract Conformance

1. New/updated SDK conformance tests pass for work operation contract alignment.

### Level 5: Control UI Wiring

1. UI tests pass for navigation, state refresh, and work view rendering/controller behavior.

### Level 6: True CRM Flow (Unmocked)

1. New runtime E2E CRM flow test passes end-to-end with live scheduler dispatch path.
2. No mocked `dispatchNexusEvent` in the Level 6 suite.

---

## 7. Definition of Done

The integration is complete only when all are true:

1. `work.*` methods exist, are authorized, and are listed in canonical runtime operations.
2. Control UI has a first-class `Work` tab fully wired to runtime methods.
3. SDK contract exports the work operation surface used by clients/integrations.
4. Level 0 through Level 6 ladder passes in CI and local reproducible runs.
5. The E2E CRM flow test uses the real runtime dispatch path (no mocked dispatch helper).

---

## 8. Tracker

- [x] Research complete
- [x] True E2E integration spec written
- [x] Implementation complete
- [x] Validation ladder complete
- [x] Ready for end-to-end tryout
