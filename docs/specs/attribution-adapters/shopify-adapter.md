# Shopify Adapter

**Status:** CANONICAL
**Last Updated:** 2026-03-30
**Related:** [Attribution Intelligence Layer](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-layer.md), [Attribution Intelligence Taxonomy](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-taxonomy.md), [Attribution Adapter Packages Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-adapter-packages-board/README.md)

---

## Purpose

This document defines the target-state shared Shopify adapter surface required
for attribution products in Nex.

The adapter provides backend outcome truth for Shopify-based businesses.

It does not own:

- browser-side website attribution capture
- checkout pixel installation
- attribution decisions
- app-specific dashboard logic

## Customer Experience

The intended operator experience is:

1. create one Shopify connection through Nex
2. complete shared credential setup and shop binding
3. confirm shop health and scope
4. backfill historical Shopify order and line-item truth
5. enable monitor sync so backend outcomes stay current
6. let downstream apps consume one shared Shopify contract plus preserved
   bridge evidence that survives checkout

## Connection Model

One Nex Shopify connection represents one durable Shopify credential binding.

The runtime `connection_id` is the sole operational identity surface.
Shopify provider identifiers remain preserved as metadata.

Required preserved identifiers include:

- `connection_id`
- `shop_domain`
- `order_id`
- `line_item_id`
- `customer_id`
- `cart_token`
- `checkout_token`

## Canonical Responsibilities

The adapter must:

1. validate Shopify credential health and visible shop scope
2. backfill order and line-item truth from Shopify
3. keep order state current through monitor sync
4. preserve order-level and line-item-level provider identity
5. preserve an allowlisted set of bridge attributes that survive checkout and
   are relevant to downstream attribution apps

The adapter does not decide attribution. It only preserves the evidence.

## Source Families

The target-state adapter emits these provider row families.

| Family | Grain | Required preserved fields |
|---|---|---|
| `order` | one row per order | `order_id`, `order_number`, `name`, `created_at`, `updated_at`, `currency`, `total_price`, `subtotal_price`, `financial_status`, `fulfillment_status`, `cart_token`, `checkout_token`, `source_name`, `referring_site`, `landing_site`, `customer_id`, `customer_email`, `tags`, `note_attributes` |
| `line_item` | one row per line item | `order_id`, `order_number`, `order_updated_at`, `line_item_id`, `product_id`, `variant_id`, `title`, `variant_title`, `sku`, `vendor`, `quantity`, `price`, `fulfillment_status` |

The adapter must also preserve a structured bridge-attribute map when those
values are present in order metadata or note attributes.

Examples of bridge attributes include:

- session ids
- checkout event ids
- click ids
- UTM parameters

The adapter should preserve source names exactly as provided rather than
rewriting them to app-specific names.

## Backfill Model

The adapter supports:

- full backfill from a configured `created_at` floor
- incremental backfill from the most recent stored `updated_at` plus a replay
  window for late changes

Required behavior:

1. order retrieval is paginated until the requested window is exhausted
2. order and line-item rows are independently replayable from the same source
   fetch
3. incremental replay can reread recent updates to absorb late order changes
4. backfill emits the same row families as monitor sync

## Monitor Model

The adapter monitor keeps Shopify backend outcome truth current.

Target-state behavior:

- supported change notifications may be consumed when available
- periodic `updated_at` polling remains the baseline proof path
- monitor emits the same row families and payload structure as backfill
- repeated monitor runs are idempotent at the provider row level

## Emitted Record Model

The adapter emits canonical `record.ingest` envelopes.

Each emitted record represents one Shopify provider row.

Each record must preserve:

- `connection_id`
- provider surface family
- provider ids for the row grain
- the row timestamps
- the structured provider fields for that row
- structured bridge attributes when present

Raw provider payload retention must remain possible for audit and replay even
when downstream apps primarily consume normalized outcome models.

## Boundary Rules

This adapter does not own:

- website event capture
- checkout pixel deployment
- attribution matching or channel selection
- Shopify-specific dashboard computation

Those behaviors belong to the website input package family and the
attribution-intelligence app.

## Validation Expectations

Cleanroom validation for this adapter must prove:

1. credential setup succeeds through Nex
2. `adapter.health` confirms visible shop scope
3. backfill emits both `order` and `line_item` row families
4. incremental sync resumes from stored `updated_at` windows
5. monitor emits the same contract as backfill
6. sampled rows match Shopify upstream values for ids, totals, timestamps,
   statuses, and selected bridge attributes

## Done Definition

The Shopify adapter is complete for attribution products when:

1. the shared package exists and emits order and line-item truth
2. checkout-surviving bridge evidence is preserved without app-specific
   remapping
3. setup, health, backfill, and monitor all work against real credentials
4. downstream attribution apps can consume Shopify outcomes without MoonSleep-
   specific assumptions
