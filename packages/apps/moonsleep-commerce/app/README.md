# MoonSleep Commerce

Installable Nex app for MoonSleep customer identity and typed commerce
projection from exact provider records.

The first vertical consumes immutable Shopify customer, order, and line-item
Records. It observes a stable Shopify Contact, resolves the canonical Nex
Entity, creates or reuses Record-native customer-role evidence and the one
`moonsleep.customer.v1` Customer Facet, then binds immutable Order Records to
that canonical customer and line-item Records to their stable parent Order. It
uses public Nex operations only. `Customer` and `Shopify` Entity tags remain
compatibility/search hints; the Customer Facet is the role authority.

Current scope:

- replay-safe Shopify store and integration routing identities through
  `contacts.observe`, `entities.resolve`, and `entities.tags.list`
- Shopify customer identity, accepted-Observation, and Customer Facet projection
- typed, revisioned Shopify order and line-item projection
- canonical customer links on orders, with no fuzzy matching
- canonical Commerce Order targets use the exact `commerce_orders.row_id`
  returned by `observeCommerceOrder`, subject class `moonsleep.commerce_order`,
  and adapter contract `moonsleep.commerce-order.target-adapter.v1`
- immutable billing and shipping snapshots with deterministic SHA-256 binding
- bounded explicit customer cohort projection for pre-activation production proof
- dormant `record.ingested` job registration on the full PostgreSQL work plane,
  with exact customer, order, and line-item subscriptions so each new revision
  schedules one projector rather than fanning out to both jobs
- deterministic shop-domain and customer-GID contact anchors
- exact provider JSON hash verification
- zero Shopify writes during projection
- direct semantic-ledger accepted-Observation verification; the projector does
  not invoke the legacy Shopify Customer Facet bridge or write copied receipts
  to `core_graph_accepted_observation_receipts`
- twelve independent Shopify source-observation jobs with independent cursors
  and page-level commit/abort capture receipts; scheduled order polling drains
  up to ten sequential pages per run so a continuation does not wait for the
  next 20-minute slot
- disabled-first UTC schedules plus a force-now operation; recurring schedules
  cannot run until an exact connection-bound plan is hash-confirmed and applied
- second-granularity UTC schedule staggering so the three minute-level families
  and every slower family start in separate slots instead of bursting together
- a cross-process per-store governor with two request slots, request pacing,
  proactive REST-pressure delay, durable 429 backoff, and a shared token cache
- conservative identity behavior with no email, phone, or name merge

The cohort method accepts 1-50 exact committed record IDs. It validates the
entire cohort before the first identity observation, then uses the same
replay-safe public operations as the dormant event job. It exists only to prove
real records and identity bindings before bulk event delivery is activated.

Each source capture owns one provider page and ingests its Records through the
native `record.ingest` operation. The Shopify cursor advances only after the
whole page succeeds. Scheduled `orders.delta` runs continue immediately from a
committed page cursor, up to ten pages per run, while keeping every page as its
own atomic capture. A failure aborts only the current page without rolling back
earlier committed pages, so the same page can be retried and already committed
Records replay idempotently.

Before ingest, `moonsleep-commerce.shopify-source.seed-identities` must run
twice for the exact shop domain and connection ID. The first run creates the
store and integration entity/contact anchors. The second must report zero new
entities and contacts and two replayed observations. These are routing
identities; customers remain separately observed subject entities.

Recurring source observation is configured through
`moonsleep-commerce.shopify-source.configure-schedules`. First call it in
`plan` mode with the exact connection ID and explicitly enabled family set.
Only an `apply` call with that exact `plan_sha256` and the literal confirmation
`CONFIGURE_MOONSLEEP_SHOPIFY_SOURCE_SCHEDULES` binds the jobs and enables that
set. An empty set safely binds the connection while leaving every schedule
disabled. `moonsleep-commerce.shopify-source.trigger` can queue one exact
family without enabling any recurring schedule.

This app has no Shopify, Dispatch, payment, refund, or fulfillment write
authority.
