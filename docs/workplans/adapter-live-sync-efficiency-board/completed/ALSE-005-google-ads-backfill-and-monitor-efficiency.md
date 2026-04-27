# ALSE-005 Google Ads Backfill And Monitor Efficiency

## Goal

Bring Google Ads live sync to a production-grade incremental posture instead of
using replay-safe broad windows in the hot loop.

## Status

Completed locally on April 27, 2026.

Hosted package installation and final MoonSleep runtime soak remain downstream
of this ticket.

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
4. hosted MoonSleep latency and load can now be measured after installing
   `google-ads@0.1.1`

## Follow-Up

- package and install `google-ads@0.1.1` on the hosted MoonSleep runtime
- rerun the hosted adapter-pressure counter and public/runtime-local latency
  benchmark
- continue to `ALSE-006` and `ALSE-007` only after hosted Google Ads is quiet
