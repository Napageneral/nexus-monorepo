# SLE-006 Duplicate Revision Suppression And Family Fingerprints

## Goal

Keep Shopify ledger semantics while ensuring overlap windows and broad family
candidate sets do not create duplicate durable revisions.

## Scope

- define family-native revision fingerprints
- add duplicate revision suppression keyed by `logical_row_id`
- remove freshness fields that cause fake child-family churn
- keep true upstream family revisions as durable records

## Completed

- added a Shopify-local revision cache at
  `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/cmd/shopify-adapter/monitor_revisions.go`
  using an adapter-local SQLite store under `NEXUS_ADAPTER_STATE_DIR`
- wrapped monitor emit so duplicate `(family, logical_row_id, revision_hash)`
  observations are suppressed before durable emit
- kept the existing family-native record builders as the source of truth for
  `revision_hash`
- persisted per-family attempted/emitted/suppressed counters in monitor state
  and logged them at monitor-cycle time
- preserved the earlier line-item fix so parent `order_updated_at` no longer
  changes line-item revision identity by itself

## Acceptance

1. repeated observation of the same family revision does not emit a new record
2. `line_item` no longer churns because `order_updated_at` moved
3. true upstream customer, product, inventory, and fulfillment revisions still
   emit durably
4. the adapter exposes counters or debug evidence for emitted vs suppressed
   revisions

## Proof

- focused tests for duplicate suppression:
  `go test ./cmd/shopify-adapter -v`
- package validation:
  `nexus package validate .`
- retained evidence:
  - `TestShopifyRevisionStoreRoundTrip`
  - `TestRunShopifyMonitorCycleSuppressesDuplicateLineItemRevision`
  - monitor log lines showing `family=line_item attempted=1 emitted=0 suppressed=1`

## Remaining

- hosted churn artifact before/after comparison remains open in `SLE-007`
- the live MoonSleep server still needs the before/after benchmark refresh to
  quantify the real host-pressure win
