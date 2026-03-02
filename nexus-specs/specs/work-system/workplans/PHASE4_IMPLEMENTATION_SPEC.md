# Work System Phase 4 Implementation Spec

## Scope

This document covers only **Phase 4: Sequence Advancement + Workflow Instantiation** from:
- `WORK_SYSTEM_WORKPLAN.md` §Phase 4
- `CRM_ANALYSIS_AND_WORK_SYSTEM.md` §5 (Reactive Work Item Updates, Campaign Instantiation)

Hard cutover rule for this phase:
- Sequence progression is driven by explicit dependency checks in `work.ts`.
- Workflow instantiation is the canonical way to expand workflow templates into concrete sequence + work item rows.
- No backwards-compat path or duplicate sequencing logic is added.

## Customer Experience First

Phase 4 customer impact:

1. Multi-step outreach/onboarding flows progress automatically after each completed step.
2. Dependencies are honored (including multi-dependency joins) so users never see out-of-order execution.
3. Workflow templates can be instantiated into actionable, schedulable work without manual per-step creation.

## Research Findings

1. `work.ts` currently implements Phase 2 CRUD only; it lacks:
   - `advanceSequence`
   - `instantiateWorkflow`
2. `server-work.ts` currently completes successful due items but does not advance sequence dependencies.
3. Existing schema and types already include required fields for Phase 4 logic:
   - `workflow_steps.depends_on_steps`
   - `workflow_steps.delay_after_ms`
   - `work_items.depends_on_items`, `workflow_step_id`, `sequence_order`, `status`, `scheduled_at`
4. Existing event model is append-only (`work_item_events`) and should remain the source-of-truth for status transitions.

## Implementation Plan

### 1) `work.ts` sequence progression

Add `advanceSequence(db, completedWorkItemId, opts?)` with behavior:

1. Resolve completed item.
2. If no sequence binding, return no-op.
3. If sequence already `completed`, return no-op.
4. Load all sequence work items.
5. Identify pending/blocked items whose `depends_on_items` are all completed.
6. For each newly unblocked item:
   - transition to `scheduled`
   - compute `scheduled_at` from `workflow_steps.delay_after_ms` (default immediate)
7. If all items in sequence are completed, mark sequence `completed`.

### 2) `work.ts` workflow instantiation

Add `instantiateWorkflow(db, workflowId, opts?)` returning `{ sequence, workItems }`:

1. Resolve workflow + ordered steps.
2. Create a sequence row bound to the workflow.
3. Create work items from each step using:
   - task defaults
   - step overrides
   - sequence/workflow bindings
4. Map step dependencies (`depends_on_steps`) to concrete `depends_on_items` work item IDs.
5. Schedule first items (no dependencies).

### 3) Scheduler integration

Modify `server-work.ts`:

1. After successful completion (`completeWorkItem`), call `advanceSequence`.
2. Keep completion durable even if sequence advancement fails (log warning; do not revert completed item to pending).

### 4) Tests

Create `src/db/work-sequence.test.ts` covering:

1. `advanceSequence` unblocks dependent item.
2. `advanceSequence` handles multi-dependency joins.
3. `advanceSequence` marks sequence completed when all items complete.
4. `advanceSequence` no-op for standalone items and already-completed sequences.
5. `advanceSequence` computes `scheduled_at` using step delay.
6. `instantiateWorkflow` creates sequence + items with defaults/overrides.
7. `instantiateWorkflow` maps step dependencies to work item IDs.
8. `instantiateWorkflow` schedules first items and supports `entityId` + `parentSequenceId`.

## Done Criteria

1. `advanceSequence` and `instantiateWorkflow` are implemented in `work.ts`.
2. `server-work.ts` calls `advanceSequence` after successful completion.
3. Sequence advancement + workflow instantiation tests pass.
4. Prior phase tests (identity/work scheduler/work CRUD/schema) remain green.

## Tracker

- [x] Research completed
- [x] Phase 4 spec written
- [x] Implementation complete
- [x] Validation complete
- [x] Ready to start Phase 5
