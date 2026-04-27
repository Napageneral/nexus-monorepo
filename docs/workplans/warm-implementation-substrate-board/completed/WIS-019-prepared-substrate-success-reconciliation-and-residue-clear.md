# WIS-019 Prepared-Substrate Success Reconciliation And Residue Clear

## Goal

Clear stale prepared-substrate failure residue after a successful rebuild so
success state is canonical.

## Scope

- reconcile prepared-substrate state on successful reruns
- clear or tombstone stale `error` fields when the substrate later reaches
  `ready`
- preserve historical failure information only in a form that does not pollute
  current success state
- align issue-state summaries and operator surfaces with the reconciled
  prepared-substrate truth

## Acceptance

- a prepared substrate that is `ready` and `preflight_status = passed` does not
  continue to surface a stale terminal `error`
- operators can distinguish current substrate state from historical failed
  attempts
- successful reruns do not leave misleading residue in issue-state or review
  summaries

## Current Evidence

- [issue-state.json](/Users/tyler/nexus/state/data/apps/dispatch/issues/dispatch-policy-4711165b-d2f/SPEC-259/issue-state.json)
  shows prepared substrate `substrate-a8ae5472b1cfd768e2342efd` in state
  `ready` with `preflight_status = passed`
- the same record still carries the stale `ENOTEMPTY` error from an earlier
  failed attempt, which is current-state residue rather than current truth
