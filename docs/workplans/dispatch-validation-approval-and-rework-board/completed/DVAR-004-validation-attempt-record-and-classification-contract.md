# DVAR-004 Validation Attempt Record And Classification Contract

## Goal

Persist one stable validation-attempt contract that downstream review can trust.

## Scope

- define `validation_attempt_id`
- persist attempt lifecycle and canonical artifact refs
- persist failure classification such as `candidate_defect`,
  `validation_environment_defect`, `interrupted`, `approval_missing`, and
  `inconclusive`

## Acceptance

- each validation execution produces one validation-attempt record
- post-validation review can read attempt status and classification without
  re-parsing shell output
- the attempt contract points to manifest and recording artifacts directly
