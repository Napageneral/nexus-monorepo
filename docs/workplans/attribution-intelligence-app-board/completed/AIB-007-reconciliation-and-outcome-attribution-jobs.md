# AIB-007 Reconciliation And Outcome Attribution Jobs

## Goal

Implement the app-owned reconciliation jobs that join acquisition, website,
and backend facts into current outcome attribution rows.

## Acceptance

1. reconciliation jobs produce inspectable outcome-attribution rows
2. the current winning source decision is explicit
3. evidence, match method, and confidence remain inspectable
4. replay and recomputation are safe without mutating shared adapter records
