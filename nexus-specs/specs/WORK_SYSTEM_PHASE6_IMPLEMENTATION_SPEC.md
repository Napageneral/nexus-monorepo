# Work System Phase 6 Implementation Spec

## Scope

This document covers only **Phase 6: Recurrence Support** from:
- `WORK_SYSTEM_WORKPLAN.md` §Phase 6
- `CRM_ANALYSIS_AND_WORK_SYSTEM.md` §4.3 (recurrence fields)

Hard cutover rule for this phase:
- Recurring item respawn is handled directly in `completeWorkItem`.
- Recurrence schedule source is the item's `recurrence` cron expression.
- No separate recurrence service or sidecar is introduced.

## Customer Experience First

Phase 6 customer impact:

1. Recurring follow-ups regenerate automatically after completion.
2. Spawned recurrence items preserve customer/task context without manual duplication.
3. Weekly/monthly check-ins can run continuously through standard scheduler flow.

## Research Findings

1. `completeWorkItem` currently marks complete but does not spawn recurrence rows.
2. Recurrence fields already exist in schema (`recurrence`, `recurrence_source_id`).
3. Project already uses `croner` for cron scheduling; recurrence parsing should align.

## Implementation Plan

1. Extend `completeWorkItem` in `work.ts`:
   - parse `recurrence` cron expression
   - compute next occurrence
   - insert cloned scheduled work item with `recurrence_source_id`
2. Preserve key fields in spawned item (`task_id`, `entity_id`, `title`, etc.).
3. Keep completion + spawn inside same transaction for consistency.
4. Invalid/empty recurrence should not block completion.

## Validation

Add `recurrence.test.ts` to verify:

1. Completing recurring item spawns next scheduled item.
2. Spawned item has correct `recurrence_source_id` root linkage.
3. Spawned item preserves task/entity/title fields.
4. Non-recurring completion does not spawn.
5. Common cron patterns (daily/weekly/monthly) produce valid future schedules.

## Tracker

- [x] Research completed
- [x] Phase 6 spec written
- [x] Implementation complete
- [x] Validation complete
- [x] Ready for End-to-End Tryout
