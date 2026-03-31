# Google Ads Adapter Validation

Current validation includes local package proof plus retained MoonSleep
cleanroom validation.

## Local Proof

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/google-ads

go test ./...
mkdir -p ./bin
go build -o ./bin/google-ads-adapter ./cmd/google-ads-adapter
./bin/google-ads-adapter adapter.info
source ~/.config/moonsleep/load.sh
./bin/google-ads-adapter adapter.health --connection moonsleep-google-ads
```

## Retained Proof

- cleanroom proof:
  `/Users/tyler/nexus/state/sandboxes/ded684e9-16fc-48ea-9ba5-c9adfcb03d2d/artifacts/validation/google-ads-row-parity-live/20260331T031508Z/google-ads-proof-summary.json`
- cleanroom result:
  `/Users/tyler/nexus/state/sandboxes/ded684e9-16fc-48ea-9ba5-c9adfcb03d2d/artifacts/validation/google-ads-row-parity-live/20260331T031508Z/result.json`
- stable provider spot-check:
  `/Users/tyler/nexus/state/artifacts/validation/google-ads/provider-spotcheck-stable-20260331T032244Z.json`

## Notes

- the retained cleanroom proof confirmed `automatic_activation.monitor.started`
  on connection create and completed two replay-safe backfill passes against
  real MoonSleep Google Ads credentials
- retained records landed across all five Google Ads row families with
  `197` total immutable arrivals in the proof bundle
- the provider spot-check confirmed semantic row parity and derived-measure
  parity for sampled `account_access_snapshot`, `campaign_daily`,
  `ad_group_daily`, `ad_daily`, and `campaign_hourly` rows
