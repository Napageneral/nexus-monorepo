# MoonSleep Commerce

Installable Nex app for MoonSleep customer identity and typed commerce
projection from exact provider records.

The first vertical consumes committed Shopify customer records. It observes a
stable Shopify contact, resolves the canonical Nex entity, and verifies the
`Customer` and `Shopify` tags. It uses public Nex operations only.

Current scope:

- replay-safe Shopify store and integration routing identities through
  `contacts.observe`, `entities.resolve`, and `entities.tags.list`
- Shopify customer identity projection
- bounded explicit customer cohort projection for pre-activation production proof
- explicit deterministic full-customer backfill with replay counters and hashes
- dormant `record.ingested` job registration on the full PostgreSQL work plane,
  held until cohort, double-backfill, restart, and replay gates pass
- deterministic shop-domain and customer-GID contact anchors
- exact provider JSON hash verification
- conservative identity behavior with no email, phone, or name merge

The cohort method accepts 1-50 exact committed record IDs. It validates the
entire cohort before the first identity observation, then uses the same
replay-safe public operations as the dormant event job. It exists only to prove
real records and identity bindings before bulk event delivery is activated.

The backfill method accepts a strictly sorted, unique, explicit record set and
its SHA-256 identity. It validates every record before the first identity
observation, projects through the same public operations, and returns a
deterministic result hash plus created/replayed counters. Running the same set a
second time must report zero new entities and contacts and every observation as
replayed.

For production-size sets, `shopify-customers.inspect-backfill` discovers the
complete committed customer record set through paginated public `records.list`
calls and returns only its count, boundaries, and SHA-256. The companion
`project-complete-backfill` re-reads that public surface and proceeds only when
the exact count and hash still match. This avoids direct SQL and multi-megabyte
operator parameter files without weakening the explicit snapshot gate.

Before ingest, `moonsleep-commerce.shopify-source.seed-identities` must run
twice for the exact shop domain and connection ID. The first run creates the
store and integration entity/contact anchors. The second must report zero new
entities and contacts and two replayed observations. These are routing
identities; customers remain separately observed subject entities.

Not yet implemented:

- typed order and line-item projection
- historical production backfill execution against the MoonSleep-only runtime
- continuous production monitor activation
- event subscription activation before the production cohort, double-backfill,
  restart, and replay gates pass
- Shopify, Dispatch, payment, refund, or fulfillment writes
