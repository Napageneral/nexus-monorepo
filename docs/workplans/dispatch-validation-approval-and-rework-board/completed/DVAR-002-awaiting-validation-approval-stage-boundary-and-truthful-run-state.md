# DVAR-002 Awaiting Validation Approval Stage Boundary And Truthful Run State

## Goal

Stop treating approval-pending as a failed validation execution.

## Scope

- add `awaiting_validation_approval` as a first-class Dispatch stage
- update issue/run state persistence to reflect that stage truthfully
- ensure validation does not start while approval remains pending

## Acceptance

- a pending validation script stops the issue in
  `awaiting_validation_approval`
- no validation attempt is created while approval is pending
- issue state, run state, and review surfaces report the same stage truth
