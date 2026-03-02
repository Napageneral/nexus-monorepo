# Work System Phase 3 Implementation Spec

## Scope

This document covers only **Phase 3: Work Scheduler Service (NEX Pipeline Integration)** from:
- `WORK_SYSTEM_WORKPLAN.md` §Phase 3
- `CRM_ANALYSIS_AND_WORK_SYSTEM.md` §5 (execution model)

Hard cutover rule for this phase:
- Due work dispatch is handled by a dedicated runtime work scheduler service (`server-work.ts`) in the control plane.
- Work item execution must go through `dispatchNexusEvent()` into the full NEX pipeline.
- No legacy/alternate scheduler path is introduced.

## Customer Experience First

Phase 3 customer impact:

1. A scheduled follow-up actually runs when due instead of sitting in `scheduled` forever.
2. Success/failure state transitions are deterministic and auditable (`scheduled -> active -> completed|pending`).
3. Pipeline behavior for work runs is consistent with other system ingress paths (identity/access/session routing).

## Research Findings

1. No work scheduler control-plane service exists yet (`server-work.ts` missing).
2. Runtime timer wiring is in `nex/src/nex/control-plane/server.impl.ts` (clock + cron lifecycle), not `server-startup.ts` for timer services.
3. `nex/src/db/work.ts` already provides required Phase 3 DB primitives:
   - `listDueWorkItems`
   - `updateWorkItemStatus`
   - `completeWorkItem`
   - `getTask`
4. `nex/src/iam/identity.ts` `SYSTEM_PLATFORMS` does not include `"work"`.
5. Receiver bootstrap contacts in `nex/src/iam/bootstrap-identities.ts` include `control-plane`, `webchat`, `openai`, `openresponses`, `hooks`, `runtime`, `cron`, but not `work`.

Why #5 matters:
- Work scheduler events use delivery platform `work` and account `default`.
- Receiver resolution depends on platform/account contact mapping for non-webhook channels.
- Without a seeded `work/default` receiver contact, work runs can resolve to unknown receiver and be denied before `runAgent`.

## Implementation Plan

### 1) Scheduler service file

Create `nex/src/nex/control-plane/server-work.ts`:

- `buildRuntimeWorkScheduler(params)` following `server-clock.ts` timer pattern.
- Poll interval: `30_000` ms default.
- In-flight serialization guard.
- On tick:
  1. Ensure runtime + ledgers are available.
  2. `ensureWorkSchema(ledgers.work)`.
  3. `listDueWorkItems(ledgers.work, now)`.
  4. For each due item:
     - `updateWorkItemStatus(..., "active", "work-scheduler", ...)`
     - resolve prompt from `work_item.description`, else `task.agent_prompt`, else fallback title text
     - `dispatchNexusEvent(...)` with `source: "work"`, delivery platform `work`, routing override session label + persona ref, metadata including `work_item_id`
     - on success: `completeWorkItem(...)`
     - on failed/denied/exception: revert to `pending` with reason and log
- Expose `start()` and `stop()` lifecycle methods.

### 2) Runtime lifecycle wiring

Modify `nex/src/nex/control-plane/server.impl.ts`:

- Instantiate `workState` alongside clock/cron services.
- Start work scheduler after sidecars startup (same startup phase as clock start).
- Pass stop hook into runtime close path.

Modify `nex/src/nex/control-plane/server-close.ts`:

- Accept `work: { stop: () => void }` and stop it during shutdown.

### 3) Identity/system ingress alignment

Modify `nex/src/iam/identity.ts`:
- Add `"work"` to `SYSTEM_PLATFORMS`.

Modify `nex/src/iam/bootstrap-identities.ts`:
- Add internal receiver seed contact for `platform: "work", sender_id: "default"` bound to `entity-assistant`.

### 4) Validation tests

Create `nex/src/nex/control-plane/server-work.test.ts` covering:

1. Due scheduled items dispatch via `dispatchNexusEvent`.
2. Not-yet-due items are skipped.
3. Non-scheduled items are skipped.
4. Status transitions on success: `scheduled -> active -> completed`.
5. Status transitions on dispatch failure: `scheduled -> active -> pending`.
6. Prompt fallback to `task.agent_prompt` when item description is empty.
7. Graceful no-op when runtime/ledgers are unavailable.
8. In-flight guard prevents concurrent overlap.
9. Dispatch metadata includes `work_item_id` and expected routing/delivery envelope.
10. `start()/stop()` controls timer lifecycle.

## Done Criteria

1. Work scheduler service exists and is wired into runtime startup/shutdown.
2. Due work items dispatch through `dispatchNexusEvent` and transition state correctly.
3. `work` system platform identity behavior is enabled.
4. Internal receiver mapping exists for `work/default`.
5. Phase 3 targeted tests pass without regressions in previously completed phases.

## Tracker

- [x] Research completed
- [x] Phase 3 spec written
- [x] Implementation complete
- [x] Validation complete
- [x] Ready to start Phase 4
