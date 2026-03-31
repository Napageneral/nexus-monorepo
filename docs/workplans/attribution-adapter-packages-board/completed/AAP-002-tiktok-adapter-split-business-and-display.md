# AAP-002 TikTok Adapter Split Business And Display

## Goal

Land the shared TikTok adapter set in Nex as two separate packages:

- `tiktok-business`
- `tiktok-display`

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/tiktok-business-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/tiktok-display-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/tiktok-adapter-packages-board/README.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-intelligence-board/in-progress/AIL-002-moonsleep-parity-matrix-for-core-attribution.md`

## Current Gap

- closed

## Acceptance

1. a shared `tiktok-business` package exists and is installable
2. a shared `tiktok-display` package exists and is installable
3. setup, health, backfill, and monitor all work through Nex for both surfaces
4. `tiktok-business` preserves paid hierarchy and performance row families
5. `tiktok-display` preserves profile and video snapshot families
6. cleanroom validation proves real credentialed ingest for both surfaces

## Outcome

Both shared TikTok packages now exist and are validated through Nex cleanrooms
with MoonSleep credentials.

Business proof:

- `/Users/tyler/nexus/state/sandboxes/52569bc7-aa69-4fcf-bf14-4179cdef291b/artifacts/validation/tiktok-business-live/20260331T012109Z/tiktok-business-proof-summary.json`
- `/Users/tyler/nexus/state/artifacts/validation/tiktok-business/provider-spotcheck-stable-20260331T013349Z.json`

Display proof:

- `/Users/tyler/nexus/state/sandboxes/112b4d07-d664-4364-b586-4562e5b1f3d4/artifacts/validation/tiktok-display-row-parity-live/20260331T022745Z/tiktok-display-proof-summary.json`
- `/Users/tyler/nexus/state/artifacts/validation/tiktok-display/provider-spotcheck-stable-20260331T015930Z.json`
