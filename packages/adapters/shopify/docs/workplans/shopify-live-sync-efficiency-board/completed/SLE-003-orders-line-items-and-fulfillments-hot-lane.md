# SLE-003 Orders Line Items And Fulfillments Hot Lane

## Goal

Make the hot Shopify commerce lane truly incremental while preserving order and
bridge evidence correctness.

## Scope

- implement family-native incremental reads for `order`
- derive `line_item` only from changed orders
- implement incremental fulfillment reads
- remove parent-freshness-driven `line_item` churn
- preserve checkout bridge and attribution metadata

## Acceptance

1. orders use a real incremental watermark
2. line items are emitted only when the line-item revision actually changed
3. fulfillments use a real incremental watermark
4. bridge attributes remain intact on emitted order records

## Proof

- focused tests for order and line-item revision identity
- cleanroom hot-lane monitor proof with bounded order and fulfillment updates
- hosted before/after churn comparison for orders and line items

## Completion

Completed on April 27, 2026.

Implemented:

- order and fulfillment monitor reads now run on real family-specific
  incremental cursors inside the new scheduler
- line items are derived only from changed orders on the hot lane
- parent `order_updated_at` was removed from line-item revision identity
- no-change cycles now fall back to `last_poll_at - overlap` when no provider
  row has advanced `cursor_at`, making restart-after-downtime safer

Proof:

- focused tests for order cursoring and line-item duplicate suppression
- April 27, 2026 adapter-only benchmark showed `0` hot-lane churn during a
  `10m` no-change soak
- hosted before/after churn comparison remains covered by `SLE-007`
