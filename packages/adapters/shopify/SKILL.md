---
name: shopify
description: Use the Shopify adapter for shared Shopify order and fulfillment ingest through canonical Nex connections, backfill, and monitor workflows.
---

# Nexus Shopify Adapter

Use the shared Shopify adapter when Nex should own Shopify store access through
a durable shared connection and canonical record ingest.

## When To Use It

- connect Shopify once through the shared Nex connection model
- backfill historical Shopify order, line-item, fulfillment, and refund facts
- run monitor to keep Shopify data fresh
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
- Shopify order fact
  - canonical inbound record carrying order, line-item, and fulfillment
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
4. run `records.backfill` for historical order and fulfillment facts
5. run `adapter.monitor.start` for freshness
6. confirm emitted records use canonical `record.ingest` and include
   `connection_id`
7. let downstream consumers use those records without adapter-local identity
   hacks

## Constraints And Failure Modes

- do not treat `"default"` as canonical shop identity
- do not hardcode a storefront or app-specific credential URL into the shared
  adapter
- backfill and monitor should not diverge into different record shapes

## Related Docs

- `adapter.nexus.json`
- `README.md`
- `docs/specs/ADAPTER_SPEC_SHOPIFY.md`
- `docs/validation/SHOPIFY_ADAPTER_VALIDATION.md`
