# WIS-013 Canonical Dispatch Stage Failure Persistence

## Goal

Persist stage failure truth into issue state so review and operator surfaces are
canonical even when a run terminates early.

## Scope

- update Dispatch stage failure handling so `last_stage` reflects the terminal
  stage instead of the last successful precursor
- persist the terminal error string and any structured stage-failure metadata
  that is safe to store in issue state
- record whether candidate publication began, whether validation packet
  creation began, and what stage-owned outputs were still missing at failure
- ensure review summaries and handoff text reflect the same canonical failure
  truth
- add focused coverage for implementation-stage and validation-stage failures

## Acceptance

- when a stage fails, issue state reflects the actual failed stage
- issue state preserves the terminal error and the stage-owned progress that was
  or was not completed
- review summaries and missing-requirement summaries do not present stale
  `preparing_substrate` or equivalent precursor truth after a later stage fails

## Current Evidence

- live `SPEC-259` lineage `dagrun_aa2fe17d-b595-44b2-82b3-d0165e571734` failed
  in `implementing`
- [issue-state.json](/Users/tyler/nexus/state/data/apps/dispatch/issues/dispatch-policy-4711165b-d2f/SPEC-259/issue-state.json)
  still shows `last_stage = preparing_substrate`
- the same issue state also lacks terminal implementation failure truth such as
  the final error and whether candidate publication ever began
