# ALSE-002 Shopify Backfill And Monitor Efficiency

## Goal

Turn Shopify from the clearest load amplifier into a production-grade
incremental source without losing correctness.

The package-local canonical spec and execution board for this work are now:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/specs/SHOPIFY_INCREMENTAL_LIVE_SYNC_AND_RECONCILE_MODEL.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/workplans/shopify-live-sync-efficiency-board/README.md`

## Scope

- inspect current Shopify backfill and monitor family behavior
- split hot-path monitor families from slower snapshot families
- remove minute-by-minute snapshot scans from the normal monitor lane
- suppress unchanged logical rows before they create new durable records
- preserve the order and bridge evidence needed by attribution

## Acceptance

1. full Shopify backfill remains exhaustive across the supported family set
2. live Shopify monitor no longer snapshot-scans customers, products,
   collections, and inventory every minute
3. hot-path freshness for orders and downstream attribution evidence remains
   trustworthy
4. unchanged Shopify logical rows do not create new emitted records
5. hosted MoonSleep CPU, disk write pressure, and cheap-read latency improve
   materially after the Shopify change

## Current Problem

Today Shopify monitor calls all major families every minute from
`/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/cmd/shopify-adapter/main.go`,
and several families intentionally drop into local snapshot scans in
`/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/cmd/shopify-adapter/tier1_projection.go`.

The `ALSE-001` hosted baseline made the impact visible on the live MoonSleep
server:

- Shopify was the top writer in the recent-hour pressure census at `50` records
- the hot Shopify families in that window were `customer`, `line_item`,
  `fulfillment`, `inventory`, `order`, and `product`
- several families already show revision churn that is higher than the count of
  distinct logical rows, especially `product`, `inventory`, and `customer`
- the same benchmark window showed the host at about `97%` CPU and about
  `23.4 MB/s` disk write bandwidth

That means this ticket should not just narrow polling frequency. It must also
reduce avoidable revision-driven record emission.

## Validation Focus

- staged backfill proof
- live monitor proof
- hosted MoonSleep before/after latency comparison

## Progress

April 27, 2026 package-local proof:

- `/Users/tyler/nexus/state/sandboxes/6bab0655-3bc7-4513-bee8-44615bdc4360/artifacts/validation/shopify-adapter-benchmark/20260427T140738Z/shopify-adapter-benchmark.json`
- packaged Shopify adapter installed into a fresh runtime-managed cleanroom
- 30-day MoonSleep backfill emitted `8577` records in `34749ms`
- `10m` live monitor soak captured `10` snapshots with `0` total record delta
- family deltas stayed `0` for `order`, `line_item`, `fulfillment`,
  `inventory`, `customer`, `product`, `collection`, `discount`, and
  `marketing`

Local source also now uses `last_poll_at - overlap` as the fallback `since`
checkpoint when a family has no provider row yet to advance `cursor_at`. That
keeps the no-change path cheap while improving restart-after-downtime safety.

Remaining before closing this board-level ticket:

- package/install the latest local Shopify patch on hosted MoonSleep
- rerun hosted MoonSleep latency and adapter-pressure proof with the full
  adapter set active

April 27, 2026 hosted deployment proof:

- Shopify `0.1.2` package was published and installed onto the MoonSleep hosted
  runtime
- active hosted process path:
  `/opt/nex/state/packages/installed/adapter/shopify/releases/0.1.2/bin/shopify-adapter`
- first run exposed a stale-state operational gap: the hosted
  `monitor-state.json` still had April 10, 2026 cursors, so the monitor began a
  large catchup instead of a cheap steady-state tail
- after seeding the hosted Shopify monitor cursor to the current steady-state
  point, Shopify emitted `0` new durable records in the immediate two-minute
  sample, and its `adapter_instances.events_received` counter had `0` delta in
  a one-minute follow-up sample
- public-runtime benchmark after the seed:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime-benchmark/moonsleep-hosted-runtime-benchmark-2026-04-27T15-23-33-328Z.json`
- on-server localhost benchmark after the seed:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime-benchmark/moonsleep-runtime-localhost-benchmark-2026-04-27T15-27-00Z.json`

Remaining before closing:

- replace the manual hosted cursor seed with an explicit deployment/migration
  policy for stale live-monitor state
- decide whether stale live-monitor gaps should auto-schedule a bounded
  reconciliation/backfill rather than letting the one-minute monitor perform a
  multi-day catchup inline
- restore/replay attribution app processing only after adapter hot-loop pressure
  is controlled
