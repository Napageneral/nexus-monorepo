# Attribution App Parity Board

This board tracks the second-phase productization work for the Attribution
Intelligence app now that the shared adapter substrate, `web-signals`
control-plane app, and `web-journey` source adapter are live on hosted
MoonSleep.

Current execution note:

- this board is downstream of
  `/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-live-sync-efficiency-board/README.md`
  because the hosted MoonSleep runtime baseline is currently too slow for
  serious product iteration

Canonical inputs:

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-layer.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-taxonomy.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/web-signals-control-plane-and-web-adapter-family.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/attribution-intelligence/app/README.md`
- `/Users/tyler/nexus/home/projects/moonsleep-live-shadow-prep/analytics/build_models.py`
- `/Users/tyler/nexus/home/projects/moonsleep-live-shadow-prep/analytics/build_ops_cache.py`
- `/Users/tyler/nexus/home/projects/moonsleep-live-shadow-prep/workers/ops-internal/src/index.ts`
- `/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md`

Scope:

- inventory the current hosted attribution app surface against MoonSleep ops
- refine attribution heuristics and backend matching toward MoonSleep parity
- port the most valuable MoonSleep read models and KPI packaging into the app
- build the operator-facing ledger, review, and evidence surfaces
- validate the resulting app on hosted MoonSleep first and Devenir second

Status lanes:

- `not-started/`
- `in-progress/`
- `completed/`

## Current Status Snapshot

Completed:

- `AIP-001`
- `AIP-005`
- `AIP-006`

In progress:

- `AIP-004`

Not started:

- `AIP-002`
- `AIP-003`
- `AIP-007`
- `AIP-008`

## Current Product Baseline

The current hosted `attribution` app on MoonSleep already provides:

- scope management and bindings
- 30-day summary totals and top-channel reads
- paid fact rows
- daily funnel rows
- backend outcomes plus a row inspector
- pipeline freshness and replay
- a live browser UI at `/app/attribution/`

This board assumes that substrate is real and focuses on the remaining product
gap between that baseline and the existing MoonSleep ops experience.

It should not be treated as the primary active lane again until the hosted
adapter live-sync performance problem is closed.

## Execution Order

The default sequence for this board is:

1. inventory the live hosted app surface and lock the MoonSleep parity target
2. refine source heuristics and confidence semantics
3. port bridge and backend outcome matching logic
4. add compare-window KPI packaging and attribution strips
5. add live funnel freshness and latest-activity reads
6. build the inspectable ledger and review surfaces
7. add channel/source breakdowns and trend surfaces
8. validate the parity slice on hosted MoonSleep and then Devenir
