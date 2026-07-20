# MoonSleep Commerce Contract

## Purpose

MoonSleep Commerce consumes immutable provider records and projects them into
shared Nex identity plus MoonSleep-owned typed commerce state.

## Shopify customer identity

The stable contact anchor is:

- platform: `shopify`
- space: exact `*.myshopify.com` shop domain
- contact: exact Shopify customer GID

The immutable observation identity is the committed Nex `record_id`, which
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
bounded fields they require from the exact JSON and never rewrite that evidence.
- `metadata.family=customer`
- `metadata.row.shop_domain`
- `metadata.row.customer_gid`
- `metadata.provider_ids.customer_gid`

The exact JSON hash and all customer anchors must agree before an identity
operation is called.

## Authority

This app may write MoonSleep Nex identity observations and classifications.
It has no Shopify provider-write authority and no payment, refund, fulfillment,
Dispatch, accounting, or customer-communication authority.
