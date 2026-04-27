# Web RUM Source Adapter Corpus

## Status

Active package-local workplan.

## Goal

Keep the `web-rum` package-local corpus aligned to the canonical
source-adapter standard and the web family split.

## Current Shape

The package is already a real sibling adapter scaffold with:

- `capture`
- `capture.batch`
- `web_installation_id`-bound runtime config
- canonical `record.ingest` emission
- `web-rum` adapter identity

## Remaining Work

The package-local corpus should keep tightening around:

- adapter-owned source contract language
- connection identity and freshness semantics
- distinction from `web-journey`
- truthful validation language
- truthful skill language

## Execution Order

1. keep the local spec aligned to the source-adapter standard
2. keep the skill aligned to the actual adapter surface
3. keep validation notes truthful about the current proof posture
4. avoid reintroducing `website-*` residue or journey semantics

## Exit Criteria

This workplan is complete when:

1. the package-local corpus reads as a real sibling source adapter
2. it does not overclaim maturity beyond the actual scaffold
3. it stays aligned to the umbrella web family contract

