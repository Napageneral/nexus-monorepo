# MoonSleep Commerce Testing

Run the focused tests with the Nex workspace toolchain:

```bash
/Users/tyler/nexus/home/projects/nexus/nex/node_modules/.bin/vitest run \
  jobs/shopify-customer-identity.test.ts \
  hooks/runtime-work.test.ts \
  methods/index.test.ts
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
