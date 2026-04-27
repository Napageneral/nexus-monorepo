# ALSE-005 Google Ads Backfill And Monitor Efficiency

## Goal

Bring Google Ads live sync to a production-grade incremental posture instead of
using replay-safe broad windows in the hot loop.

## Scope

- inspect family window planning in live monitor mode
- remove unnecessary minute-scale snapshot/access work from the hot path
- narrow hourly and daily report tails
- preserve correctness through explicit slower reconciliation where needed

## Acceptance

1. full Google Ads backfill remains correct for the supported acquisition
   families
2. the hot monitor lane no longer does multi-day replay by default
3. account/snapshot-style checks are no longer expensive minute-scale work in
   the live loop
4. hosted MoonSleep latency and load improve measurably after the Google Ads
   change

## Current Problem

Current monitor planning in
`/Users/tyler/nexus/home/projects/nexus/packages/adapters/google-ads/cmd/google-ads-adapter/main.go`
still fetches multiple families over replay-style windows on a one-minute
interval.

April 27, 2026 hosted evidence:

- Google Ads was not a top event source in the one-minute hosted counter sample
  after Shopify steady-state seeding
- the code still has the same monitor-window shape that needs correction:
  `planGoogleFamilyWindows()` uses replay-style monitor windows for hourly and
  daily families, and account/snapshot-style work remains in the one-minute
  monitor family list
- this makes Google Ads lower immediate priority than TikTok Business and Meta
  Ads, but still in scope before final hosted signoff
- the optional accessible-customers lookup has also previously surfaced Google
  developer quota pressure, so this ticket should avoid optional high-cost
  freshness checks in the hot loop

April 27, 2026 post-Shopify/TikTok/Meta evidence:

- after Shopify `0.1.2`, TikTok Business `0.1.1`, and Meta Ads `0.1.1` were
  all installed and quiet, Google Ads became the only remaining observed
  live-sync emitter
- hosted `adapter_instances.events_received` increased by `53` events over a
  seventy-five-second sample while Shopify, TikTok Business, and Meta Ads each
  had delta `0`
- hosted benchmark after Meta cleanup showed healthy host load at about `2.5%`
  CPU and about `11.8 KB/s` disk writes, so the remaining Google work is now
  about correctness and eliminating residual churn rather than fighting a
  saturated box
- the next implementation should follow the same adapter-local pattern used by
  Shopify, TikTok Business, and Meta Ads, not a global cursor abstraction
