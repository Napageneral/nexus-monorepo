# WIS-018 Active-Stage Persistence During Validation And Review

## Goal

Keep issue-state stage truth current while a run is still executing.

## Scope

- update Dispatch stage persistence so validation start is reflected
  immediately in issue state
- keep active-stage, last-stage, and stage-owned timestamps truthful during
  long-running validation work
- align review summaries, missing-requirement summaries, and issue-state stage
  markers so they all describe the same active stage
- add focused coverage for active validation state, interrupted validation
  state, and completed validation state

## Acceptance

- once validation starts, issue state no longer reports `last_stage =
  implementing`
- active-stage and last-stage markers remain truthful during long-running proof
  lanes and after interrupted validation
- review and operator summaries no longer lag behind the real stage boundary

## Current Evidence

- after `dagrun_08c25142-1249-4b1a-9005-55f0b3a708c4` entered validation,
  [issue-state.json](/Users/tyler/nexus/state/data/apps/dispatch/issues/dispatch-policy-4711165b-d2f/SPEC-259/issue-state.json)
  still reported `last_stage = implementing`
- that stale stage truth makes interrupted validation look like the run never
  left implementation, which is wrong and confusing during dogfood forensics
