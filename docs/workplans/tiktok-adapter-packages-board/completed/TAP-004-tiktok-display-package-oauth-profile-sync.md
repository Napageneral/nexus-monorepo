# TAP-004 TikTok Display Package OAuth Profile Sync

## Goal

Create the shared `tiktok-display` package and implement Display OAuth plus
profile snapshot sync.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/tiktok-display-adapter.md`
- `/Users/tyler/nexus/home/projects/moonsleep-v1/workers/meta-capi/src/index.ts`

## Current Gap

- no shared `tiktok-display` package exists today
- there is no Display OAuth or profile-sync surface in Nex
- later video-sync work has no package scaffold to land on

## Acceptance

1. a shared `tiktok-display` package exists and is installable
2. Display OAuth can be completed through Nex
3. `adapter.health` confirms the connected profile is readable
4. `profile_snapshot` is emitted with provider-native profile identifiers and
   metadata
