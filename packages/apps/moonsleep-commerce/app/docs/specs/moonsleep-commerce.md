# MoonSleep Commerce Contract

## Purpose

MoonSleep Commerce consumes immutable provider records and projects them into
shared Nex identity plus MoonSleep-owned typed commerce state.

## Shopify customer identity

The stable contact anchor is:

- platform: `shopify`
- space: exact `*.myshopify.com` shop domain
- contact: exact Shopify customer GID

The immutable customer observation identity is the provider revision in Nex
`record_id`, which
already contains the Shopify customer revision.

The first observation creates one base person entity plus its Shopify contact.
Later revisions update contact presentation and history without changing the
entity binding. Canonical merges remain explicit Nex identity operations.

## Source evidence

The projector requires all of the following:

- `payload.provider_object_json`
- `payload.provider_object_sha256`

The exact JSON string and digest are authoritative. A decoded provider object is
intentionally not transported through JavaScript because unknown provider
numbers can exceed JavaScript's safe integer range. Projectors read only the
bounded typed metadata fields emitted alongside the exact evidence and never
rewrite the evidence. The customer GraphQL projector additionally verifies its
string GID in the exact decoded object; order and line-item projectors never
read numeric IDs from decoded JSON.
- `metadata.family=customer`
- `metadata.row.shop_domain`
- `metadata.row.customer_gid`
- `metadata.provider_ids.customer_gid`

The exact JSON hash and all customer anchors must agree before an identity
operation is called.

## Shopify orders and line items

Orders use the stable provider anchor `(shopify, shop_domain, order_gid)`. Each
immutable revision binds:

- the internal Nex source-record ID and exact provider-payload SHA-256
- the adapter revision SHA-256 and projector version
- canonical customer contact and entity IDs, when Shopify supplies a customer
- exact currency and decimal amount strings
- immutable billing and shipping JSON snapshots plus deterministic SHA-256

Customer linkage is exact only: the order's Shopify customer ID is converted to
its canonical GID and resolved through public `contacts.resolve`. Missing
customer projection fails closed; email, phone, and name are never matched.

Line items use `(shopify, shop_domain, order_gid, line_item_gid)`, retain exact
product/variant string IDs, SKU, title, quantity, price, and inherit currency
from the already-committed parent order. A line item cannot exist before its
parent order.

Stable rows point to the newest `(observed_at, source_record_id)` revision.
Older revisions remain durable evidence but cannot replace newer current state.
Exact replay returns the committed receipt; conflicting replay fails closed.

## Backfill and continuous projection

Backfill never calls Shopify. A read-only public inspection creates a private
hash-bound manifest of existing Nex records. The runner defaults to one batch of
25 records per invocation, checks pause markers, health and Linux I/O pressure,
then persists a fsynced checkpoint only after a validated batch receipt. Lost
responses retry only the uncheckpointed batch.

The order/line event job and `record.ingested` subscription are installed
inactive. After historical drain, restart/replay, parity and rollback gates,
the same projector may consume only newly committed Shopify revisions.

## Authority

This app may write MoonSleep Nex identity observations, classifications, and
typed commerce observations.
It has no Shopify provider-write authority and no payment, refund, fulfillment,
Dispatch, accounting, or customer-communication authority.
