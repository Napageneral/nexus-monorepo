# Web RUM Source Adapter

## Status

Canonical package-local spec.

## Purpose

`web-rum` is the sibling source adapter for browser runtime telemetry in the
web adapter family.

It is distinct from `web-journey`.

- `web-journey` owns first-party journey and attribution-evidence ingest
- `web-rum` owns runtime telemetry ingest for browser performance and errors

`web-rum` is also distinct from the `web-signals` control-plane app.

## Canonical Surface

The package owns a source-adapter surface centered on:

- `web_installation_id`-bound connection identity
- `capture`
- `capture.batch`
- canonical `record.ingest` emission for normalized RUM rows
- freshness semantics driven by recent ingest and adapter health

## Contract

The `web-rum` contract is browser runtime telemetry, not attribution journey
events.

The canonical row family includes fields such as:

- event identity and timestamps
- page URL and path
- browser and session identity
- navigation and network timing
- page load and Core Web Vitals style telemetry
- client-side error counts
- free-form metadata needed to preserve source truth

## Connection Identity

Each `web-rum` installation is bound to a runtime adapter connection whose
truthful identity is the `web_installation_id` plus the runtime connection id.

The adapter connection is responsible for:

- exposing health
- preserving freshness state
- accepting the runtime-bound capture surface

## Live Sync Model

`web-rum` is push-based.

Its default behavior is live capture and freshness tracking rather than a fake
historical replay model.

If a future replay or import lane is added, that lane must be explicit and must
not be implied by the default browser collector path.

## Relationship To Other Packages

`web-rum` does not own:

- installation lifecycle and token issuance
- control-plane origin policy
- attribution scoring
- journey-event semantics

Those behaviors belong to `web-signals`, `attribution`, or to the separate
`web-journey` adapter where appropriate.

## Package Corpus

The package-local corpus should consist of:

- [`SKILL.md`](/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-rum/SKILL.md)
- [`README.md`](/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-rum/README.md)
- [`TESTING.md`](/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-rum/TESTING.md)
- [`docs/workplans/web-rum-source-adapter-corpus.md`](/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-rum/docs/workplans/web-rum-source-adapter-corpus.md)
- [`docs/validation/web-rum-validation.md`](/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-rum/docs/validation/web-rum-validation.md)

