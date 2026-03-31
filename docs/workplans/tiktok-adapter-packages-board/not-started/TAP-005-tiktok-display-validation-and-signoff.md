# TAP-005 TikTok Display Validation And Signoff

## Goal

Prove the Nex `tiktok-display` package against MoonSleep's connected display
account and close the TikTok board.

## Acceptance

1. `adapter.health` confirms the connected profile is readable
2. backfill emits profile and video rows
3. monitor emits new immutable arrivals when profile or video counters change
4. sampled rows match TikTok Display upstream responses
5. board docs are updated with retained proof artifacts and signoff
