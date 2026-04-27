# AIP-001 Current Surface Inventory And MoonSleep Parity Contract

## Goal

Inventory the currently deployed Attribution Intelligence app surface on hosted
MoonSleep, compare it directly against MoonSleep ops, and lock the parity
target for the next phase.

## Acceptance

1. the current hosted app reads, UI sections, and scope/binding model are
   documented from the live MoonSleep server rather than from stale memory
2. the MoonSleep ops surfaces we intend to port are named explicitly and mapped
   to target app reads or UI sections
3. the board has a clear split between work that is already solved in shared
   data collection and work that remains purely app/read-model/UI work
4. the result is concrete enough that subsequent tickets can implement parity
   without reopening product-boundary questions

## Live MoonSleep Baseline

Hosted runtime:

- server: `srv-1c4b077a-1f2`
- runtime: `https://t-e86786c3-537.nexushub.sh`
- apps: `attribution 0.1.3`, `web-signals 0.1.2`
- active scope: `moonsleep-prod-shadow`

Live app surface currently proven on the hosted runtime:

- `attribution.scopes.list`
- `attribution.bindings.list`
- `attribution.summary`
- `attribution.funnel`
- `attribution.ad-facts.list`
- `attribution.outcomes.list`
- `attribution.outcomes.get`
- `attribution.pipeline.status`
- `attribution.pipeline.trigger`
- browser UI at `/app/attribution/`

Current hosted MoonSleep bindings on `moonsleep-prod-shadow`:

- acquisition: `meta-ads`
- acquisition: `google-ads`
- acquisition: `tiktok-business`
- website: `web-journey`
- backend: `shopify`

Current hosted MoonSleep baseline from the live app:

- 30-day totals are real and non-zero
- top channels and paid fact rows are real
- daily funnel rows are real
- backend outcome rows and row inspector are real
- pipeline counts and replay are real

This means the product is already beyond substrate-only. The remaining gap is
product depth, not missing connections.

## MoonSleep Ops Surfaces To Port

Highest-value MoonSleep surfaces to port first:

- compare-window KPI cards and deltas
- attribution strip / coverage summary
- live funnel freshness and latest activity
- inspectable attribution ledger with review-oriented filtering
- channel and source breakdowns with trajectory packaging

Canonical MoonSleep references:

- `/Users/tyler/nexus/home/projects/moonsleep-live-shadow-prep/analytics/build_models.py`
- `/Users/tyler/nexus/home/projects/moonsleep-live-shadow-prep/analytics/build_ops_cache.py`
- `/Users/tyler/nexus/home/projects/moonsleep-live-shadow-prep/workers/ops-internal/src/index.ts`

## Current Mapping To Nex App Surfaces

Already solved in shared collection and materialization:

- acquisition facts from `meta-ads`, `google-ads`, and `tiktok-business`
- website journey facts from `web-journey`
- backend outcomes from `shopify`
- scope binding model
- app-owned marts, outcome decisions, and replay-safe pipeline

Still app/read-model/UI work:

- richer KPI packaging on top of current marts
- richer attribution coverage packaging
- richer freshness and live-funnel packaging
- ledger and review surfaces
- more opinionated channel/source read models

## Parity Contract

The next phase should not reopen adapter or website-ingest boundaries.

The contract is:

- keep the current shared adapters and `web-signals` / `web-journey` family
- keep `attribution` as the app that binds acquisition, website, and backend
  sources
- port the most valuable MoonSleep operator surfaces into app-owned methods and
  UI sections
- validate first on hosted MoonSleep, then on Devenir, with no
  MoonSleep-specific branching in the product shape
