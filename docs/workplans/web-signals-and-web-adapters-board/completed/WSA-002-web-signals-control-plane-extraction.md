# WSA-002 - Web Signals Control Plane Extraction

## Outcome

Completed as the dedicated `web-signals` control-plane app with installation
lifecycle, sender-token issuance, adapter-backed collect methods, and
record-backed QA reads.

## Validation

- `node --test methods/index.test.ts methods/store.test.ts`
- `nexus package validate .`
