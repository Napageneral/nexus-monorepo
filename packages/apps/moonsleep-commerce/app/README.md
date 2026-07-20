# MoonSleep Commerce

Installable Nex app for MoonSleep customer identity and typed commerce
projection from exact provider records.

The first vertical consumes committed Shopify customer records. It observes a
stable Shopify contact, resolves the canonical Nex entity, and verifies the
`Customer` and `Shopify` tags. It uses public Nex operations only.

Current scope:

- Shopify customer identity projection
- bounded explicit customer cohort projection for pre-activation production proof
- dormant `record.ingested` job registration pending the governed PostgreSQL
  event-to-work handoff
- deterministic shop-domain and customer-GID contact anchors
- exact provider JSON hash verification
- conservative identity behavior with no email, phone, or name merge

The cohort method accepts 1-50 exact committed record IDs. It validates the
entire cohort before the first identity observation, then uses the same
replay-safe public operations as the dormant event job. It exists only to prove
real records and identity bindings before bulk event delivery is activated.

Not yet implemented:

- typed order and line-item projection
- historical production backfill execution
- continuous production monitor activation
- event subscription activation before the crash-safe event handoff lands
- Shopify, Dispatch, payment, refund, or fulfillment writes
