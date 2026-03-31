# TAP-001 TikTok Business Package

## Goal

Land the shared `tiktok-business` package for Nex.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/tiktok-business-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-intelligence-board/in-progress/AIL-002-moonsleep-parity-matrix-for-core-attribution.md`

## Current Gap

- no shared `tiktok-business` package exists today
- MoonSleep parity is only implemented inside MoonSleep-specific code
- no Nex cleanroom proof exists yet for real TikTok Business credentials

## Acceptance

1. a shared `tiktok-business` package exists and is installable
2. setup, health, backfill, and monitor all work through Nex
3. hierarchy and performance row families are emitted at the required grains
4. real cleanroom validation proves parity against MoonSleep's active advertiser
