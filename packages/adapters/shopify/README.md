# Nexus Shopify Adapter

Canonical Shopify adapter for Nex.

This package is on the GraphQL-first Shopify adapter path for Nex. The current
declared surface exposes a representative Shopify Admin GraphQL read slice
while preserving additive Tier-1 Shopify projection in the same package.
Storefront tracking, marketing attribution, and app-specific transforms remain
separate.

Current validated behavior:

- direct Shopify Admin GraphQL auth and health
- generic schema-backed GraphQL backbone:
  `shopify.graphql.query` and `shopify.graphql.mutate`
- current declared convenience GraphQL reads:
  `shopify.query.shop`, `shopify.query.orders`, `shopify.query.order`,
  `shopify.query.products`, `shopify.query.product`,
  `shopify.query.customers`, and `shopify.query.customer`
- row-shaped provider facts for orders, line items, customers, and products
  through additive Nex projection
- connection activation backfill and incremental monitor behavior
- resumable customer/order history staging over an immutable `[since, through]`
  updated-time window, with cursor-bound page receipts and a hash-bound manifest
- mounted-capability agent-use proof for representative `shopify.graphql.query`
  use in cleanroom
- cleanroom proof against MoonSleep Shopify credentials

## Layout

- `cmd/shopify-adapter/` - adapter entrypoint and Shopify provider logic
- `docs/specs/` - package-local adapter specs
- `docs/workplans/` - package-local workplans
- `docs/validation/` - package-local validation docs

## Build

```bash
mkdir -p ./bin
go build -o ./bin/shopify-adapter ./cmd/shopify-adapter
```

## Package

```bash
./scripts/package-release.sh
```

## Validation

- Install/connect + provider-read + backfill/monitor proof:
  `/Users/tyler/nexus/state/sandboxes/5ec38c9b-7b35-4628-9ee1-ae1f02c8d03e/artifacts/validation/shopify-live-cleanroom/20260403T161114Z/shopify-proof-summary.json`
- Mounted-capability agent-use proof:
  `/Users/tyler/nexus/state/sandboxes/ca8d8c11-7428-4276-8d1d-189b0895d837/artifacts/validation/shopify-agent-proof/20260403T152519Z/shopify-agent-proof-summary.json`
- Agent-use proof result bundle:
  `/Users/tyler/nexus/state/sandboxes/ca8d8c11-7428-4276-8d1d-189b0895d837/artifacts/validation/shopify-agent-proof/20260403T152519Z/result.json`
- Historical row-parity proof:
  `/Users/tyler/nexus/state/sandboxes/bf043ac9-5575-49ea-8ecd-4ada02c1e3ab/artifacts/validation/shopify-row-parity-live/20260331T134606Z/shopify-proof-summary.json`
- Retained provider spot-check:
  `/Users/tyler/nexus/state/artifacts/validation/shopify/provider-spotcheck-stable-20260331T1540CDT.json`
- Note: the current 2026-04-03 proof wave is green for the declared
  generic GraphQL backbone, additive projection, and representative
  mounted-capability agent use. It does not claim literal full Shopify Admin
  API coverage or cleanup-safe write-surface proof.
- Note: the current shipped projection families are `order`, `line_item`,
  `customer`, and `product`.
- Note: the order-row spot-check is strict about normalized fields, so blank
  Shopify `fulfillment_status` values are compacted out of the emitted row and
  recorded as a semantic match rather than raw equality.

## Test

```bash
go test ./...
```

## Local CLI

```bash
./bin/shopify-adapter adapter.info
./bin/shopify-adapter adapter.connections.list
./bin/shopify-adapter adapter.health --connection <connection-id>
./bin/shopify-adapter shopify.graphql.query --connection <connection-id> --payload '{"document":"query ShopIdentity { shop { id name myshopifyDomain primaryDomain { host url } } }","operationName":"ShopIdentity"}'
./bin/shopify-adapter shopify.graphql.mutate --connection <connection-id> --payload '{"document":"mutation BulkProbe($query: String!) { bulkOperationRunQuery(query: $query) { bulkOperation { id status type } userErrors { field message } } }","operationName":"BulkProbe","variables":{"query":"{ orders { edges { node { id } } } }"}}'
./bin/shopify-adapter shopify.query.shop --connection <connection-id>
./bin/shopify-adapter shopify.query.orders --connection <connection-id> --payload '{"first":2}'
./bin/shopify-adapter shopify.query.order --connection <connection-id> --payload '{"id":"gid://shopify/Order/<order-id>"}'
./bin/shopify-adapter shopify.query.products --connection <connection-id> --payload '{"first":1}'
./bin/shopify-adapter shopify.query.product --connection <connection-id> --payload '{"id":"gid://shopify/Product/<product-id>"}'
./bin/shopify-adapter shopify.query.customers --connection <connection-id> --payload '{"first":1}'
./bin/shopify-adapter shopify.query.customer --connection <connection-id> --payload '{"id":"gid://shopify/Customer/<customer-id>"}'
./bin/shopify-adapter adapter.monitor.start --connection <connection-id>
./bin/shopify-adapter records.backfill --connection <connection-id> --since 2026-01-01T00:00:00Z
./bin/shopify-adapter records.backfill.customer_orders.stage --connection <connection-id> --payload '{"since":"2020-01-01T00:00:00Z","through":"2026-07-20T18:00:00Z","stage_dir":"/private/operator-owned/shopify-customer-orders"}'
```

## Active Docs

- [docs/README.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/README.md)
- [ADAPTER_SPEC_SHOPIFY.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/specs/ADAPTER_SPEC_SHOPIFY.md)
- [SHOPIFY_ADAPTER_WORKPLAN.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/workplans/SHOPIFY_ADAPTER_WORKPLAN.md)
- [SHOPIFY_ADAPTER_VALIDATION.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/validation/SHOPIFY_ADAPTER_VALIDATION.md)
