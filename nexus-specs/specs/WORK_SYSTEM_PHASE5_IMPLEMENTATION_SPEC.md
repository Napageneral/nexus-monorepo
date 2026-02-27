# Work System Phase 5 Implementation Spec

## Scope

This document covers only **Phase 5: Campaign Instantiation** from:
- `WORK_SYSTEM_WORKPLAN.md` §Phase 5
- `CRM_ANALYSIS_AND_WORK_SYSTEM.md` §5 (Campaign Instantiation)

Hard cutover rule for this phase:
- Campaign expansion is implemented as first-class DB logic (`instantiateCampaign`) in `work.ts`.
- Target entity selection comes from active identity tags (`deleted_at IS NULL`).
- No alternate campaign expansion path is introduced.

## Customer Experience First

Phase 5 customer impact:

1. A user can launch one campaign and reliably fan it out into per-entity child sequences.
2. Each target entity gets isolated sequence progression without manual setup.
3. Campaign parent/child relationships are queryable for dashboards and lifecycle tracking.

## Research Findings

1. `instantiateCampaign` does not exist yet in `work.ts`.
2. Phase 4 already provides `instantiateWorkflow`, which is the right primitive for per-entity child creation.
3. Identity tag semantics are Phase 0-compliant: active tags require `entity_tags.deleted_at IS NULL`.

## Implementation Plan

1. Add `InstantiateCampaignOptions` and `instantiateCampaign(db, identityDb, workflowId, opts)` to `work.ts`.
2. Query identity targets via active-tag filter (`tag = ? AND deleted_at IS NULL`).
3. Create parent campaign sequence (`source='campaign'`, `status='active'`).
4. For each target entity, call `instantiateWorkflow` with `{ entityId, parentSequenceId }`.
5. Return `{ campaign, childSequences }`.

## Validation

Add `work-campaign.test.ts` to verify:

1. Parent + N child sequence creation.
2. Child entity binding correctness.
3. Child `parent_sequence_id` references campaign parent.
4. Child first work items are scheduled when dependencies allow.
5. `listSequences({ parentId })` returns child set.
6. Campaign parent status is `active`.

## Tracker

- [x] Research completed
- [x] Phase 5 spec written
- [x] Implementation complete
- [x] Validation complete
- [x] Ready to start Phase 6
