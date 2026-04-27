# Testing

Run the package contract checks from the package root:

```bash
node --test --experimental-strip-types src/contract.test.ts
npm run build
nexus package validate .
```

The tests are meant to keep the package boundary truthful:

- `web-rum` must stay distinct from `web-journey`
- the adapter surface must remain tied to `web_installation_id`
- the package should not leak `website-*` legacy naming

This package is a sibling source-adapter scaffold. It is not claiming the full
browser telemetry product yet.
