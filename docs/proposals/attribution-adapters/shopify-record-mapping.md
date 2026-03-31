# Shopify Record Mapping

**Status:** PROPOSED
**Last Updated:** 2026-03-31
**Related:** [Shopify Adapter](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/shopify-adapter.md), [AAP-004 Shopify Package](/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-adapter-packages-board/in-progress/AAP-004-shopify-package.md)

## MoonSleep Today

MoonSleep currently has two Shopify ingest paths:

- baseline truth in [sync.py](/Users/tyler/nexus/home/projects/moonsleep-v1/analytics/sync.py)
- attribution-side webhook handling in [index.ts](/Users/tyler/nexus/home/projects/moonsleep-v1/workers/meta-capi/src/index.ts)

The baseline analytics extractor is the right parity source for the Nex
adapter:

- it fetches `orders.json` from the Shopify Admin API
- it paginates at `limit=250`
- it supports historical `created_at_min` sync and faster `updated_at_min`
  replay sync
- it preserves three MoonSleep datasets:
  - `shopify_orders_raw`
  - `shopify_orders`
  - `shopify_line_items`

The webhook route is not the main data plane. It is an attribution-side assist
used to react quickly to paid orders and enrich order-attribution state.

## Target Nex Shape

The shared Nex adapter should stay focused on backend outcome truth.

The first package should emit two canonical families:

- `order`
- `line_item`

MoonSleep's `shopify_orders_raw` should not become a third first-class family
unless we discover a concrete downstream need. Nex records already let us keep
raw provider payload alongside the normalized row.

So the clean target is:

- `payload.metadata.row`: normalized row fields
- `payload.metadata.raw_provider_payload`: original Shopify order or line item
- `payload.metadata.bridge_attributes`: allowlisted checkout-surviving evidence

## Auth And Health

The package should own:

- `shop_domain`
- `client_id`
- `client_secret`

Optional later credentials:

- `webhook_secret`

`adapter.health` should prove:

- token exchange succeeds
- the configured shop is reachable
- shop identity is stable enough to preserve in metadata

## Source Families

### `order`

Grain: one row per Shopify order.

Required preserved row fields:

- `shop_domain`
- `order_id`
- `order_number`
- `name`
- `created_at`
- `updated_at`
- `processed_at`
- `currency`
- `total_price`
- `subtotal_price`
- `financial_status`
- `fulfillment_status`
- `cancelled_at`
- `cart_token`
- `checkout_token`
- `source_name`
- `referring_site`
- `landing_site`
- `customer_id`
- `customer_email`
- `tags`
- `note_attributes`

Allowlisted `bridge_attributes` should be extracted from `note_attributes` and,
when safely parseable, `landing_site` query params:

- `initiate_checkout_event_id`
- `session_id`
- `experiment_key`
- `experiment_variant`
- `fbclid`
- `fbc`
- `fbp`
- `gclid`
- `gbraid`
- `wbraid`
- `ttclid`
- `ttp`
- `msclkid`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `utm_term`

### `line_item`

Grain: one row per order line item.

Required preserved row fields:

- `shop_domain`
- `order_id`
- `order_number`
- `order_updated_at`
- `line_item_id`
- `product_id`
- `variant_id`
- `title`
- `variant_title`
- `sku`
- `vendor`
- `quantity`
- `price`
- `fulfillment_status`

## Record Mapping

Each emitted row should become one canonical `record.ingest`.

Routing:

- `platform`: `shopify`
- `connection_id`: Nex Shopify connection id
- `sender_id`: stable shop id surface, falling back to `shop_domain`
- `space_id`: `shop_domain`
- `container_id`: `order` or `line_item`
- `thread_id`:
  - `shop_domain:order:{order_id}` for `order`
  - `shop_domain:order:{order_id}` for `line_item`

Payload:

- `external_record_id`:
  - `shopify:{connection_id}:order:{order_id}:{revision_hash}`
  - `shopify:{connection_id}:line_item:{order_id}:{line_item_id}:{revision_hash}`
- `timestamp`:
  - `processed_at` or `created_at` for `order`
  - `order_updated_at` for `line_item`
- `metadata`:
  - `family`
  - `logical_row_id`
  - `revision_hash`
  - `provider_ids`
  - `row`
  - `bridge_attributes`
  - `raw_provider_payload`
  - `source_request`

## Backfill

Historical backfill should use `created_at_min` in ascending order.

Why:

- it gives stable one-time historical coverage
- it avoids missing older orders whose `updated_at` changed much later

Baseline historical behavior:

- request `orders.json?status=any&limit=250&order=created_at asc&created_at_min=...`
- continue until pagination is exhausted
- emit both `order` and `line_item` families from the same fetched order page

## Live Sync

Monitor should use `updated_at_min`, not `created_at_min`, as the baseline
freshness path.

Why:

- orders can be paid, edited, refunded, cancelled, or fulfilled after creation
- line-item truth should follow order updates

Baseline monitor behavior:

- poll recent `updated_at` windows on a durable cadence
- use a replay window, likely `3d` to start, then tune if Shopify restatement
  behavior demands more
- emit the same `order` and `line_item` contracts as backfill

Optional later assist:

- Shopify webhooks can trigger narrow order refetch by order id for faster
  freshness, but polling must remain the authoritative proof path

## Recommended First Board

The first execution lane should prove:

1. package scaffold and auth
2. order and line-item row families
3. revision-aware immutable-arrival identities
4. historical `created_at` backfill
5. replay-safe `updated_at` monitor
6. MoonSleep credential validation
