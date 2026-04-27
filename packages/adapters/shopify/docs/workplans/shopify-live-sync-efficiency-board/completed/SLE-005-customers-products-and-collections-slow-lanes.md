# SLE-005 Customers Products And Collections Slow Lanes

## Goal

Move non-hot Shopify families to explicit incremental slow lanes instead of
letting them degrade the hot monitor loop.

## Scope

- implement incremental customer lane
- implement incremental product lane
- implement incremental collection lane
- move any remaining weak-provider-cursor repair into slower reconcile passes

## Acceptance

1. customers no longer use monitor-time snapshot scans
2. products no longer use monitor-time snapshot scans
3. collections no longer use monitor-time snapshot scans
4. each family has an explicit incremental lane or reconcile lane

## Proof

- focused tests for customer, product, and collection watermark behavior
- cleanroom proof with bounded row changes
- hosted before/after pressure comparison

## Completion

Completed on April 27, 2026.

Implemented:

- customers, products, and collections no longer use monitor-time snapshot
  scans
- each family now runs on its own incremental scheduler lane and persisted
  family cursor
- focused tests now assert incremental `updated_at` queries for all three
  families
- no-change cycles use the persisted `last_poll_at` checkpoint while waiting
  for a provider row to advance `cursor_at`

Proof:

- focused incremental query tests for customer, product, and collection
- April 27, 2026 adapter-only benchmark showed no slow-lane churn in a `10m`
  no-change soak
- hosted before/after pressure comparison remains covered by `SLE-007`
