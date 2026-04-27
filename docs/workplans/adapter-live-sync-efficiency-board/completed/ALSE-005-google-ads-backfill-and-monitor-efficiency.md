# ALSE-005 Google Ads Backfill And Monitor Efficiency

## Goal

Bring Google Ads live sync to a production-grade incremental posture instead of
using replay-safe broad windows in the hot loop.

## Status

Completed on April 27, 2026. Local implementation, live MoonSleep API proof,
hosted MoonSleep runtime upgrade, hosted real-credential smoke, and hosted
runtime benchmark passed.

## Scope Completed

- replaced the generic one-minute monitor loop with adapter-local per-family
  monitor state
- kept campaign hourly on the one-minute hot lane with a bounded two-hour tail
- moved campaign/ad-group/ad daily reports to a thirty-minute reconciliation
  lane with a bounded three-day tail
- moved account/access snapshots to a daily lane so
  `customers:listAccessibleCustomers` is no longer minute-scale work
- added monitor revision suppression before durable record emission
- cached the working no-`login-customer-id` posture after Google returns
  `USER_PERMISSION_DENIED`, avoiding repeated retry pairs for the same
  credential
- added a gated live MoonSleep benchmark for backfill and steady-state monitor
  behavior

## Evidence

Local tests:

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/google-ads
go test ./...
mkdir -p ./bin && go build -o ./bin/google-ads-adapter ./cmd/google-ads-adapter
```

Live MoonSleep benchmark:

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/google-ads
source ~/.config/moonsleep/load.sh
GOOGLE_ADS_LIVE_BENCHMARK=1 go test ./cmd/google-ads-adapter -run TestLiveGoogleAdsLocalBenchmark -count=1 -timeout=15m -v
```

Artifact:

- `/Users/tyler/nexus/state/artifacts/validation/google-ads-local-benchmark/google-ads-local-benchmark-2026-04-27T18-19-56Z.json`

Summary:

- 30-day backfill made `8` provider requests and emitted `186` records
- all five projection families were present:
  `account_access_snapshot`, `campaign_daily`, `ad_group_daily`, `ad_daily`,
  and `campaign_hourly`
- first monitor cycle made `7` provider requests and emitted `14` records
- simulated 10-minute steady monitor made `10` provider requests and emitted
  `0` unchanged records

## Acceptance

1. full Google Ads backfill remains correct for the supported acquisition
   families
2. the hot monitor lane no longer does multi-day replay by default
3. account/snapshot-style checks are no longer expensive minute-scale work in
   the live loop
4. hosted MoonSleep latency and load were measured after installing
   `google-ads@0.1.1`

## Hosted Proof

Hosted MoonSleep package upgrade:

- target runtime: `srv-1c4b077a-1f2` at `https://t-e86786c3-537.nexushub.sh`
- packaged artifact:
  `/Users/tyler/nexus/home/projects/nexus/packages/adapters/google-ads/dist/google-ads-0.1.1.tar.gz`
- package sha256:
  `0ca630d56ff6f6f1c14bd6958376ddbbf23be3d407c6e2177caeda63997b6a06`
- preflight artifact:
  `/Users/tyler/nexus/state/artifacts/validation/google-ads-hosted-upgrade/preflight-2026-04-27T20-35-51-890Z.json`
- upgrade artifact:
  `/Users/tyler/nexus/state/artifacts/validation/google-ads-hosted-upgrade/upgrade-2026-04-27T20-35-51-890Z.json`
- result: upgraded from active `0.1.0` to active `0.1.1`; package health
  reported healthy and adapter version `0.1.1`

Hosted real-credential adapter proof:

- artifact:
  `/Users/tyler/nexus/state/artifacts/validation/google-ads-hosted-upgrade/postvalidate-2026-04-27T20-36-44-801Z.json`
- all required Google Ads methods were registered
- MoonSleep Google Ads connection `97bd34d1-8073-4164-a435-0fe3c0eb7039`
  remained connected for account `3202290013`
- `adapters.connections.test` passed
- bounded hosted reads passed:
  `google-ads.customers.get` returned a customer summary and
  `google-ads.reporting.campaign_daily.list` returned `1` row for
  `2026-04-26`

Hosted runtime benchmark after the upgrade:

- artifact:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime-benchmark/moonsleep-hosted-runtime-benchmark-2026-04-27T20-37-08-072Z.json`
- samples per operation: `3`
- pressure window: `5` minutes
- all benchmarked runtime operations returned `0` errors
- adapter-pressure sample returned `0` Google Ads records; it saw only `1`
  Shopify customer record in the window
- host metrics were healthy at about `1.4%` CPU and about `147 KB/s` disk
  writes
- public runtime p50s were approximately `298ms` for `apps.list`, `401ms` for
  `jobs.runs.list`, `277ms` for `runtime.health`, `316ms` for
  `attribution.pipeline.status`, and `523ms` for `attribution.summary`

## Follow-Up

- continue to `ALSE-006` and `ALSE-007`; Google Ads is no longer the observed
  steady-state emitter
- public hosted URL latency remains above the sub-100ms product target even
  with adapter pressure quiet, so the remaining latency work should focus on
  runtime-side instrumentation/proxy/product-read cost rather than Google Ads
