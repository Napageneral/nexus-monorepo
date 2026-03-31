# Meta Ads Row Parity Board

This board tracks the implementation and validation work needed to bring the
shared `meta-ads` package to the row-shaped attribution contract.

Canonical inputs:

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/meta-ads-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/proposals/attribution-adapters/meta-ads-record-mapping.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-adapter-packages-board/completed/AAP-001-meta-ads-package-parity.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md`

Scope:

- Meta Graph fetch-surface expansion
- row-family record builders
- revision-aware `external_record_id` mapping
- replay-safe backfill and monitor semantics
- MoonSleep-credential validation against real provider data

Status lanes:

- `not-started/`
- `in-progress/`
- `completed/`

## Current Status Snapshot

Completed:

- `MAP-001`
- `MAP-002`
- `MAP-003`
- `MAP-004`
- `MAP-005`

In Progress:

- none

Not Started:

- none

## Execution Order

The default sequence for this board is:

1. land the expanded Meta fetch surfaces and row-family builders
2. land revision-aware record identity and payload mapping
3. align backfill and monitor around replay-safe immutable arrivals
4. validate against real MoonSleep Meta credentials and parity-check sampled
   provider rows
5. sync package docs, validation corpus, and signoff
