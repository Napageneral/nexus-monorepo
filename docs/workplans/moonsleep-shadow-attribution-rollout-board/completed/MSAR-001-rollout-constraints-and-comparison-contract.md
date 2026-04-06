# MSAR-001 Rollout Constraints And Comparison Contract

## Goal

Define the operational rules for the MoonSleep shadow rollout before any live
site integration work proceeds.

## Hard Constraints

1. do not modify the existing MoonSleep attribution path first
2. do not add any awaited network call on the buy-button or checkout path
3. do not remove or rename the current `ms_*` bridge attributes during shadow
   rollout
4. keep the new website-input SDK behind a clear env flag or shadow-mode gate
5. deploy the shadow integration to a separate Vercel project first

## Comparison Window

- target one sustained side-by-side window of roughly `12 hours`
- compare:
  - sessions
  - product views
  - CTA clicks
  - checkout/handoff starts
  - website-to-Shopify bridge survival
  - Shopify order truth
  - attributed channel mix
  - attributed revenue

## Acceptance

1. the rollout contract names the no-latency rule explicitly
2. the comparison metrics are fixed before implementation
3. the first deployment target is a separate Vercel site
4. live MoonSleep production shadowing is treated as a later gated step

## Status

Completed. The rollout lane now treats the no-latency checkout rule and the
roughly `12 hour` side-by-side comparison window as fixed constraints.
