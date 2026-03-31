# Attribution Intelligence App Board

This board tracks the implementation work for the attribution intelligence app
package after the website-input contract and shared adapter substrate are
defined.

Canonical inputs:

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-layer.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-taxonomy.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-website-input-package-and-install-contract.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-intelligence-board/completed/AIL-006-attribution-intelligence-app-schema-jobs-and-ui.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md`

Scope:

- app package boundary and manifest
- dedicated app database schema and migrations
- input bindings and operator setup
- acquisition, website, and backend fact materialization
- reconciliation and outcome attribution jobs
- operator-facing UI and read models

Status lanes:

- `not-started/`
- `in-progress/`
- `completed/`

## Current Status Snapshot

Completed:

- `AIB-001`
- `AIB-002`
- `AIB-003`
- `AIB-004`
- `AIB-005`
- `AIB-006`
- `AIB-007`
- `AIB-008`

Validation evidence:

- focused processor proof:
  `/Users/tyler/nexus/home/projects/nexus/packages/apps/attribution-intelligence/app/pipeline/processor.test.ts`
- package contract validation:
  `nexus package validate /Users/tyler/nexus/home/projects/nexus/packages/apps/attribution-intelligence/app`
- app-install cleanroom proof bundle:
  `/Users/tyler/nexus/state/sandboxes/a78393c6-1074-4098-8802-f007b4c19d15/artifacts/validation/attribution-app-install-live/20260331T173351Z/attribution-app-proof-summary.json`
- end-to-end click-to-outcome proof:
  `/Users/tyler/nexus/home/projects/nexus/docs/validation/attribution-intelligence-click-to-outcome-proof-ladder.md`

## Execution Order

The default sequence for this board is:

1. lock the app package boundary and manifest
2. land the dedicated database schema and migrations
3. implement input bindings and operator setup
4. materialize acquisition facts from shared adapter records
5. materialize website input facts and session-source projections
6. materialize backend outcomes and bridge extractions
7. implement reconciliation and outcome attribution jobs
8. build the operator UI and read models
