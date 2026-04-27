# Attribution Intelligence Taxonomy

**Status:** CANONICAL
**Last Updated:** 2026-03-30
**Related:** [Attribution Intelligence Layer](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-layer.md), [Web Signals Control Plane And Web Adapter Family](/Users/tyler/nexus/home/projects/nexus/docs/specs/web-signals-control-plane-and-web-adapter-family.md), [Spec-Driven Development Workflow](/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md)

---

## Purpose

This document defines the canonical nouns for the shared attribution
intelligence domain.

It exists to keep app, adapter, website, and backend work aligned under one
vocabulary before implementation expands.

## Core Inputs

### Acquisition Input

An acquisition input is an upstream paid or earned traffic source that can
drive sessions and conversions.

Examples:

- Meta Ads
- Google Ads
- TikTok Business
- organic search
- referral and direct traffic once observed through `web-journey`

### Web Journey Input

A web journey input is first-party interaction data emitted from a
customer-owned site or landing experience through the `web-journey` adapter.

Examples:

- page views
- product or service detail views
- CTA clicks
- lead form starts
- checkout or intake starts
- handoff confirmations

### Backend Outcome Input

A backend outcome input is the system-of-record source for business outcomes.

Examples:

- Shopify orders
- EMR appointments
- EMR encounters
- CRM opportunities
- payments or collected revenue systems

## Binding And Scope

### Input Binding

An input binding is the app-owned configuration that declares which adapter
connection or web signal stream serves which role for a given business scope.

An input binding answers:

- which source is acquisition
- which source is website behavior
- which source is backend outcome truth
- which site, account, location, brand, or business unit the source belongs to

### Business Scope

Business scope is the operator-facing grouping that the attribution app
reconciles within.

Examples:

- one ecommerce brand
- one clinic location
- one product line
- one regional business unit

## Canonical Facts

### Ad Performance Fact

The canonical paid media fact row.

Grain:

- platform
- account
- campaign
- ad group
- ad
- window start
- window end
- granularity

Core measures:

- spend
- impressions
- clicks
- landing page views
- purchases
- purchase value

### Web Event

The canonical first-party website event row.

Examples:

- page view
- product view
- CTA click
- intake start
- checkout start

The event row preserves first-party context such as:

- session id
- timestamps
- page and referrer
- UTM fields
- provider click ids

### Web Session Attribution

The canonical best-source session projection derived from website events.

It captures:

- resolved source channel
- attribution confidence
- per-session funnel counts

### Conversion Bridge

The canonical identity bridge between website behavior and backend outcomes.

Examples:

- checkout token or key
- lead form id
- booking id
- intake id

The bridge preserves the evidence needed to join frontend intent to backend
truth.

### Business Outcome

The canonical backend source-of-truth outcome row.

Examples:

- order
- appointment booked
- encounter completed
- revenue collected

The business outcome is not inferred marketing data.
It is the operational truth owned by the backend system.

### Outcome Attribution

The canonical reconciled attribution row for one business outcome.

It captures:

- the current winning source decision
- the evidence used to support that decision
- match method
- match confidence
- paid versus non-paid classification

### Aggregate Mart

An aggregate mart is an app-owned read model derived from canonical facts for
dashboard and analysis use.

Examples:

- channel performance summary
- funnel step conversion table
- paid versus organic trend rollup
- acquisition surface board

## Evidence Vocabulary

### Exact Paid Id Evidence

Provider-native paid click identifiers captured directly from traffic or
handoff flows.

Examples:

- `fbclid`
- `fbc`
- `gclid`
- `gbraid`
- `wbraid`
- `msclkid`
- `ttclid`

### Label Evidence

Campaign or source labels observed through first-party routing data.

Examples:

- UTM source
- UTM medium
- UTM campaign
- UTM content
- UTM term

### Referral Evidence

Referral or landing information that supports attribution but does not provide
paid-entity precision.

Examples:

- referrer
- landing path
- source URL

### Attribution Confidence

The canonical confidence vocabulary for source attribution decisions.

Values:

- `high`
- `medium`
- `low`
- `unknown`

## Product Boundaries

### Adapter Responsibility

Adapters own:

- credentials and setup
- health
- backfill
- live monitoring
- upstream API truth
- canonical record ingest

### App Responsibility

The attribution intelligence app owns:

- input binding
- reconciliation
- source and outcome joins
- attribution decisions
- aggregate marts
- operator UI

### Web Signals Responsibility

The shared web-signals family owns:

- installation and token control plane
- installable first-party instrumentation
- session identity contract
- journey and web-runtime ingest handoff into Nex

## Exclusions

The attribution intelligence taxonomy does not include:

- creative management
- social moderation
- experimental traffic allocation
- generic memory or note-taking semantics

Those may compose with this domain later, but they are not part of the core
attribution vocabulary.
