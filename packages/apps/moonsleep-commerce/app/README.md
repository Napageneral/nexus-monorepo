# MoonSleep Commerce

Installable Nex app for MoonSleep customer identity and typed commerce
projection from exact provider records.

The first vertical consumes committed Shopify customer records. It observes a
stable Shopify contact, resolves the canonical Nex entity, and verifies the
`Customer` and `Shopify` tags. It uses public Nex operations only.

Current scope:

- Shopify customer identity projection
- dormant `record.ingested` job registration pending the governed PostgreSQL
  event-to-work handoff
- deterministic shop-domain and customer-GID contact anchors
- exact provider JSON hash verification
- conservative identity behavior with no email, phone, or name merge

Not yet implemented:

- typed order and line-item projection
- historical production backfill execution
- continuous production monitor activation
- event subscription activation before the crash-safe event handoff lands
- Shopify, Dispatch, payment, refund, or fulfillment writes
