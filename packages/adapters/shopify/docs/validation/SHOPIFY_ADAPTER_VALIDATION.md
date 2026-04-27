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

Those retained proofs still stand for correctness, installability, and the
declared Tier-1 family set.

They do not yet close the new live-sync efficiency proof lane that is now
active in:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/workplans/shopify-live-sync-efficiency-board/README.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/workplans/shopify-adapter-performance-benchmark-board/README.md`

The active hosted-efficiency evidence reopening this lane is:

- `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime-benchmark/moonsleep-hosted-runtime-benchmark-2026-04-07T18-55-21-334Z.json`
- `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime-benchmark/shopify-recent-churn-2026-04-07T21-36-06-716Z.json`
- `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime-benchmark/moonsleep-hosted-runtime-benchmark-2026-04-08T02-29-53-696Z.json`
- `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime-benchmark/shopify-recent-churn-2026-04-08T02-31-23-239Z.json`

The 2026-04-08 hosted refresh proves that shipping `shopify@0.1.1` materially
improved the live MoonSleep tenant baseline:

- `apps.list` improved from roughly `2010ms` p50 / `13823ms` p95 to
  `286ms` p50 / `542ms` p95
- host CPU average fell from the earlier saturated range to roughly `46.7%`
- disk write bandwidth average fell to roughly `10.1 MB/s`
- repeated `line_item` logical rows in the sampled churn window fell from `5`
  groups to `2`, and repeated `order` groups fell from `3` to `1`

That does not fully close the hosted efficiency lane yet. The adapter is no
longer obviously melting the tenant, but `attribution.summary` and some
long-tail hosted reads are still above the board target and keep the broader
runtime/app efficiency lane open.

The active package now also owns an adapter-only benchmark lane. The canonical
harness is:

- `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/shopify-adapter-benchmark-live.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/shopify-adapter-benchmark-proof.ts`

That lane exists to answer the adapter-specific questions the hosted benchmark
cannot isolate:

1. how long Shopify backfill takes in a fresh cleanroom
2. what record families and volumes backfill emits
3. what a bounded live monitor soak emits and suppresses
4. what the adapter-owned persisted monitor-state metrics look like after the
   soak

The latest adapter-only cleanroom proof is:

- `/Users/tyler/nexus/state/sandboxes/6bab0655-3bc7-4513-bee8-44615bdc4360/artifacts/validation/shopify-adapter-benchmark/20260427T140738Z/shopify-adapter-benchmark.json`
- `/Users/tyler/nexus/state/sandboxes/6bab0655-3bc7-4513-bee8-44615bdc4360/artifacts/validation/shopify-adapter-benchmark/20260427T140738Z/shopify-adapter-benchmark.md`
- `/Users/tyler/nexus/state/sandboxes/6bab0655-3bc7-4513-bee8-44615bdc4360/artifacts/validation/shopify-adapter-benchmark/20260427T140738Z/shopify-adapter-monitor-state.json`

That April 27, 2026 proof installed only the packaged Shopify adapter into a
fresh runtime-managed sandbox and used the MoonSleep Shopify connection
credentials mounted from the operator-owned secrets root. It captured:

- `8577` records from a 30-day backfill window
- `34749ms` backfill elapsed time
- `246.83` records per second
- `600s` live monitor soak
- `10` monitor snapshots
- `0` total record delta during the soak
- `0` family-level churn across `order`, `line_item`, `fulfillment`,
  `inventory`, `customer`, `product`, `collection`, `discount`, and
  `marketing`

The same work also tightened the no-change watermark behavior: when a family
has no provider row yet to advance `cursor_at`, monitor `since` now falls back
to `last_poll_at - overlap` rather than `now - overlap`. That preserves the
cheap no-change path while making restart-after-downtime behavior safer.

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
8. adapter-only benchmark harness proves backfill and bounded live monitor soak
   behavior separately from hosted tenant latency

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
- the live monitor also proves the package-local incremental-efficiency target
  state from
  `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/specs/SHOPIFY_INCREMENTAL_LIVE_SYNC_AND_RECONCILE_MODEL.md`
  through the active live-sync efficiency board
- the active adapter-only benchmark lane from
  `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/specs/SHOPIFY_ADAPTER_PERFORMANCE_BENCHMARK_MODEL.md`
  is available and truthfully captures isolated backfill timing plus bounded
  live-monitor soak metrics
- a mounted-capability worker reads the projected Shopify docs or skill, picks a
  correct provider-native method, and succeeds through the generic backbone
- package install and restart do not lose the connection identity
- docs remain truthful that the current declared GraphQL slice is proven without
  claiming literal full Shopify Admin API coverage or cleanup-safe write proof
