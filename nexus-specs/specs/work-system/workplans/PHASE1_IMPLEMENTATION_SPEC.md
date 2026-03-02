# Work System Phase 1 Implementation Spec

## Scope

This document covers only **Phase 1: work.db Schema + Ledger Integration** from:
- `WORK_SYSTEM_WORKPLAN.md` §Phase 1
- `CRM_ANALYSIS_AND_WORK_SYSTEM.md` §4
- `DATABASE_ARCHITECTURE.md` §3.7

Hard cutover rule for this phase:
- `work.db` is introduced as the canonical 7th ledger now.
- No compatibility layer for old work storage is added.
- Table names and field names remain exactly as specified.

## Customer Experience First

Phase 1 customer impact:

1. Users/operators get a stable foundation for future-work tracking (`tasks`, `work_items`, `workflows`, `sequences`).
2. Work scheduling and CRM follow-ups can be built incrementally without schema churn in later phases.
3. Data is consistently persisted in a dedicated ledger (`work.db`) with deterministic initialization semantics.

## Research Findings

Current code state:

1. `nex/src/db/work.ts` does not exist.
2. `nex/src/db/ledgers.ts` defines 6 ledgers only:
   - `events`, `agents`, `identity`, `memory`, `embeddings`, `nexus`
3. `nex/src/db/index.ts` does not initialize or export a work schema module.
4. No work schema tests exist (`work-schema.test.ts` missing).

## Implementation Plan

### 1) New Schema Module

Create `nex/src/db/work.ts` with:

1. `WORK_SCHEMA_SQL`
   - `tasks`
   - `workflows`
   - `workflow_steps`
   - `work_items`
   - `work_item_events`
   - `sequences`
   - indexes as defined in `CRM_ANALYSIS_AND_WORK_SYSTEM.md` §4.1–§4.5

2. `ensureWorkSchema(db: DatabaseSync): void`
   - idempotent `db.exec(WORK_SCHEMA_SQL)`

3. Row/input types
   - `TaskRow`, `TaskInput`
   - `WorkflowRow`, `WorkflowInput`
   - `WorkflowStepRow`, `WorkflowStepInput`
   - `WorkItemRow`, `WorkItemInput`
   - `WorkItemEventRow`, `WorkItemEventInput`
   - `SequenceRow`, `SequenceInput`

### 2) Ledger Wiring

Update `nex/src/db/ledgers.ts`:

1. Add `"work"` to `LedgerName`.
2. Add `work: "work.db"` to `LEDGER_FILENAMES`.
3. Add `work: DatabaseSync` to `LedgerConnections`.
4. Open `work` in `openAllLedgers()` and include it in `close()`.

Update `nex/src/db/index.ts`:

1. Import `ensureWorkSchema` from `./work.js`.
2. Call `ensureWorkSchema(ledgers.work)` in `initializeLedgers()`.
3. Re-export `./work.js`.

### 3) Validation Tests

Create `nex/src/db/work-schema.test.ts`:

1. `ensureWorkSchema` creates all 6 tables.
2. `ensureWorkSchema` idempotency.
3. Spot-check critical indexes.
4. `openAllLedgers` includes `work` and `work.db` exists on disk.
5. `PRAGMA foreign_keys` is enabled for `work` connection.

## Done Criteria

1. `openAllLedgers()` returns 7 databases including `work`.
2. `initializeLedgers()` ensures work schema.
3. `work.db` exists in `{stateDir}/data/work.db`.
4. All Phase 1 targeted tests pass.

## Tracker

- [x] Research completed
- [x] Phase 1 spec written
- [x] Implementation complete
- [x] Validation complete
- [x] Ready to start Phase 2
