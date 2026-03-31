# TAP-007 TikTok Business MoonSleep Validation

## Goal

Prove the Nex `tiktok-business` package against MoonSleep's live advertiser.

## Outcome

TikTok Business is proven in cleanroom against MoonSleep's live advertiser.

Evidence:

- retained cleanroom proof:
  `/Users/tyler/nexus/state/sandboxes/52569bc7-aa69-4fcf-bf14-4179cdef291b/artifacts/validation/tiktok-business-live/20260331T012109Z/tiktok-business-proof-summary.json`
- stable provider spot-check:
  `/Users/tyler/nexus/state/artifacts/validation/tiktok-business/provider-spotcheck-stable-20260331T013349Z.json`

The retained proof landed `494` records across all seven required families:

- `campaign_snapshot`
- `campaign_daily`
- `adgroup_snapshot`
- `adgroup_daily`
- `ad_snapshot`
- `ad_daily`
- `advertiser_hourly`

## Acceptance

1. `adapter.health` confirms the advertiser is readable
2. backfill emits hierarchy and performance row families
3. monitor emits additional immutable arrivals when upstream rows restate
4. sampled rows match TikTok Business upstream responses

## Notes

- the retained backfill run completed and the records ledger stabilized, but the
  run metadata still carries `lease_expired:2026-03-31T01:24:13.243Z` in
  `run.error`; that is treated as queue bookkeeping noise because the cleanroom
  proof still completed and the provider-row artifacts were validated
