# Work System Phase 2 Implementation Spec

## Scope

This document covers only **Phase 2: Work Item CRUD** from:
- `WORK_SYSTEM_WORKPLAN.md` §Phase 2
- `CRM_ANALYSIS_AND_WORK_SYSTEM.md` §4.1–§4.5

Hard cutover rule for this phase:
- Work state mutations are handled only via `work.ts` CRUD functions.
- Work item status transitions must update mutable cache + append immutable event rows atomically.
- No legacy alternative data path is retained.

## Customer Experience First

Phase 2 customer impact:

1. Users can create and track concrete work (tasks, workflows, work items, sequences) with predictable state transitions.
2. Work timeline/history is auditable and reconstructable from `work_item_events`.
3. Filtering and due-item lookup behave consistently for dashboards and future scheduler integration.

## Research Findings

1. `work.ts` currently has schema + types + `ensureWorkSchema` only.
2. No CRUD functions for tasks/workflows/work_items/sequences are implemented yet.
3. Existing DB modules (`nexus.ts`, `hooks.ts`) use:
   - explicit row interfaces
   - create/get/list/update function families
   - dynamic filtered SQL with parameter arrays
   - input normalization and idempotent guards

## Implementation Plan

Implement the Phase 2 surface in `nex/src/db/work.ts`:

### 1) Tasks

- `createTask(db, input: TaskInput, opts?)`
- `getTask(db, id)`
- `listTasks(db, opts?)`
- `updateTask(db, id, patch, opts?)`

### 2) Workflows + Steps

- `createWorkflow(db, input: WorkflowInput, opts?)`
- `getWorkflow(db, id)`
- `listWorkflows(db, opts?)`
- `addWorkflowStep(db, input: WorkflowStepInput, opts?)`
- `listWorkflowSteps(db, workflowId)`
- `getWorkflowWithSteps(db, id)`

### 3) Work Items + Events

- `createWorkItem(db, input: WorkItemInput, opts?)` (creates `created` event)
- `getWorkItem(db, id)`
- `listWorkItems(db, opts?)`
- `updateWorkItemStatus(db, id, newStatus, actor, reason?, opts?)`
- `assignWorkItem(db, id, assigneeType, assigneeId, actor, opts?)`
- `snoozeWorkItem(db, id, snoozedUntil, actor, reason?, opts?)`
- `completeWorkItem(db, id, actor, reason?, opts?)`
- `cancelWorkItem(db, id, actor, reason?, opts?)`
- `listDueWorkItems(db, now)`
- `listWorkItemEvents(db, workItemId)`

Atomic rule for status/assignment changes:

1. Begin transaction.
2. Update `work_items` mutable cache fields.
3. Insert `work_item_events` row.
4. Commit (rollback on error).

### 4) Sequences

- `createSequence(db, input: SequenceInput, opts?)`
- `getSequence(db, id)`
- `listSequences(db, opts?)`
- `updateSequenceStatus(db, id, newStatus, opts?)`
- `getSequenceWithItems(db, id)`

### 5) Validation tests

Create `nex/src/db/work-crud.test.ts` covering:

1. Task create/get/list/update.
2. Workflow create + step ordering retrieval + bundled read.
3. Work item create emits `created` event.
4. Status/assignment/snooze/complete/cancel each append correct events and cache updates.
5. `listDueWorkItems` and list filters.
6. Sequence create/list/status update + `getSequenceWithItems`.

## Done Criteria

1. All Phase 2 functions from workplan exist in `work.ts`.
2. Work item state/event mutation contract is transactionally enforced.
3. `work-crud.test.ts` passes.
4. Phase 1 schema tests remain green.

## Tracker

- [x] Research completed
- [x] Phase 2 spec written
- [x] Implementation complete
- [x] Validation complete
- [x] Ready to start Phase 3
