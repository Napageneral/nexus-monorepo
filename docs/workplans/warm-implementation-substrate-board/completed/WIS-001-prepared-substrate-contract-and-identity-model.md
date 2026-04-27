# WIS-001 Prepared Substrate Contract And Identity Model

## Goal

Define a first-class prepared-substrate contract that cleanly separates:

- sandbox runtime config
- sandbox image artifact
- repo-keyed warm implementation substrate

## Scope

- define the prepared-substrate fields needed for repo state, dependency state,
  preflight receipts, and provenance
- define how prepared-substrate identity differs from image identity
- define how runtime configs declare whether warm substrate startup is supported
- align the contract with existing sandbox and Dispatch nouns

## Acceptance

- there is one explicit prepared-substrate contract with stable fields
- image identity and prepared-substrate identity are distinct
- the contract is sufficient for Nex to explain exactly what warm state a
  worker sandbox started from
