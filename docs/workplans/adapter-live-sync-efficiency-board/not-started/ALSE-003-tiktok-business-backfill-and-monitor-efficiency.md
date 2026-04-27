# ALSE-003 TikTok Business Backfill And Monitor Efficiency

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
