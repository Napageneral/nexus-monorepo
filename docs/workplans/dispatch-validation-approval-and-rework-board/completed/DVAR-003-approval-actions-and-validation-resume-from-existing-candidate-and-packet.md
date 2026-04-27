# DVAR-003 Approval Actions And Validation Resume From Existing Candidate And Packet

## Goal

Let approval move the same issue forward without forcing a fresh implementation
attempt.

## Scope

- add explicit approve and reject actions for validation script revisions
- resume `validating` from the existing candidate artifact and validation
  packet after approval
- keep rejection as a review outcome rather than a validation execution

## Acceptance

- approving a pending packet can resume validation on the same lineage
- rejecting a packet preserves candidate and packet history without creating a
  fake validation failure
- no re-implementation is required when only approval was missing
