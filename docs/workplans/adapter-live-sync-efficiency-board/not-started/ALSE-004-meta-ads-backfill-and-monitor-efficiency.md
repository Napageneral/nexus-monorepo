# ALSE-004 Meta Ads Backfill And Monitor Efficiency

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
