# EEA-003 Slow Maintenance Loops And Warehouse Repair Split

## Goal

Split heavyweight maintenance and repair work out of Eve's hot ingest path so
live sync stays fast while contact and warehouse correctness remain truthful.

## Scope

- AddressBook hydration loop
- contact merge and participant repair loop
- chat repair loop
- conversation repair loop
- warehouse repair entrypoints and bookkeeping

## Acceptance

- hot-path ingest depends only on delta acquisition and canonical emit
- slow maintenance work can lag without breaking live message truth
- maintenance loops are explicit, restart-safe, and observable
- warehouse repair no longer hides inside the hot loop

## Validation

- focused repair-loop tests
- fixture-backed contact and participant repair proofs
- `go test ./...`
- `git diff --check`
