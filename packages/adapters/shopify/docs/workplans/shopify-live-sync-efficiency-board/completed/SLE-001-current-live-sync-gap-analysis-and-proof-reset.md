# SLE-001 Current Live Sync Gap Analysis And Proof Reset

## Goal

Make the current Shopify live-sync gap explicit against the canonical
incremental target state before implementation starts.

## Spec

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/specs/ADAPTER_SPEC_SHOPIFY.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/specs/SHOPIFY_INCREMENTAL_LIVE_SYNC_AND_RECONCILE_MODEL.md`

## Current Proof Inputs

- hosted baseline benchmark:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime-benchmark/moonsleep-hosted-runtime-benchmark-2026-04-07T18-55-21-334Z.json`
- hosted parsed-metrics follow-up:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime-benchmark/moonsleep-hosted-runtime-benchmark-2026-04-07T18-56-09-449Z.json`
- live Shopify churn sample:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime-benchmark/shopify-recent-churn-2026-04-07T21-36-06-716Z.json`

## Current Reality

The current monitor implementation diverges from the target state in several
material ways.

### Gap 1: Live monitor still behaves like replay

Current monitor starts with a `72h` replay posture and then keeps forcing the
request cursor backward:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/cmd/shopify-adapter/main.go`

Current evidence:

- `defaultMonitorInterval = 1m`
- `orderReplayWindow = 72h`
- monitor sets `InitialCursor = now - 72h`
- each monitor cycle clamps `requestSince` back to at least `now - 72h`

That is incompatible with the target live monitor model.

### Gap 2: One monitor fetch path pulls every family every cycle

Current `fetchShopifyRecords()` runs orders, customers, products, collections,
inventory, fulfillments, discounts, and marketing in one cycle:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/cmd/shopify-adapter/main.go`

The target state requires family-specific incremental lanes.

### Gap 3: Several families intentionally use monitor-time snapshot scans

Current monitor mode clears the provider query and falls back to local
snapshot-style filtering for:

1. customers
2. products
3. collections
4. inventory

Current code:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/cmd/shopify-adapter/tier1_projection.go`

The target state requires those families to move to true incremental reads or
slower reconcile lanes rather than broad monitor-time scans.

### Gap 4: Revision identity still creates avoidable churn

Current record builders use revision-hashed external ids for families such as:

1. `order`
2. `line_item`
3. `customer`
4. `product`
5. `collection`
6. `inventory`
7. `fulfillment`

That is not itself wrong, but several family rows include freshness fields that
cause avoidable revision churn under the current monitor posture.

The clearest current offender is `line_item`, which includes
`order_updated_at`, causing child-row churn when only the parent order
freshness changed:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/cmd/shopify-adapter/main.go`

### Gap 5: The package-local proof story overstates monitor quality

Current package docs still describe the previous proof wave as complete:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/workplans/SHOPIFY_ADAPTER_WORKPLAN.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/validation/SHOPIFY_ADAPTER_VALIDATION.md`

Those artifacts still prove correctness and installability, but they do not
yet prove the hosted incremental-efficiency target state.

## Live Evidence

The hosted MoonSleep baseline already shows the need for a reopen:

- `apps.list` p50 about `2010ms`, p95 about `13823ms`
- `jobs.runs.list` p50 about `399ms`
- `runtime.health` p50 about `279ms`
- `attribution.pipeline.status` p50 about `318ms`
- `attribution.summary` p50 about `646ms`
- host CPU about `97%`
- disk write bandwidth about `23.4 MB/s`
- disk write IOPS about `1141.6`

The recent Shopify churn sample on the hosted MoonSleep tenant showed:

- `customer`: `23`
- `line_item`: `11`
- `order`: `7`
- `inventory`: `6`
- `product`: `5`
- `fulfillment`: `5`

The same sample also shows repeated logical rows:

1. one product logical row emitted `5` times with `5` revisions in `2h`
2. one customer logical row emitted twice with stable business content
3. one line-item logical row emitted twice because parent order freshness moved
4. inventory rows are active and meaningful, but are still discovered through a
   broad expensive monitor path

## Target Gap Closure

The implementation program should close the following gaps:

1. replace replay-heavy live cursor logic with family-native watermarks
2. split hot, medium, cold, and reconcile family lanes
3. remove monitor-time snapshot scans from the hot lane
4. keep ledger semantics while suppressing duplicate revisions
5. redefine child-family revision identity where parent freshness is causing
   fake churn
6. refresh the package-local validation corpus so the active proof path matches
   the new target state

## Ticket Sequence

1. `SLE-002`
2. `SLE-003`
3. `SLE-004`
4. `SLE-005`
5. `SLE-006`
6. `SLE-007`

## Completion

Completed on April 27, 2026.

This ticket remains as the historical gap analysis. The replay-heavy posture it
describes has been replaced by the family scheduler, per-family watermarks,
targeted inventory hot lane, duplicate revision suppression, and the April 27,
2026 adapter-only benchmark proof.
