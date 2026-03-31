# TAP-003 TikTok Business Row Mapping Backfill And Monitor

## Goal

Implement TikTok Business provider-row mapping, backfill, and monitor behavior
for the shared `tiktok-business` package.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/tiktok-business-adapter.md`
- `/Users/tyler/nexus/home/projects/moonsleep-v1/analytics/sync.py`

## Current Gap

- the package does not yet emit the required snapshot and report row families
- MoonSleep's 30-day daily chunking and 1-day hourly chunking are not yet
  reproduced in Nex
- backfill and monitor have not yet been made replay-safe for TikTok Business

## Acceptance

1. `campaign_snapshot`, `adgroup_snapshot`, `ad_snapshot`, `campaign_daily`,
   `adgroup_daily`, `ad_daily`, and `advertiser_hourly` are emitted as
   row-shaped records
2. provider-native fields and ids are preserved in the emitted payloads
3. backfill uses MoonSleep-parity chunking for daily and hourly report pulls
4. monitor emits the same contract as backfill with replay-safe recent windows
