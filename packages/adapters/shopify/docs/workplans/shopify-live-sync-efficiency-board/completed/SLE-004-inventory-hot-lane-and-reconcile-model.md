# SLE-004 Inventory Hot Lane And Reconcile Model

## Goal

Define an inventory strategy that keeps minute-scale signal where it matters
without relying on minute-scale snapshot scans.

## Scope

- determine the best truly incremental inventory freshness signal Shopify
  exposes
- keep a hot inventory lane only if it can stay incremental and cheap
- add a slower reconcile lane for broader inventory repair if required
- ensure inventory revisions remain meaningful and deduped

## Acceptance

1. inventory no longer relies on hot-lane full snapshot scans
2. inventory hot-lane behavior is explicitly incremental or explicitly targeted
3. any broader inventory scan is moved to a slower reconcile lane
4. inventory record churn is materially lower on the hosted MoonSleep tenant

## Proof

- focused tests for inventory watermark and revision behavior
- cleanroom proof with bounded inventory quantity change
- hosted before/after pressure comparison

## Completion

Completed on April 27, 2026.

Implemented:

- inventory hot lane no longer depends on the old monitor-time `inventoryItems`
  snapshot scan behavior
- hot inventory monitor now reads changed `inventory_levels` by `location_ids`
  and `updated_at_min`
- the hot lane hydrates only the changed inventory items through a targeted
  GraphQL `nodes(ids: ...)` read before building canonical inventory records
- focused proof now covers the inventory-level hot lane request path and
  resulting emitted inventory record

Decision:

- no broad inventory reconcile lane is added to the hot monitor path
- a future slow reconcile ticket should be opened only if provider evidence
  shows inventory-level incrementality misses meaningful MoonSleep state
- hosted before/after pressure comparison remains covered by `SLE-007`
