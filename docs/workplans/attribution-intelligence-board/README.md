# Attribution Intelligence Board

This board tracks execution work for the shared attribution intelligence layer
after the target-state canon is locked.

Canonical inputs:

- `docs/spec-driven-development-workflow.md`
- `docs/spec-standards.md`
- `docs/specs/attribution-intelligence-taxonomy.md`
- `docs/specs/attribution-intelligence-layer.md`
- `docs/validation/attribution-intelligence-click-to-outcome-proof-ladder.md`

Scope:

- canonical vocabulary and target-state alignment
- MoonSleep parity inventory for the core attribution domain
- adapter-first execution for acquisition, website, and backend inputs
- app-owned schema, jobs, reconciliation, and UI work
- validation lanes for end-to-end attribution proof

Status lanes:

- `not-started/`
- `in-progress/`
- `completed/`

## Current Status Snapshot

Completed:

- `AIL-001`
- `AIL-002`
- `AIL-003`
- `AIL-004`
- `AIL-005`
- `AIL-006`
- `AIL-007`

In progress:

- `AIL-008`

## Execution Order

The default sequence for this board is:

1. lock canon and taxonomy
2. inventory MoonSleep parity against the new canon
3. land shared acquisition and backend adapters
4. lock the website input package and install contract, then burn down the
   dedicated Website Input Package Board
5. land the attribution intelligence app database, jobs, and UI
6. prove the full click-to-outcome journey in cleanroom validation
7. port the highest-value MoonSleep attribution product surfaces into the app
   and validate the shared product on hosted MoonSleep and Devenir
