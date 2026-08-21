# MoonSleep Commerce Testing

Run the focused tests with the Nex workspace toolchain:

```bash
/Users/tyler/nexus/home/projects/nexus/nex/node_modules/.bin/vitest run \
  jobs/shopify-customer-identity.test.ts \
  jobs/shopify-order-commerce.test.ts \
  hooks/runtime-work.test.ts \
  methods/index.test.ts
```

Validate the package:

```bash
nexus package validate .
```

Before any production canary, the validation ladder in
`docs/validation/shopify-customer-identity.md` must pass against a fresh
MoonSleep PostgreSQL runtime. Start with the smallest representative
customer+Order page and ingest it twice. The second pass must prove no duplicate
Entity, Contact, semantic evidence, Customer Facet, Commerce Order, or line item.

Order/line-item proof must also ingest the exact same page twice. The second
pass must report only idempotent replays, exact canonical customer links, and
unchanged address snapshot hashes.

The service-shaped cleanroom invokes the native app methods through the public
HTTP operation surface and proves first-pass and replay behavior against
PostgreSQL 17 while the continuous job and subscription remain inactive.
The PostgreSQL readback must retain exactly one active Customer Facet and zero
rows in the compatibility-only accepted-Observation receipt table.
It also proves the dormant live topology is exactly two jobs and three
record-family subscriptions: customer Records schedule only the identity
projector, while order and line-item Records schedule only the commerce
projector. Disabled legacy broad subscriptions are migrated; active or foreign
subscriptions fail closed.

Source-job tests must prove that one provider page advances its cursor only
after every Record is durably ingested, and that a failed page leaves the cursor
unchanged for an idempotent retry.
