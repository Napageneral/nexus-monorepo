# Shopify Adapter Workplan

**Spec:** [ADAPTER_SPEC_SHOPIFY.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/specs/ADAPTER_SPEC_SHOPIFY.md)
**Package:** `adapters/shopify/`
**Date:** 2026-03-11
**Status:** LOCAL IMPLEMENTATION COMPLETE, LIVE VALIDATION PENDING

## Customer Outcome

The goal is not "the Shopify adapter binary still works."

The goal is:

- Shopify is a shared provider adapter that any Nex app can use
- the adapter emits canonical Shopify records with stable `connection_id`
- downstream consumers can safely use Shopify order and fulfillment data on a
  first live clinic without product-coupled credential plumbing

## Implementation State

Completed locally:

- canonical `record.ingest` builders now exist for Shopify order and
  fulfillment rows
- runtime `connection_id` is the canonical identity surface
- the shared adapter no longer hardcodes a storefront- or app-specific managed
  credential URL
- runtime OAuth credentials can be bridged into the adapter under
  `connection_id`

Still pending:

- real Shopify credential validation
- first-clinic downstream proof against canonical Shopify records

## Gaps To Close

### G1. Canonical Inbound Contract

- replace legacy flat event output with canonical `record.ingest`
- preserve Shopify order and fulfillment facts as canonical provider records
- keep `connection_id` as the durable connection field

### G2. Connection Identity

- stop exposing provider shop ids or `"default"` as the operational account
  identity
- make `adapter.connections.list` reflect runtime-owned `connection_id`

### G3. Managed Gateway Decoupling

- remove the hardcoded app-managed credential URL
- use the canonical managed connection gateway path instead

### G4. Live Validation

- verify order and fulfillment backfill/monitor against real credentials
- verify downstream consumers can consume the resulting canonical records

## Execution Order

1. Land canonical `record.ingest` builders for Shopify order and fulfillment
   rows.
2. Hard-cut account/connection semantics to runtime `connection_id`.
3. Remove app-specific managed credential URL usage.
4. Re-validate `adapter.info`, `adapter.health`, `adapter.connections.list`,
   `records.backfill`, and `adapter.monitor.start`.
5. Run first-clinic downstream validation with real Shopify data.

## Remaining Exit Criteria

- the adapter no longer emits legacy flat events
- the adapter no longer depends on app-managed credential URLs
- the adapter uses `connection_id` as its runtime identity surface
- Shopify order and fulfillment validate through the same shared adapter
  contract
