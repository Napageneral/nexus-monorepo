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

After a reviewed representative customer+Order canary, a larger historical run
may invoke
`scripts/shopify_customer_projection_runner.py --build-manifest`. The runner
calls `shopify-customers.inspect-backfill` and atomically writes its exact
validated sorted ID set to a new private SHA-256-bound manifest without direct
SQL. Then run the same script in projection mode; it calls
`shopify-customers.project-backfill` in batches of at most 250, checkpoints
after every exact success receipt, and checks health, pause markers and I/O
pressure before the next batch. Run a second pass with a fresh checkpoint and
require it to create nothing and replay every exact source observation.

## Boundaries

- Do not query Nex or MoonSleep databases directly.
- Do not merge identities by email, phone, name, or address.
- Do not mutate Shopify or another provider.
- Do not refetch or re-ingest an already committed historical source corpus to
  prove projection replay.
- Do not call an unbounded whole-corpus projection operation.
- Do not hand-assemble the production record-ID manifest.
- Do not replace Dispatch fulfillment ownership.
- Do not enable a production backfill until PostgreSQL runtime, restart, and
  replay gates pass.
- Do not use Entity tags as customer-role authority; require the Customer Facet.
- Do not invoke the legacy Shopify Customer Facet bridge or copy accepted
  Observation receipts into `core_graph_accepted_observation_receipts`.
- Do not enable either projector job or any projection subscription before a
  separately reviewed representative customer+Order canary and identical replay.
