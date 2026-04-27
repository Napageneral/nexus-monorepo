# ALSE-004 Meta Ads Backfill And Monitor Efficiency

Status: complete as of April 27, 2026.

## Goal

Preserve Meta Ads correctness while replacing replay-heavy monitor windows with
a cheaper steady-state tail.

## Scope

- inspect family window planning for monitor mode
- separate snapshot cadence from report cadence where needed
- reduce hourly and daily replay windows in normal live monitor mode
- preserve a slower reconciliation path for late-arriving data

## Acceptance

1. full Meta Ads backfill remains correct and exhaustive for the supported
   families
2. the steady-state monitor lane no longer refetches multi-day windows every
   minute as its default behavior
3. late-arrival correctness remains explicitly covered by a slower
   reconciliation posture instead of the hot loop
4. hosted MoonSleep latency and load improve measurably after the Meta change

## Current Problem

Current monitor planning in
`/Users/tyler/nexus/home/projects/nexus/packages/adapters/meta-ads/cmd/meta-ads-adapter/main.go`
still uses replay-safe hourly and daily windows for the minute-scale monitor
lane.

April 27, 2026 hosted evidence:

- after Shopify was seeded into steady state, Meta Ads was the second-largest
  observed remaining adapter event source
- hosted `adapter_instances.events_received` increased by about `162` events in
  a one-minute sample
- monitor planning currently broadens monitor windows with
  `minTime(since, asOf.Add(-hourlyReplayWindow))` and
  `minTime(since, asOf.Add(-dailyReplayWindow))`
- that means even a fresh monitor cursor can still request the older replay
  boundary every minute instead of the tight incremental tail
- this ticket should replace that hot-loop replay with a narrow live tail plus
  an explicit slower reconciliation lane for late-arriving ad metrics

## Resolution

Implemented in `meta-ads` `0.1.1`:

- exhaustive backfill still uses the supported campaign snapshot, daily
  insight, and account-hourly families
- live monitor no longer uses the old seven-day daily and forty-eight-hour
  hourly replay windows on the one-minute loop
- account hourly is the one-minute hot lane with a two-hour lookback
- campaign, ad set, and ad daily reconciliation runs every thirty minutes with
  a seventy-two-hour lookback
- campaign snapshots run every thirty minutes
- adapter-local monitor state and revision hashes suppress unchanged logical
  rows before they hit runtime ingest

Hosted deployment and validation:

- packaged and published `meta-ads@0.1.1`
- installed it on the MoonSleep hosted runtime through direct runtime package
  upload/upgrade
- reconciled Frontdoor install status to active `0.1.1`
- removed the stale orphaned `0.1.0` monitor process, leaving one supervised
  `0.1.1` live-sync process

Proof:

- pre-change hosted counter sample showed Meta Ads at about `161` events per
  seventy-five seconds after Shopify and TikTok were quiet
- post-change hosted sample from `2026-04-27T16:11:05Z` to
  `2026-04-27T16:12:21Z` showed Meta Ads delta `0`
- the same post-change sample showed Shopify delta `0`, TikTok Business delta
  `0`, and Google Ads delta `53`, making Google Ads the remaining observed
  adapter emitter
- hosted public benchmark after Meta cleanup:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime-benchmark/moonsleep-hosted-runtime-benchmark-2026-04-27T16-12-50-964Z.json`
