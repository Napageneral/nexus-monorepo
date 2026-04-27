# ALSE-003 TikTok Business Backfill And Monitor Efficiency

Status: complete as of April 27, 2026.

## Goal

Reduce TikTok Business live-sync cost to an incremental production tail instead
of a bounded replay loop.

## Scope

- inspect snapshot-family cadence in live monitor mode
- narrow the monitor replay window and report-window planning
- keep exhaustive historical backfill semantics intact
- suppress unchanged snapshot emissions where possible

## Acceptance

1. full TikTok Business backfill still covers the supported snapshot and report
   families
2. the steady-state monitor lane no longer replays seven days of work every
   minute
3. snapshot refresh cadence is explicit and cheaper than the hot report tail
4. hosted MoonSleep latency and load improve measurably after the TikTok
   Business change

## Current Problem

Current monitor behavior in
`/Users/tyler/nexus/home/projects/nexus/packages/adapters/tiktok-business/cmd/tiktok-business-adapter/ingest.go`
uses a one-minute interval and replays a seven-day window on every cycle while
also fetching snapshot families.

April 27, 2026 hosted evidence:

- after Shopify was seeded into steady state, TikTok Business became the
  largest observed remaining adapter event source
- hosted `adapter_instances.events_received` increased by about `405` events in
  a one-minute sample
- the current monitor code sets `tiktokBusinessMonitorReplayWindow` to seven
  days and calls `fetchTikTokBusinessBackfill()` from
  `since - tiktokBusinessMonitorReplayWindow` on every one-minute monitor
  cycle
- this ticket should be next after Shopify because it is now the clearest
  minute-scale duplicate/skipped ingest source on the MoonSleep server

## Resolution

Implemented in `tiktok-business` `0.1.1`:

- exhaustive backfill still uses the supported snapshot and report families
- live monitor no longer calls broad backfill from a seven-day replay floor
- advertiser hourly runs as the one-minute hot lane with a two-hour lookback
- campaign, ad group, and ad daily reconciliation runs every thirty minutes
  with a seventy-two-hour lookback
- campaign, ad group, and ad snapshots run every thirty minutes
- adapter-local monitor state and revision hashes suppress unchanged logical
  rows before they hit runtime ingest

Hosted deployment and validation:

- packaged and published `tiktok-business@0.1.1`
- installed it on the MoonSleep hosted runtime through direct runtime package
  upload/upgrade after Frontdoor's shared-staging upgrade path returned a
  missing staged tarball error
- reconciled Frontdoor install status to active `0.1.1`
- restarted TikTok live sync and removed stale duplicate monitor processes
  from the old `0.1.0` release

Proof:

- pre-change hosted counter sample showed TikTok Business at about `405`
  `adapter_instances.events_received` events per minute after Shopify was
  quiet
- post-change hosted sample from `2026-04-27T16:01:11Z` to
  `2026-04-27T16:02:26Z` showed TikTok Business delta `0`
- the same post-change sample showed Shopify delta `0`, Meta Ads delta `161`,
  and Google Ads delta `53`, making Meta Ads the next highest offender
- hosted public benchmark artifact:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime-benchmark/moonsleep-hosted-runtime-benchmark-2026-04-27T16-03-02-860Z.json`

Local MoonSleep live-API proof on April 27, 2026:

- added a gated live benchmark harness at
  `/Users/tyler/nexus/home/projects/nexus/packages/adapters/tiktok-business/cmd/tiktok-business-adapter/live_benchmark_test.go`
  so normal unit tests stay offline while operator-initiated proofs can use
  the real MoonSleep TikTok credential environment
- `go test ./...` passes with the live benchmark skipped by default
- `TIKTOK_BUSINESS_LIVE_BENCHMARK=1` benchmark passed against the real
  MoonSleep TikTok Business API in `40.96s`
- current thirty-day backfill covered all supported families and produced
  `1,636` unique records from `46` API requests:
  `campaign_snapshot`, `adgroup_snapshot`, `ad_snapshot`, `campaign_daily`,
  `adgroup_daily`, `ad_daily`, and `advertiser_hourly`
- legacy monitor emulation of the old seven-day full replay cycle produced
  `406` records from `15` API requests in one cycle, which projects to `150`
  requests and `4,060` records over ten one-minute ticks
- current first monitor cycle touched all seven monitor lanes with `7` API
  requests and `146` records
- current simulated ten-minute steady-state monitor used `10` API requests,
  all to `AUCTION_ADVERTISER`, and emitted `0` records because no changed
  hourly rows were present in the hot window
- binary smoke with an injected runtime context returned connected health for
  `local-moonsleep-tiktok-business`
- local benchmark artifact:
  `/Users/tyler/nexus/state/artifacts/validation/tiktok-business-local-benchmark/tiktok-business-local-benchmark-2026-04-27T16-33-32Z.json`
