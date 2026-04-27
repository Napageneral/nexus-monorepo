# Google Ads Adapter Validation

**Spec:** `docs/specs/ADAPTER_SPEC_GOOGLE_ADS.md`  
**Workplan:** `docs/workplans/GOOGLE_ADS_ADAPTER_WORKPLAN.md`

## Shared Hosted Lifecycle Gate

For hosted package signoff, run the shared hosted lifecycle proof first.

Use
[Frontdoor Hosted Package Live Testing](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_HOSTED_PACKAGE_LIVE_TESTING.md)
for package publication, Frontdoor install, runtime token mint, and runtime
health before attempting the Google Ads-specific checks below.

For the final cross-package hosted signoff lane shared with Meta Ads, use
[Acquisition Adapters Hosted Cleanroom Signoff](/Users/tyler/nexus/home/projects/nexus/docs/validation/acquisition-adapters-hosted-cleanroom-signoff.md).

## Level 1: Package Contract

Pass when:

- `adapter.nexus.json` is valid
- package identity is `google-ads`
- package-local spec, workplan, validation, skill, and release flow exist
- `adapter.info` reflects the currently declared Google Ads package surface
- the first public provider-native read methods are present:
  `google-ads.customers.accessible.list`, `google-ads.customers.get`, and
  `google-ads.reporting.campaign_daily.list`

## Level 2: Build And Connection Health

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/google-ads

go test ./...
mkdir -p ./bin
go build -o ./bin/google-ads-adapter ./cmd/google-ads-adapter
./bin/google-ads-adapter adapter.info
source ~/.config/moonsleep/load.sh
./bin/google-ads-adapter adapter.health --connection moonsleep-google-ads
```

Pass when:

- `go test ./...` passes
- `go build -o ./bin/google-ads-adapter ./cmd/google-ads-adapter` passes
- `adapter.health` succeeds for a valid Nex-managed Google Ads connection
- runtime `connection_id` remains the sole operational identity
- provider-native read methods resolve through the same runtime connection model

## Level 3: Historical Ingest

Pass when:

- `records.backfill` emits canonical `record.ingest`
- the adapter emits `account_access_snapshot`, `campaign_daily`,
  `ad_group_daily`, `ad_daily`, and `campaign_hourly`
- Google Ads customer, campaign, ad group, and ad ids remain provider metadata
- `metadata.row` preserves the provider payload and `metadata.derived` preserves
  helper measures without dropping the preserved row contract

## Level 4: Freshness And Durability

Pass when:

- `adapter.monitor.start` emits the same canonical record model as backfill
- package install and restart do not lose the connection identity
- replay windows do not explode unchanged rows into duplicate immutable records

## Level 5: Real MoonSleep Proof

Pass when:

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

## Definition Of Done

The Google Ads adapter is green when:

1. package contract is valid
2. build and connection health are green
3. historical ingest is canonical and row-shaped
4. monitor, replay safety, and restart durability remain aligned
5. the retained MoonSleep proof and provider parity artifact both pass
