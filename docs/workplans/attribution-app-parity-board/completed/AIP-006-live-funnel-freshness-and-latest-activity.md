# AIP-006 Live Funnel Freshness And Latest Activity

## Goal

Add the live-funnel and freshness reads that make the app usable as an
operator-facing system during active monitoring windows.

## Closeout

This slice is now live on hosted MoonSleep in `attribution@0.1.4` and later.
The app exposes:

- latest activity timestamps across paid, website, and backend inputs
- live funnel windows for `15m`, `60m`, and `24h`
- basic alert packaging
- pipeline freshness reads and latest decision timestamps

Hosted MoonSleep validation showed those reads returning real traffic and
outcome activity for `moonsleep-prod-shadow`.

## Acceptance

1. the app exposes latest activity timestamps across acquisition, website, and
   backend inputs
2. the funnel surface distinguishes materialized history from near-real-time
   freshness
3. operators can tell quickly whether attribution is keeping up
4. the hosted MoonSleep runtime proves the new reads under live traffic
