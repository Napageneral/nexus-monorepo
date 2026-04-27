# Web RUM

`web-rum` is the sibling source adapter scaffold for browser runtime telemetry
in the web signals family.

## Current State

The package is a truthful sibling source-adapter scaffold, not a full browser
telemetry product.

It truthfully establishes:

- `web_installation_id`-bound connection identity
- `capture` and `capture.batch`
- canonical RUM record ingest
- freshness semantics for recent browser telemetry

It is intentionally distinct from `web-journey` and from the `web-signals`
control plane.

## Canonical Docs

- [Package spec](/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-rum/docs/specs/web-rum-source-adapter.md)
- [Package workplan](/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-rum/docs/workplans/web-rum-source-adapter-corpus.md)
- [Package validation](/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-rum/docs/validation/web-rum-validation.md)

## Surface

- runtime config: `web_installation_id`
- adapter platform: `web-rum`
- commands: `capture`, `capture.batch`

## Validation

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/web-rum
node --test --experimental-strip-types src/contract.test.ts
npm run build
nexus package validate .
```
