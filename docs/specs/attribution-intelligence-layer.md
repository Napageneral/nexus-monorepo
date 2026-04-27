# Attribution Intelligence Layer

**Status:** CANONICAL
**Last Updated:** 2026-03-30
**Related:** [Attribution Intelligence Taxonomy](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-taxonomy.md), [Web Signals Control Plane And Web Adapter Family](/Users/tyler/nexus/home/projects/nexus/docs/specs/web-signals-control-plane-and-web-adapter-family.md), [Spec-Driven Development Workflow](/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md), [Spec Standards](/Users/tyler/nexus/home/projects/nexus/docs/spec-standards.md)

---

## Purpose

This document defines the target-state attribution intelligence product layer
for Nexus.

The system connects:

- acquisition inputs from ad managers and traffic sources
- first-party website behavior
- backend outcome truth

It reconciles those inputs into one operator-facing attribution and business
insight surface.

This document describes the finished architecture only.

## Customer Experience

The intended customer experience is:

1. an operator connects ad platforms, website inputs, and backend outcome
   systems through reusable Nex packages
2. the system backfills historical data and then keeps live sync current
3. the attribution intelligence app detects the configured inputs for the
   customer's business scope
4. the app reconciles acquisition, website, and backend truth into one unified
   model
5. the operator can inspect paid performance, source mix, funnel progression,
   attributed outcomes, and business trends through one product UI
6. the operator does not need to understand provider-specific quirks to answer
   ordinary business questions

## Product Boundary

The attribution intelligence layer is an app package that depends on reusable
adapters plus the shared web-signals and web-adapter family.

It is not:

- one provider-specific adapter
- one ecommerce-only product
- one EMR-only product
- a memory-first insight system

It is the app-owned reconciliation and analytics layer above shared inputs.

## Shared Package Model

The target-state package split is:

- shared acquisition adapters for Meta Ads, Google Ads, TikTok Business, and
  later additional paid platforms
- one shared TikTok Display adapter for profile and video-library provider data
- shared backend outcome adapters for Shopify, EMRs, CRMs, scheduling systems,
  and payment systems
- one shared web-signals control plane plus web-adapter family for first-party
  session, funnel, and browser telemetry capture
- one attribution intelligence app package that builds product logic on top of
  those inputs

The same upstream packages must be reusable across multiple downstream apps.
The attribution intelligence app is only one consumer of that shared substrate.

## Input Model

The app consumes three input classes defined in
[Attribution Intelligence Taxonomy](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-taxonomy.md):

- acquisition inputs
- website inputs
- backend outcome inputs

The app does not infer product topology from arbitrary records alone.

Instead, it owns explicit input bindings that declare:

- which connected inputs are active
- what business scope they belong to
- which role each input serves
- whether one input is authoritative or secondary for a given surface

## Canonical Facts

The app owns and materializes these canonical facts:

- ad performance fact
- web event
- web session attribution
- conversion bridge
- business outcome
- outcome attribution
- aggregate marts

These facts are app-owned durable state.
They are not ad hoc summaries stored in general memory systems.

## Metrics Model

The app must support operator-facing measures such as:

- spend
- impressions
- clicks
- landing page views
- purchases or outcome counts
- purchase or outcome value
- click-through rate
- cost per click
- cost per acquisition
- return on ad spend
- funnel conversion by step
- paid versus non-paid mix
- source confidence and attribution coverage

Derived measures belong to app-owned marts and read models.

## Provider-Native Preservation

The system preserves provider-native identifiers wherever available.

This includes:

- account ids
- campaign ids
- ad group ids
- ad ids
- provider click ids
- backend-native outcome ids
- website bridge ids

The attribution layer may simplify the operator view, but it does not discard
the evidence needed for trustworthy joins and debugging.

## Web Signal Contract

The shared web-signals and web-adapter family must provide:

- a stable session identity model
- first-party capture of page, referrer, and attribution parameters
- event emission for canonical funnel steps
- handoff or bridge fields that survive into backend outcomes where possible
- installation paths suitable for common customer website environments
- a distinct browser runtime telemetry lane that does not redefine the journey
  contract

Supported website environments may vary, but the contract must stay canonical.

## Backend Outcome Contract

The backend outcome contract must support multiple source systems while
preserving one consistent app-facing model.

Examples of supported business outcome families:

- ecommerce orders
- appointment bookings
- encounter completions
- collected revenue events

Different source systems may populate different fields, but they all map into
the same business outcome and outcome attribution model.

## Jobs And Runtime Work

The app owns its own jobs and state.

Representative app-owned work includes:

- reconciliation jobs
- aggregate materialization jobs
- input freshness and gap detection
- recovery and replay over app-owned facts
- UI-serving read model refresh

Adapters own adapter-specific backfill and monitoring.
The app owns app-specific joins and derived work.

## Storage Model

The attribution intelligence app owns a dedicated database for canonical facts,
bindings, reconciliation state, and aggregate marts.

General memory systems may store summaries, annotations, or agent outputs, but
they are not the primary system of record for attribution analytics.

## UI Surface

The app UI should give operators one clear view of:

- connected inputs and data freshness
- paid acquisition performance
- website funnel behavior
- backend outcomes
- attribution coverage and confidence
- reconciled channel and source insights

The UI is a product surface over app-owned facts and marts.
It is not a thin pass-through wrapper over individual adapters.

## Validation Posture

The target-state system is validated through:

- adapter-level proof for connection, backfill, and live sync
- website-install proof for first-party input capture
- end-to-end proof from acquisition click through attributed business outcome

The golden business journey is:

1. acquisition input arrives
2. website session and funnel events are captured
3. backend outcome appears
4. reconciliation materializes outcome attribution
5. the operator sees the correct aggregate and inspectable row-level result

## Extensibility

The attribution intelligence layer is intentionally modular.

Future domains such as creative management, social moderation, or traffic
experimentation may compose with it later, but they do not define the core
product boundary.
