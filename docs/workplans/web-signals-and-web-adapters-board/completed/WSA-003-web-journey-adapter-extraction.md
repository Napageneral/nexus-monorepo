# WSA-003 - Web Journey Adapter Extraction

## Outcome

Completed as the canonical `web-journey` adapter with hard-cut `web_*` naming,
adapter auth metadata, canonical journey ingest, and the browser SDK family
rehomed under the adapter package.

## Validation

- `node --test --experimental-strip-types src/contract.test.ts sdk/core/index.test.mjs sdk/gtm/index.test.mjs sdk/shopify-bridge/index.test.mjs`
- `npm run build`
- `nexus package validate .`
