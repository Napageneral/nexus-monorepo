# MoonSleep Commerce

Use this app to project committed Shopify source records into MoonSleep's Nex
identity and typed commerce surfaces.

## Current operation

The installed app registers one job for Shopify `record.ingested` events. The
job ignores non-customer records. For a customer record it:

1. Reads the committed record through `records.get`.
2. Verifies the exact provider JSON hash and stable source anchors.
3. Calls `contacts.observe` with the shop domain and Shopify customer GID.
4. Calls `entities.resolve` for the observed entity.
5. Calls `entities.tags.list` and requires `Customer` and `Shopify`.
6. Returns exact projection identifiers for the durable job receipt.

## Boundaries

- Do not query Nex or MoonSleep databases directly.
- Do not merge identities by email, phone, name, or address.
- Do not mutate Shopify or another provider.
- Do not replace Dispatch fulfillment ownership.
- Do not enable a production backfill until PostgreSQL runtime, restart, and
  replay gates pass.
