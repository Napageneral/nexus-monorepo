# Shopify Adapter Validation

**Spec:** `docs/specs/ADAPTER_SPEC_SHOPIFY.md`
**Workplan:** `docs/workplans/SHOPIFY_ADAPTER_WORKPLAN.md`

## Current Proof Lanes

Current retained proof roots:

- install/connect + provider-read + backfill/monitor proof:
  `/Users/tyler/nexus/state/sandboxes/6abd1e69-40a8-4127-aa4c-ad8ac090403a/artifacts/validation/shopify-live-cleanroom/20260403T195625Z/shopify-proof-summary.json`
- incremental monitor proof:
  `/Users/tyler/nexus/state/sandboxes/6abd1e69-40a8-4127-aa4c-ad8ac090403a/artifacts/validation/shopify-live-cleanroom/20260403T195625Z/shopify-ingest-monitor.proof.json`
- cleanroom result:
  `/Users/tyler/nexus/state/sandboxes/6abd1e69-40a8-4127-aa4c-ad8ac090403a/artifacts/validation/shopify-live-cleanroom/20260403T195625Z/result.json`
- mounted-capability agent-use proof:
  `/Users/tyler/nexus/state/sandboxes/ca8d8c11-7428-4276-8d1d-189b0895d837/artifacts/validation/shopify-agent-proof/20260403T152519Z/shopify-agent-proof-summary.json`
- agent-use proof result:
  `/Users/tyler/nexus/state/sandboxes/ca8d8c11-7428-4276-8d1d-189b0895d837/artifacts/validation/shopify-agent-proof/20260403T152519Z/result.json`
- agent-use direct read:
  `/Users/tyler/nexus/state/sandboxes/ca8d8c11-7428-4276-8d1d-189b0895d837/artifacts/validation/shopify-agent-proof/20260403T152519Z/shopify-graphql-query.direct-proof.json`
- retained row-parity proof:
  `/Users/tyler/nexus/state/sandboxes/bf043ac9-5575-49ea-8ecd-4ada02c1e3ab/artifacts/validation/shopify-row-parity-live/20260331T134606Z/shopify-proof-summary.json`
- retained provider spot-check:
  `/Users/tyler/nexus/state/artifacts/validation/shopify/provider-spotcheck-stable-20260331T1540CDT.json`

The current 2026-04-03 proof wave is green across all three ladder steps:

1. install/connect plus provider-native read proof
2. activation backfill plus incremental monitor proof
3. mounted-capability worker discovery plus representative successful
   `shopify.graphql.query` read

The current live cleanroom also proves all declared Tier-1 projected families:

1. `order`
2. `line_item`
3. `customer`
4. `product`
5. `collection`
6. `inventory`
7. `fulfillment`
8. `discount`
9. `marketing`

The live cleanroom proof still passes when the launcher is given a larger Node
heap and search projection is disabled. That is a runtime caveat, not a
Shopify adapter contract problem.

The retained provider spot-check is intentionally strict. Shopify order rows
compact blank `fulfillment_status` values out of the normalized row, so the
artifact records the order samples as semantically aligned rather than raw
field-for-field identical. Line-item samples are exact.

## Local Proof

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify

go test ./...
mkdir -p ./bin
go build -o ./bin/shopify-adapter ./cmd/shopify-adapter
./bin/shopify-adapter adapter.info
./bin/shopify-adapter adapter.health --connection shopify-primary
./bin/shopify-adapter records.backfill --connection shopify-primary --since 2026-01-01T00:00:00Z
./bin/shopify-adapter adapter.monitor.start --connection shopify-primary
```

## Validation Ladder

1. package contract is valid
2. build and connection health are green
3. provider-native GraphQL reads succeed through the installed package
4. activation backfill and declared projection families are canonical and
   row-shaped
5. monitor incrementality is proven against bounded proof-order,
   proof-customer, proof-product, proof-collection, proof-inventory,
   proof-fulfillment, proof-discount, and proof-marketing updates
6. a sandboxed worker discovers the mounted Shopify capability docs and package
   skill, then completes a representative provider-native read successfully
7. retained 2026-04-03 cleanroom bundles plus historical parity artifacts are
   available for audit

## Pass Criteria

- `adapter.nexus.json` is valid
- package identity is `shopify`
- package-local spec, workplan, validation, skill, and release flow exist
- `adapter.info` reflects the currently declared Shopify package surface
- `adapter.health` succeeds for a valid Nex-managed Shopify connection
- installed cleanroom reads succeed for representative
  `shopify.graphql.*` and `shopify.query.*` methods
- connection activation backfill completes and emits canonical `record.ingest`
- orders, line items, customers, products, collections, inventory,
  fulfillments, discounts, and marketing activities remain canonical and
  row-shaped with raw payload preserved in metadata, while blank fulfillment
  values are normalized consistently
- the live monitor emits the same canonical record model as backfill and picks
  up bounded upstream proof-order, proof-customer, proof-product,
  proof-collection, proof-inventory, proof-fulfillment, proof-discount, and
  proof-marketing updates incrementally
- a mounted-capability worker reads the projected Shopify docs or skill, picks a
  correct provider-native method, and succeeds through the generic backbone
- package install and restart do not lose the connection identity
- docs remain truthful that the current declared GraphQL slice is proven without
  claiming literal full Shopify Admin API coverage or cleanup-safe write proof
