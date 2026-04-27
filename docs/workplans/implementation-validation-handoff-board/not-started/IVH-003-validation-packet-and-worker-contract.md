# IVH-003 Validation Packet And Worker Contract

## Goal

Create an explicit validation packet and worker contract that combines the
candidate artifact, approved validation script, resolved profile, and resource
bindings.

## Scope

- define the validation-packet fields Dispatch must construct before
  `validating`
- make the validation worker consume that packet directly
- stop requiring the validation worker to reconstruct proof intent from issue
  state or shell commands alone
- fail validation early when the packet is incomplete

## Acceptance

- the validating stage receives one explicit packet containing the candidate
  artifact id, approved validation script, profile id, and resource bindings
- validation does not start when any required packet field is missing
- the same packet can be attached back to review state as the execution
  contract

