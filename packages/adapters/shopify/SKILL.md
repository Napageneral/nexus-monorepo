---
name: shopify
description: Use the Shopify adapter for GraphQL-first Shopify reads plus canonical Nex order, line-item, customer, and product ingest through shared connections, backfill, monitor, and mounted-capability workflows.
---

# Nexus Shopify Adapter

Use the shared Shopify adapter when Nex should own Shopify store access through
a durable shared connection, expose Shopify GraphQL reads, and emit canonical
order, line-item, customer, and product records.

The current declared read slice is GraphQL-first and proofed. It does not claim
literal full Shopify Admin API coverage or cleanup-safe write proof.

## When To Use It

- connect Shopify once through the shared Nex connection model
- use `shopify.graphql.query` and `shopify.graphql.mutate` for broad provider-native Shopify Admin GraphQL access
- use the convenience `shopify.query.*` methods when a common first-wave read already exists
- backfill historical Shopify order, line-item, customer, and product facts
- run monitor to keep Shopify data fresh
- exercise the mounted capability tree truthfully for representative worker use
- let apps consume canonical Shopify records through the same runtime
  connection model as other adapters

## Core Rules

1. inbound data is canonical `record.ingest`
2. `connection_id` is the canonical runtime identity
3. Shopify shop ids and order ids are provider metadata, not runtime identity
4. checkout-surviving bridge evidence stays in provider metadata
5. backfill and monitor emit the same canonical record model

## Main Surfaces

- `adapter.info`
- `adapter.health`
- `adapter.connections.list`
- `shopify.graphql.query`
- `shopify.graphql.mutate`
- `shopify.query.shop`
- `shopify.query.orders`
- `shopify.query.order`
- `shopify.query.products`
- `shopify.query.product`
- `shopify.query.customers`
- `shopify.query.customer`
- `adapter.monitor.start`
- `records.backfill`

## Local CLI Examples

Read adapter info:

```bash
./bin/shopify-adapter adapter.info
```

Check connection health:

```bash
./bin/shopify-adapter adapter.health --connection shopify-primary
```

Read Shopify shop identity:

```bash
./bin/shopify-adapter shopify.query.shop --connection shopify-primary
```

Run a generic Shopify GraphQL query:

```bash
./bin/shopify-adapter shopify.graphql.query \
  --connection shopify-primary \
  --payload '{"document":"query ShopIdentity { shop { id name myshopifyDomain primaryDomain { host url } } }","operationName":"ShopIdentity"}'
```

Read the first two Shopify orders:

```bash
./bin/shopify-adapter shopify.query.orders \
  --connection shopify-primary \
  --payload '{"first":2}'
```

Read one Shopify order by gid:

```bash
./bin/shopify-adapter shopify.query.order \
  --connection shopify-primary \
  --payload '{"id":"gid://shopify/Order/<order-id>"}'
```

Run bounded backfill:

```bash
./bin/shopify-adapter records.backfill \
  --connection shopify-primary \
  --since 2026-01-01T00:00:00Z
```

Start monitor:

```bash
./bin/shopify-adapter adapter.monitor.start --connection shopify-primary
```

## Key Data Models

- Nex Shopify connection
  - one durable Shopify credential binding for one or more shops
- Shopify Tier-1 commerce facts
  - canonical inbound records carrying order, line-item, customer, and product
    metadata
- `connection_id`
  - canonical runtime identity for backfill, monitor, and downstream product
    consumption

Important boundary:

- the adapter should hide shop-specific credential plumbing
- consumers should bind to `connection_id`, not to provider shop aliases or
  `"default"`

## End-To-End Example

Normal Shopify flow:

1. create one Shopify connection through Nex
2. complete the shared Shopify auth flow or bind the required credentials
   through the canonical connection surface
3. verify `adapter.health`
4. prefer `shopify.graphql.query` / `shopify.graphql.mutate` for broad provider-native access
5. use `shopify.query.*` methods when a first-wave convenience alias already covers the read you need
6. use the mounted capability tree plus this skill when a worker needs to explore the schema-backed surface safely
7. run `records.backfill` for historical Tier-1 commerce facts
8. run `adapter.monitor.start` for freshness
9. use the mounted capability tree and package skill for representative worker
   discovery when agent-use proof matters
10. confirm emitted records use canonical `record.ingest` and include
   `connection_id`
11. let downstream consumers use those records without adapter-local identity
   hacks

## Constraints And Failure Modes

- do not treat `"default"` as canonical shop identity
- do not hardcode a storefront or app-specific credential URL into the shared
  adapter
- do not overclaim the current GraphQL slice as literal full Shopify Admin API
  coverage
- backfill and monitor should not diverge into different record shapes

## Related Docs

- `adapter.nexus.json`
- `README.md`
- `docs/specs/ADAPTER_SPEC_SHOPIFY.md`
- `docs/validation/SHOPIFY_ADAPTER_VALIDATION.md`
