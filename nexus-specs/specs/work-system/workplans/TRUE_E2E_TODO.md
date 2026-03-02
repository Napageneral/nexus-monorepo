# Work System True E2E Integration TODO

**Reference Spec:** `WORK_SYSTEM_TRUE_E2E_INTEGRATION_SPEC.md`  
**Execution Mode:** Hard cutover, no backward compatibility layer

---

## Phase 1: Runtime API Surface (`work.*`)

- [x] Create `nex/src/nex/control-plane/server-methods/work.ts` with handlers for:
- [x] `work.tasks.list`
- [x] `work.tasks.create`
- [x] `work.workflows.list`
- [x] `work.workflows.create`
- [x] `work.workflows.instantiate`
- [x] `work.campaigns.instantiate`
- [x] `work.items.list`
- [x] `work.items.get`
- [x] `work.items.create`
- [x] `work.items.events.list`
- [x] `work.items.assign`
- [x] `work.items.snooze`
- [x] `work.items.complete`
- [x] `work.items.cancel`
- [x] `work.sequences.list`
- [x] `work.sequences.get`
- [x] `work.dashboard.summary`
- [x] Register work handlers in `nex/src/nex/control-plane/server-methods.ts`
- [x] Add runtime taxonomy entries in `nex/src/nex/control-plane/runtime-operations.ts`
- [x] Add unit tests in `nex/src/nex/control-plane/server-methods/work.test.ts`

Validation gate:

- [x] `pnpm vitest run src/nex/control-plane/server-methods/work.test.ts`
- [x] `pnpm vitest run src/nex/control-plane/runtime-operations.conformance.test.ts`

---

## Phase 2: SDK Contract Alignment

- [x] Add work operation contract exports under `nex/src/extensions-api`
- [x] Re-export work contract from `nex/src/extensions-api/index.ts`
- [x] Add SDK conformance test to guarantee runtime taxonomy and SDK work IDs stay aligned

Validation gate:

- [x] `pnpm vitest run src/extensions-api/index.test.ts`
- [x] `pnpm vitest run src/nex/control-plane/runtime-operations.conformance.test.ts`

---

## Phase 3: Control UI Wiring (`Work` Tab)

- [x] Add `work` tab in `ui/src/ui/navigation.ts`
- [x] Add work state fields in `ui/src/ui/app.ts`
- [x] Extend view-state typing in `ui/src/ui/app-view-state.ts`
- [x] Add `ui/src/ui/controllers/work.ts` for runtime RPC calls
- [x] Add `ui/src/ui/views/work-view.ts`
- [x] Mount `work` view in `ui/src/ui/app-render.ts`
- [x] Refresh/load logic for work tab in `ui/src/ui/app-settings.ts`
- [x] Add/update UI tests for navigation, settings, and rendering/controller flow

Validation gate:

- [x] `pnpm --dir ui test`

---

## Phase 4: True Level 6 E2E Test (Unmocked Dispatch Path)

- [x] Add new runtime E2E test for CRM flow (recommended location: `src/nex/control-plane/server.work-crm-flow.e2e.test.ts`)
- [x] Start runtime with existing control-plane test helpers
- [x] Seed identity entities/tags for campaign targeting
- [x] Execute workflow/campaign creation through `work.*` runtime methods
- [x] Verify sequence progression, item lifecycle events, recurrence spawn, and dashboard aggregates
- [x] Ensure Level 6 test does not mock `dispatchNexusEvent`

Validation gate:

- [x] `pnpm vitest run --config vitest.e2e.config.ts src/nex/control-plane/server.work-crm-flow.e2e.test.ts`

---

## Phase 5: Validation Ladder Lock-In

- [x] Update `WORK_SYSTEM_WORKPLAN.md` ladder commands to point to actual test files
- [x] Keep Level 0 through Level 6 executable in current repo structure
- [x] Run full ladder in sequence and record pass state

Validation gate:

- [x] Level 0 regression suites pass
- [x] Level 1 work data suites pass
- [x] Level 2 scheduler suites pass
- [x] Level 3 work API suites pass
- [x] Level 4 SDK conformance suites pass
- [x] Level 5 UI suites pass
- [x] Level 6 true CRM E2E suite passes

---

## Completion Checklist

- [x] Runtime API complete
- [x] SDK contract complete
- [x] Control UI complete
- [x] True E2E test complete
- [x] Validation ladder green end-to-end
- [x] Ready for manual product tryout
