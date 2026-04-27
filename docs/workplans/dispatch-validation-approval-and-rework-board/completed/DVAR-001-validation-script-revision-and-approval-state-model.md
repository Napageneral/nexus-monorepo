# DVAR-001 Validation Script Revision And Approval State Model

## Goal

Make validation script revisions and approval status first-class Dispatch nouns.

## Scope

- define `validation_script_revision_id`
- define approval-state storage and transitions
- persist approval metadata alongside candidate and packet state
- remove ambiguous approval inference from ad hoc status fields

## Acceptance

- issue state can name one current validation script revision
- approval status is canonically `pending`, `approved`, or `rejected`
- approval metadata is queryable without inspecting raw logs
- no schema introduces a `kind` field
