# RAGV-001 Validation Profile Contract And Job Binding

## Goal

Replace raw Dispatch validation command arrays with a structured
`validation_profile` contract that can resolve to a reusable execution
primitive.

## Scope

- add a first-class validation-profile field to Dispatch policy
- define the profile contract for:
  - runner job binding
  - adapter requirements
  - connection requirements
  - resource-set requirements
  - proof-script and evidence requirements
- persist the selected profile in issue state and review state
- stop treating raw command lists as the primary operator-facing validation
  contract

## Acceptance

- a Dispatch policy can select a `validation_profile` without requiring raw
  proof command strings as the main canonical input
- issue state and review surfaces carry the selected profile id
- the profile can resolve to a reusable job definition or equivalent runner
  primitive without losing the higher-level operator-facing noun
