# MoonSleep Commerce Testing

Run the focused tests with the Nex workspace toolchain:

```bash
/Users/tyler/nexus/home/projects/nexus/nex/node_modules/.bin/vitest run \
  jobs/shopify-customer-identity.test.ts \
  jobs/shopify-order-commerce.test.ts \
  hooks/runtime-work.test.ts \
  methods/index.test.ts

PYTHONDONTWRITEBYTECODE=1 python3 -m unittest \
  scripts.test_shopify_customer_projection_runner \
  scripts.test_shopify_commerce_projection_runner
```

Validate the package:

```bash
nexus package validate .
```

Before production backfill, the validation ladder in
`docs/validation/shopify-customer-identity.md` must pass against a fresh
MoonSleep PostgreSQL runtime. The exact same sorted record set must then be
projected twice; the second receipt must report zero created entities/contacts
and `replayed == records_projected`.

Order/line-item proof must also project the exact same sorted record set twice.
The second pass must report `created=0`, `replayed=records_projected`, unchanged
projection hashes, exact canonical customer links, and unchanged address
snapshot hashes. No proof run may call Shopify.

The service-shaped cleanroom also invokes the bounded runner through the public
HTTP operation surface and proves its first-pass and replay checkpoints against
PostgreSQL 17 while the continuous job and subscription remain inactive.
It also proves the dormant live topology is exactly two jobs and three
record-family subscriptions: customer revisions schedule only the identity
projector, while order and line-item revisions schedule only the commerce
projector. Disabled legacy broad subscriptions are migrated; active or foreign
subscriptions fail closed.

The runner unit suite additionally models the exact 17,090-record production
customer shape. It proves 69 batches at the hard 250-record ceiling, but the
operator defaults remain one 25-record batch per invocation with the stricter
resource gate.

The commerce runner suite models the exact production manifest shape captured
on 2026-07-22: 11,549 immutable order revisions for 11,548 logical orders plus
22,251 line-item revisions. It drains all 33,800 IDs in 676 hard-ceiling
batches across 68 bounded invocations, then repeats the full shape with zero
created rows and 33,800 replayed observations.
