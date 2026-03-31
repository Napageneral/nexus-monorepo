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

- no shared TikTok package exists today for either surface
- MoonSleep currently splits TikTok behavior across Business and Display APIs
- cleanroom proof with real TikTok credentials does not exist for either surface
- the old single-surface TikTok Ads spec was too coarse for MoonSleep parity

## Acceptance

1. a shared `tiktok-business` package exists and is installable
2. a shared `tiktok-display` package exists and is installable
3. setup, health, backfill, and monitor all work through Nex for both surfaces
4. `tiktok-business` preserves paid hierarchy and performance row families
5. `tiktok-display` preserves profile and video snapshot families
6. cleanroom validation proves real credentialed ingest for both surfaces
