# Shopify Adapter Validation Ladder

**Spec:** [ADAPTER_SPEC_SHOPIFY.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/specs/ADAPTER_SPEC_SHOPIFY.md)
**Workplan:** [SHOPIFY_ADAPTER_WORKPLAN.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/workplans/SHOPIFY_ADAPTER_WORKPLAN.md)
**Date:** 2026-03-11
**Status:** LOCAL CONTRACT VALIDATION COMPLETE, LIVE VALIDATION PENDING

## Rung 1: Contract Integrity

- `go test ./...`
- `go build ./cmd/shopify-adapter`
- `./shopify-adapter adapter.info`

Pass criteria:

- the operations list includes `adapter.monitor.start` and `records.backfill`
- target-state docs remain the package-local source of truth

Status: complete

## Rung 2: Connection Identity

- `adapter.connections.list`
- `adapter.health`

Pass criteria:

- runtime identity is `connection_id`
- no provider shop id or `"default"` placeholder is used as the canonical
  connection surface

Status: complete for local implementation

## Rung 3: Order Backfill

- run historical Shopify order backfill against a real connection
- inspect emitted records

Pass criteria:

- output is canonical `record.ingest`
- `connection_id` is present
- provider shop ids, order ids, and line-item ids remain metadata only

Status: pending real credentials

## Rung 4: Fulfillment Backfill And Monitor

- run fulfillment backfill
- run monitor against a real connection

Pass criteria:

- both paths emit the same canonical record model
- fulfillment and transaction ids remain metadata, not canonical connection
  identity

Status: pending real credentials

## Rung 5: Managed Gateway Decoupling

- inspect managed-profile behavior through the runtime/frontdoor gateway

Pass criteria:

- no storefront- or app-specific managed credential URL remains in the shared
  adapter path
- shared adapter behavior remains product-agnostic

Status: complete for local implementation

## Rung 6: MoonSleep First-Clinic Proof

- connect the adapter through real Shopify credentials
- validate raw record arrival
- validate downstream metric extraction and dashboard sanity

Pass criteria:

- downstream consumers can consume the canonical Shopify records without
  adapter-local identity hacks

Status: pending first clinic
