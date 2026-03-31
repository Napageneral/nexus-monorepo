# TikTok Adapter Packages Board

This board tracks execution work for the TikTok adapter split in Nex.

Canonical inputs:

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/tiktok-business-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/tiktok-display-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-adapter-packages-board/in-progress/AAP-002-tiktok-adapter-split-business-and-display.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md`

Scope:

- shared `tiktok-business` adapter package
- shared `tiktok-display` adapter package
- cleanroom validation with real MoonSleep credentials

Status lanes:

- `not-started/`
- `in-progress/`
- `completed/`

## Current Status Snapshot

Completed:

- none

In Progress:

- `TAP-001`

Not Started:

1. `TAP-002`
2. `TAP-003`
3. `TAP-004`
4. `TAP-005`

## Execution Order

The default sequence for this board is:

1. land the shared `tiktok-business` package contract and package skeleton
2. land the shared `tiktok-display` package contract and package skeleton
3. build the shared cleanroom harness and credential path for both surfaces
4. validate `tiktok-business` against MoonSleep's active advertiser
5. validate `tiktok-display` against MoonSleep's connected display account and close the board
