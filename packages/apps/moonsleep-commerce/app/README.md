# MoonSleep Commerce

Installable Nex app for MoonSleep customer identity and typed commerce
projection from exact provider records.

The first vertical consumes committed Shopify customer, order, and line-item records. It observes a
stable Shopify contact, resolves the canonical Nex entity, and verifies the
`Customer` and `Shopify` tags, then binds immutable order revisions to that
canonical customer and line-item revisions to their stable parent order. It
uses public Nex operations only.

Current scope:

- replay-safe Shopify store and integration routing identities through
  `contacts.observe`, `entities.resolve`, and `entities.tags.list`
- Shopify customer identity projection
- typed, revisioned Shopify order and line-item projection
- canonical customer links on orders, with no fuzzy matching
- immutable billing and shipping snapshots with deterministic SHA-256 binding
- bounded explicit customer cohort projection for pre-activation production proof
- explicit deterministic customer projection batches capped at 250 records,
  with a resource-aware checkpoint runner and replay counters/hashes
- deterministic order/line-item batches capped at 50 records; the production
  runner defaults to one 25-record batch per invocation, a one-second inter-batch
  delay, and an I/O-pressure ceiling before every batch
- dormant `record.ingested` job registration on the full PostgreSQL work plane,
  with exact customer, order, and line-item subscriptions so each new revision
  schedules one projector rather than fanning out to both jobs; activation is
  held until cohort, double-backfill, restart, and replay gates pass
- deterministic shop-domain and customer-GID contact anchors
- exact provider JSON hash verification
- zero Shopify calls during projection: backfill drains immutable records that
  are already committed to the MoonSleep Nex database
- twelve independent Shopify source-observation jobs with one bounded provider
  page per invocation, independent cursors and commit/abort capture receipts
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

The backfill method accepts one strictly sorted, unique batch of at most 250
record IDs and its SHA-256 identity. It validates that complete batch before the
first identity observation, projects through the same public operations, and
returns a deterministic result hash plus created/replayed counters.

For production-size sets, `shopify-customers.inspect-backfill` discovers the
complete committed customer record set through paginated public `records.list`
calls and returns its validated sorted IDs, count, boundaries, and SHA-256.
`shopify_customer_projection_runner.py --build-manifest` calls that read-only
operation and atomically creates a new private manifest without direct SQL.
Projection mode then drains that exact manifest in independently receipted
batches, checks health, pause markers and Linux I/O pressure before every batch,
and advances its durable checkpoint only after an exact Nex success receipt. A
lost response retries only the uncheckpointed batch; replay-safe source
observations prevent duplicate identities. Safe invocation defaults are one
25-record batch, a one-second inter-batch delay, and an I/O full-pressure
`avg60` ceiling of 1.0. An explicit invocation can run at most ten batches; a
fresh invocation must re-read and validate the durable checkpoint before it can
continue.

Order and line-item backfill follows the same pattern through
`shopify-commerce.inspect-backfill` and `shopify-commerce.project-backfill`.
Every explicit batch is fetched and validated before the first commerce write;
orders are projected before line items. The runner stores a hash-bound manifest
and fsynced checkpoint. Its safe defaults make each scheduled invocation do at
most 25 records and then exit, allowing the host resource guard to pause or
resume the drain without a full replay or new Shopify fetch.

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

Still held from production activation:

- historical production backfill execution against the MoonSleep-only runtime
- continuous production monitor activation
- event subscription activation before the production cohort, double-backfill,
  restart, and replay gates pass
- Shopify, Dispatch, payment, refund, or fulfillment writes
