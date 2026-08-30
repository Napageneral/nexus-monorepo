# MoonSleep Commerce

Use this app to project committed Shopify source records into MoonSleep's Nex
identity and typed commerce surfaces.

## Current operation

Before importing records, call
`moonsleep-commerce.shopify-source.seed-identities` with the exact shop domain
and adapter connection ID. Repeat it once and require zero new identities. This
binds the store sender and integration receiver through public Nex identity
operations without matching on email, phone, or name.

The installed app registers one job for Shopify `record.ingested` events. The
job ignores non-customer records. For a customer record it:

1. Reads the committed record through `records.get`.
2. Verifies the exact provider JSON hash and stable source anchors.
3. Calls `contacts.observe` with the shop domain and Shopify customer GID.
4. Calls `entities.resolve` for the observed entity.
5. Treats `Customer` and `Shopify` Entity tags as compatibility/search hints.
6. Creates or reuses a Record-native Episode, Fact, sealed Fact set, and
   accepted customer-role Observation through public semantic-ledger operations.
7. Creates or adopts the one restricted `moonsleep.customer.v1` Customer Facet
   directly from the accepted Observation basis.
8. Returns exact projection identifiers for the durable job receipt.

The app also installs twelve independent Shopify source-observation jobs. New
or unconfigured recurring schedules are disabled on install and upgrade. An
exact connection-bound schedule configuration survives app rehydration and
package upgrades; malformed or broadened job configuration fails closed. Use
`moonsleep-commerce.shopify-source.trigger` for one force-now family run, or
plan and hash-confirm an explicit connection-bound family set through
`moonsleep-commerce.shopify-source.configure-schedules`. Never enable a
schedule by editing its row directly. The installed UTC expressions stagger
each family into its own second/minute slot so activation does not create a
provider-call burst.

Each source capture owns one provider page. The app commits the Shopify cursor
only after every Record is durably ingested. Scheduled `orders.delta` runs drain
up to ten sequential pages without waiting for the next recurring slot; each
page retains an independent commit/abort boundary. A failed page is aborted
without advancing that page and may be retried idempotently.

For a verified `orders/paid` webhook, the channel worker invokes one bounded
`moonsleep-commerce.shopify-paid-order-effects` Job after the source and
projector receipts are terminal. That Job reserves deterministic Google Ads,
Meta, Pinterest, and TikTok Effect Journal entries under the persisted Accepted
Order Receipt's stable work root, fenced to its exact Order revision. Pending
admission creates no Effects and remains retryable; rejected or quarantined
observations remain evidence-only. The Job never starts an Effect and therefore
never authorizes a provider call. The existing channel terminal receipt is the
work-graph readback; no separate workflow engine or graph schema is involved.

## Boundaries

- Do not query Nex or MoonSleep databases directly.
- Do not merge identities by email, phone, name, or address.
- Do not mutate Shopify or another provider.
- Do not replace Dispatch fulfillment ownership.
- Do not use Entity tags as customer-role authority; require the Customer Facet.
- Do not invoke the legacy Shopify Customer Facet bridge or copy accepted
  Observation receipts into `core_graph_accepted_observation_receipts`.
- Do not enable either projector job or any projection subscription before a
  representative customer+Order page and identical replay pass.
