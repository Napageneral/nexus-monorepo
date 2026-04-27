# Shopify Adapter Workplan

**Status:** COMPLETE FOR CURRENT DECLARED TIER-1 CORRECTNESS WAVE; LIVE-SYNC EFFICIENCY REOPENED IN PACKAGE-LOCAL BOARD
**Spec:** `docs/specs/ADAPTER_SPEC_SHOPIFY.md`
**Validation:** `docs/validation/SHOPIFY_ADAPTER_VALIDATION.md`

## Customer Goal

Keep `shopify` as the shared adapter package for GraphQL-first Shopify reads
plus additive Tier-1 commerce ingest.

The package should:

- use Nex-managed connection identity
- expose provider-native GraphQL reads through the declared Shopify catalog and
  generic backbone
- backfill and monitor canonical Shopify order, line-item, customer, product,
  collection, inventory, fulfillment, discount, and marketing rows
- retain checkout bridge evidence as metadata
- remain installable and restart-safe as a shared package

## Current Package Scope

Current declared surface:

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

## Active Work Surface

The previous correctness and proof wave is complete, but live-sync efficiency
has reopened as an active package-local workstream:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/workplans/shopify-live-sync-efficiency-board/README.md`

The current 2026-04-03 proof wave is complete and contract-truthful:

- keep `connection_id` canonical
- keep the declared Shopify GraphQL read slice truthful and mounted-capability
  discoverable
- keep shop, order, customer, and product ids as provider metadata
- keep row-shaped Shopify records stable
- keep bridge evidence and downstream attribution fields explicit
- keep managed-profile behavior product-agnostic
- keep package-local docs current
- keep the runtime caveat tracked outside the adapter package itself

The completed proof wave is:

- install/connect plus provider-native read proof green
- additive backfill plus incremental monitor proof green
- mounted-capability agent-use proof green

The retained canonical Tier-1 MoonSleep proof is:

- `/Users/tyler/nexus/state/sandboxes/6abd1e69-40a8-4127-aa4c-ad8ac090403a/artifacts/validation/shopify-live-cleanroom/20260403T195625Z/result.json`
- `/Users/tyler/nexus/state/sandboxes/6abd1e69-40a8-4127-aa4c-ad8ac090403a/artifacts/validation/shopify-live-cleanroom/20260403T195625Z/shopify-proof-summary.json`
- `/Users/tyler/nexus/state/sandboxes/6abd1e69-40a8-4127-aa4c-ad8ac090403a/artifacts/validation/shopify-live-cleanroom/20260403T195625Z/shopify-ingest-monitor.proof.json`

This wave proves the full current projected Tier-1 family set:

- `order`
- `line_item`
- `customer`
- `product`
- `collection`
- `inventory`
- `fulfillment`
- `discount`
- `marketing`

Residual gaps that remain outside this completed wave:

- broader Shopify Admin GraphQL family materialization beyond the current
  declared read slice
- live monitor family watermarks, family cadence, duplicate revision
  suppression, and hosted efficiency signoff, which are now tracked in the
  dedicated live-sync efficiency board
- projection beyond the current Tier-1 shipped families into later Shopify
  config/content and operational tiers
- cleanup-safe write-surface proof
- any claim of literal full Shopify Admin API coverage
- storefront tracking, marketing attribution, and app-specific transforms,
  which remain separate packages or workstreams

## Reopen Conditions

Open a new implementation slice only if one of these becomes true:

- the declared GraphQL read slice regresses or becomes misleading
- mounted-capability agent-use proof regresses
- storefront or app-specific credential URLs reappear
- hosted Shopify live monitor proves replay-heavy, snapshot-heavy, or otherwise
  inefficient under real tenant load
- `connection_id` stops being the operational identity
- backfill and monitor diverge
- row shape regresses or drops bridge evidence
- package install, health, or restart rehydration regresses
