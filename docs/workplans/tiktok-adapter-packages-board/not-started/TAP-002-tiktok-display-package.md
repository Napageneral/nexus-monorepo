# TAP-002 TikTok Display Package

## Goal

Land the shared `tiktok-display` package for Nex.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/tiktok-display-adapter.md`

## Current Gap

- no shared `tiktok-display` package exists today
- MoonSleep parity is only implemented inside MoonSleep-specific code
- no Nex cleanroom proof exists yet for real TikTok Display credentials

## Acceptance

1. a shared `tiktok-display` package exists and is installable
2. setup, health, backfill, and monitor all work through Nex
3. `profile_snapshot` and `video_snapshot` are emitted with provider-native ids
4. real cleanroom validation proves parity against MoonSleep's connected display account
