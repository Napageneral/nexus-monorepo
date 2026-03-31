# TikTok Adapter Packages Board

This board tracks execution work for the TikTok adapter split in Nex.

Canonical inputs:

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/tiktok-business-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/tiktok-display-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-adapter-packages-board/completed/AAP-002-tiktok-adapter-split-business-and-display.md`
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

- `TAP-001`
- `TAP-002`
- `TAP-003`
- `TAP-004`
- `TAP-005`
- `TAP-006`
- `TAP-007`
- `TAP-008`

## Execution Order

The default sequence for this board is:

1. scaffold the shared `tiktok-business` package and install surfaces
2. land TikTok Business auth, advertiser binding, and health
3. land TikTok Business row mapping, backfill, and monitor behavior
4. scaffold the shared `tiktok-display` package and profile sync
5. land TikTok Display video sync and monitor behavior
6. build the shared cleanroom harness and credential path for both surfaces
7. validate `tiktok-business` against MoonSleep's active advertiser
8. validate `tiktok-display` against MoonSleep's connected display account and close the board

## Proof Artifacts

- TikTok Business retained cleanroom proof:
  `/Users/tyler/nexus/state/sandboxes/52569bc7-aa69-4fcf-bf14-4179cdef291b/artifacts/validation/tiktok-business-live/20260331T012109Z/tiktok-business-proof-summary.json`
- TikTok Business stable provider spot-check:
  `/Users/tyler/nexus/state/artifacts/validation/tiktok-business/provider-spotcheck-stable-20260331T013349Z.json`
- TikTok Display clean launcher proof:
  `/Users/tyler/nexus/state/sandboxes/112b4d07-d664-4364-b586-4562e5b1f3d4/artifacts/validation/tiktok-display-row-parity-live/20260331T022745Z/tiktok-display-proof-summary.json`
- TikTok Display stable provider spot-check:
  `/Users/tyler/nexus/state/artifacts/validation/tiktok-display/provider-spotcheck-stable-20260331T015930Z.json`
