# Web Journey Source Adapter

**Status:** CANONICAL
**Last Updated:** 2026-04-06
**Related:** [Web Signals Control Plane And Web Adapter Family](/Users/tyler/nexus/home/projects/nexus/docs/specs/web-signals-control-plane-and-web-adapter-family.md), [Source Adapters, Control-Plane Apps, and Proof Standard](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/source-adapters-control-plane-and-proof-standard.md)

## Purpose

`web-journey` is the first-party web signal adapter for journey and
attribution-evidence ingest.

It owns the middle-funnel source contract for browser-originated journey truth.
It is not a provider-backed adapter.

## Owned Truth

`web-journey` owns:

- session and browser identity for first-party journey flows
- canonical journey event names
- landing, referrer, and paid-id evidence preservation
- bridge identifiers that later join to checkout, form, booking, or intake
  outcomes
- canonical `record.ingest` emission for normalized journey rows
- push-based freshness semantics for real browser events

## Canonical Event Families

The adapter is expected to truthfully model journey events such as:

- page or route activity
- product or service detail views
- CTA or intent clicks
- form or booking starts
- checkout or intake starts
- handoff confirmations

These are journey evidence events, not browser performance telemetry.

## Payload Model

The adapter accepts browser-originated journey payloads through a trust-bound
installation connection.

The canonical payload includes:

- `web_installation_id`
- `event_id`
- `captured_at`
- `received_at`
- `consent_state`
- `event_name`
- session and browser identifiers
- page and host identifiers
- referrer and event-source evidence
- UTM and click-id evidence
- surface, target, and bridge fields
- optional metadata

The adapter must preserve any bridge fields needed to join later to backend
outcomes.

## Connection Identity

Each bound source instance has a first-class adapter connection identity.

That identity represents:

- the bound `web_installation_id`
- the connection id that actually receives and emits the adapter's records
- freshness state
- source-specific configuration

The control-plane installation identity and the adapter connection identity are
related but not the same thing.

## Record Contract

The canonical emitted record is a `record.ingest` envelope whose payload
preserves the normalized row as:

- `row`
- `web_event`

The routing metadata must preserve the truth needed for later downstream
binding, including installation identity and the session/thread linkage.

## Live Sync And Freshness

`web-journey` is push-based.

Its temporal model is:

- live browser emission into the adapter collector
- freshness measured by recent event age and last-event state
- dedupe for repeated event ids where the adapter claims it
- replay or historical import only if a real replay source exists later

It does not claim provider-style historical backfill semantics by default.

## Control-Plane Relationship

`web-signals` owns installation lifecycle, tokens, and trust policy.

`web-signals` may proxy authenticated routing to `web-journey`, but the
adapter remains the owner of the canonical journey source contract.

`attribution` consumes `web-journey` rows rather than raw browser payloads.

## Truthfulness Rules

`web-journey` must not claim:

- browser performance telemetry ownership
- attribution scoring or decisioning
- provider-backed full-surface behavior
- history replay that does not actually exist

## Related Corpus

- [Workplan](/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/docs/workplans/web-journey-source-adapter-corpus-and-proof-ladder.md)
- [Validation](/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/docs/validation/web-journey-source-adapter-validation.md)
- [Skill](/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/SKILL.md)
