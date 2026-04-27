# Web Journey

`web-journey` is the canonical first-party web signal adapter for journey and
attribution-evidence ingest.

It is a source adapter, not a provider-backed adapter.

## What This Package Owns

- canonical browser journey event ingest
- `web_installation_id`-bound connection identity
- live push-based freshness semantics
- `record.ingest` emission for normalized web journey rows
- journey-specific metadata preservation for attribution and handoff proof

## What This Package Does Not Own

- installation lifecycle and sender-token issuance
- browser trust/bootstrap policy
- attribution scoring or dashboard UI
- browser performance telemetry

Those concerns belong to the `web-signals` control plane, the `attribution`
app, and the sibling `web-rum` adapter.

## Canonical Package Corpus

- [Package Spec](/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/docs/specs/web-journey-source-adapter.md)
- [Workplan](/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/docs/workplans/web-journey-source-adapter-corpus-and-proof-ladder.md)
- [Validation](/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/docs/validation/web-journey-source-adapter-validation.md)
- [Skill](/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/SKILL.md)

## Local Surface Summary

- adapter platform: `web-journey`
- adapter command surface: `collect`, `collect.batch`
- connection field: `web_installation_id`
- emitted metadata: `row`, `web_event`

## Validation Quick Start

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey
npm test
npm run lint
npm run build
nexus package validate .
```
