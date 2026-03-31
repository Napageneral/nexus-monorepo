# TAP-004 TikTok Business MoonSleep Validation

## Goal

Prove the Nex `tiktok-business` package against MoonSleep's live advertiser.

## Acceptance

1. `adapter.health` confirms the advertiser is readable
2. backfill emits hierarchy and performance row families
3. monitor emits additional immutable arrivals when upstream rows restate
4. sampled rows match TikTok Business upstream responses
