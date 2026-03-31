# Attribution Website Input Package And Install Contract

**Status:** CANONICAL
**Last Updated:** 2026-03-31
**Related:** [Attribution Intelligence Layer](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-layer.md), [Attribution Intelligence Taxonomy](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-taxonomy.md), [Spec-Driven Development Workflow](/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md)

---

## Purpose

This document defines the target-state shared website input package family for
the attribution intelligence domain.

The package family gives Nex one reusable first-party website contract that can
be installed on customer websites, emit canonical website events, preserve
attribution evidence, and carry bridge identifiers into backend outcome
systems.

It is intentionally generic across website environments.

It is not:

- one MoonSleep-specific tracker
- one ecommerce-only snippet
- one Wix-only integration
- one temporary bridge for a single backend

## Customer Experience

The intended operator experience is:

1. choose the website environment and install mode for the customer site
2. install one shared website input package using a direct embed, GTM, or a
   platform-native wrapper
3. verify that page, session, attribution, and funnel events are arriving in
   Nex under one canonical contract
4. add one or more backend bridge extensions when the site hands off into
   checkout, forms, bookings, intake flows, or other backend-controlled
   surfaces
5. run one explicit QA proof to confirm that the website install preserves the
   evidence required for later attribution
6. let downstream attribution apps consume the same website input contract
   regardless of whether the site runs on custom code, GTM, Wix, Shopify, or a
   later platform wrapper

The operator should not need to design a custom event taxonomy for every site.

## Product Boundary

The website input package family owns:

- browser-side identity and event emission
- canonical website event naming
- first-party capture of landing, referrer, label, and paid-id evidence
- bridge identifier capture on handoff flows
- collector-side acceptance of canonical website events
- install modes and QA expectations for supported website environments

The package family does not own:

- ad-platform API ingest
- backend outcome truth
- final attribution decisions
- session attribution logic
- outcome reconciliation
- dashboard UI

Those behaviors belong to shared acquisition adapters, shared backend outcome
adapters, and the attribution intelligence app.

## Package Family

The target-state package family is:

- `website-input-core`
- `website-input-collector`
- `website-input-gtm`
- `website-input-qa`
- environment wrappers such as `website-input-wix`
- backend bridge extensions such as `website-input-shopify-bridge` and later
  EMR bridge packages

The package boundaries are strict:

- `website-input-core` defines the browser SDK contract, identity model, and
  canonical event model
- `website-input-collector` accepts canonical website events into Nex and
  preserves them as durable shared input records
- `website-input-gtm` maps GTM data-layer installs into the same core contract
- `website-input-qa` defines the operator proof path and pass conditions
- environment wrappers adapt constrained website platforms into the same core
  contract without redefining the contract
- bridge extensions preserve identifiers across backend-specific handoff flows
  without redefining the core event model

## Supported Install Modes

The target-state install modes are:

- direct embed through the browser SDK
- GTM through the GTM wrapper
- platform-native wrappers for constrained site environments
- backend bridge extensions for checkout, forms, bookings, intake, payment, or
  other backend handoff flows

Every install mode must emit the same canonical website event contract.

Install mode changes may alter:

- how the package is loaded
- how site-specific hooks are registered
- which bridge surfaces are available

Install mode changes must not alter:

- the identity model
- canonical event names
- attribution evidence fields
- bridge field names
- collector acceptance rules

## Installation Scope

Each installed website input surface belongs to one runtime-owned
`website_installation_id`.

`website_installation_id` is the durable operational identity for:

- browser SDK configuration
- GTM wrapper configuration
- platform-wrapper configuration
- collector-side deduplication scope
- downstream app binding to the installed website input

The collector stamps `website_installation_id` onto accepted website event
rows.

## Identity Contract

The website input contract is browser-plus-session, not session-only.

### Browser Identity

`browser_id` is the stable first-party pseudonymous identifier for one browser
within one website installation scope.

Target-state rules:

- `browser_id` persists across visits when consent allows persistent storage
- `browser_id` is first-party and installation-scoped
- `browser_id` is attached to every event in standard mode
- `browser_id` is absent only in consent-restricted degraded mode

### Session Identity

`session_id` is the visit-scoped identifier.

Target-state rules:

- `session_id` is attached to every event
- a new session begins on the first event of a visit
- the same `session_id` survives ordinary route changes, SPA navigation, and
  same-visit funnel steps
- `session_id` rotates after prolonged inactivity or an explicit session reset

### Event Identity

Each emitted event has:

- `event_id`: unique client-side identifier for one event instance
- `captured_at`: browser-side timestamp for when the event occurred
- `received_at`: collector-side timestamp for when the event was accepted

### Consent State

Each event declares one `consent_state`.

Allowed values are:

- `granted`
- `denied`
- `unknown`

`consent_state` determines whether persistent identifiers such as `browser_id`
or provider-specific browser cookie values may be emitted.

## Canonical Event Contract

The website input package emits one canonical website event row family.

Each event row must use a finite canonical `event_name` and may attach
site-specific descriptors that explain what concrete page, content object, or
action surface produced the event.

Site-specific naming never replaces canonical `event_name`.

### Required Fields On Every Event

| Field | Meaning |
|---|---|
| `event_id` | Unique event identifier generated by the client |
| `captured_at` | Browser-side event timestamp |
| `event_name` | Finite canonical event vocabulary value |
| `consent_state` | One of `granted`, `denied`, `unknown` |
| `session_id` | Visit-scoped identity |
| `page_url` | Full page URL at event time |
| `page_path` | Path component at event time |
| `host` | Hostname at event time |
| `browser_id` | Stable browser identity in standard mode; nullable in degraded mode |

### Required When Observed

The SDK or wrapper must capture these fields when they are observable at event
time:

| Field | Meaning |
|---|---|
| `referrer` | Browser referrer for the event context |
| `event_source_url` | Source URL or landing URL that supplied attribution evidence |
| `page_title` | Page title when available |
| `user_agent` | Browser user agent when available to the collector path |
| `viewport_width` | Browser viewport width |
| `viewport_height` | Browser viewport height |
| `utm_source` | First-party observed UTM source |
| `utm_medium` | First-party observed UTM medium |
| `utm_campaign` | First-party observed UTM campaign |
| `utm_content` | First-party observed UTM content |
| `utm_term` | First-party observed UTM term |
| `fbclid` | Meta click identifier |
| `fbc` | Meta browser click persistence value |
| `fbp` | Meta browser identity value |
| `gclid` | Google click identifier |
| `gbraid` | Google app-to-web bridge identifier |
| `wbraid` | Google web-to-app bridge identifier |
| `ttclid` | TikTok click identifier |
| `ttp` | TikTok browser persistence value |
| `msclkid` | Microsoft Ads click identifier |

### Site-Specific Descriptors

The contract allows site-specific meaning through descriptor fields rather than
free-form primary event names.

| Field | Meaning |
|---|---|
| `surface_id` | Stable identifier for the UI surface or step that emitted the event |
| `surface_label` | Human-readable label for the emitting surface at event time |
| `surface_category` | Normalized descriptor such as `hero`, `nav`, `product_card`, `form`, `checkout`, or `booking` |
| `target_type` | The object type the event is about, such as `product`, `service`, `article`, `collection`, `checkout`, `form`, or `booking` |
| `target_id` | Durable identifier for the target object when one exists |
| `target_label` | Human-readable target label when one exists |

These descriptors let different websites map their own actions into the same
canonical contract without inventing one-off event vocabularies.

### Canonical Event Names

The baseline canonical website events are:

| `event_name` | Meaning |
|---|---|
| `page_view` | A page or route becomes visible to the user |
| `content_view` | The user views a primary content object on the site |
| `cta_click` | The user clicks an operator-significant action surface |
| `handoff_start` | The site begins a transfer into a backend-controlled flow |
| `handoff_confirmed` | The site confirms that the backend-controlled flow was created or reached |
| `handoff_unconfirmed` | The site attempted a handoff but could not confirm backend creation or arrival |

The lead-generation extensions are:

| `event_name` | Meaning |
|---|---|
| `form_view` | A lead form becomes visible |
| `form_start` | The user begins interacting with a lead form |
| `form_submit` | The site submits a lead form |
| `booking_start` | The user begins a booking flow |
| `booking_complete` | The site confirms a booking completion |

The commerce extensions are:

| `event_name` | Meaning |
|---|---|
| `product_view` | The user views a distinct product detail experience |
| `cart_add` | The user adds an item to cart |
| `checkout_start` | The user begins checkout |
| `checkout_created` | The site confirms that a checkout session exists |
| `checkout_complete` | The site confirms checkout completion |

### Event Mapping Rules

The mapping rules are:

1. every event must use one canonical `event_name`
2. site-specific actions must be expressed through descriptor fields, not a new
   primary event name
3. `surface_id` must be stable across ordinary copy changes
4. `surface_label` captures the operator-visible copy at event time
5. `content_view` is the generic object-view event when the site does not need
   a domain-specific extension
6. domain-specific extension events are used when the site genuinely has the
   stronger concept, such as `product_view`, `form_submit`, or
   `booking_complete`

## Bridge Contract

The website package family preserves bridge identifiers so that downstream
systems can join website intent to backend outcome truth.

Bridge identifiers are explicit fields.
They must not exist only inside `metadata_json`.

### Generic Bridge Fields

| Field | Meaning |
|---|---|
| `bridge_surface` | The handoff surface. Allowed values are `checkout`, `form`, `booking`, `lead`, `intake`, `payment` |
| `handoff_id` | First-party identifier for one handoff attempt or flow instance |

### Commerce Bridge Fields

| Field | Meaning |
|---|---|
| `checkout_token` | Provider checkout token when available |
| `checkout_key` | Provider checkout key when available |
| `checkout_id` | Provider checkout identifier when available |
| `cart_token` | Provider cart token when available |

### Lead And Booking Bridge Fields

| Field | Meaning |
|---|---|
| `form_id` | Site or provider form identifier |
| `form_submission_id` | Site or provider form submission identifier |
| `booking_id` | Site or provider booking identifier |
| `booking_slot_id` | Site or provider booking slot identifier |
| `lead_external_id` | External identifier for the created lead record |

### Optional Domain Fields

The contract also allows optional domain fields when the website environment
has structured business objects:

| Field | Meaning |
|---|---|
| `product_id` | Product identifier for commerce events |
| `variant_id` | Product variant identifier for commerce events |
| `quantity` | Event quantity when meaningful |
| `metadata_json` | Additional non-primary structured context |

Primary attribution and bridge identifiers must always use explicit contract
fields when those fields exist.

## Collector Contract

`website-input-collector` is the Nex-facing ingest surface for canonical
website events.

The collector must:

1. accept single-event and batch-event submissions
2. validate the canonical website event contract
3. stamp `received_at` on acceptance
4. stamp `website_installation_id` on accepted rows
5. deduplicate events by installation scope plus `event_id`
6. persist accepted website events as durable shared input records
7. avoid attribution decisions or backend-outcome joins during ingest

The collector is a transport and preservation surface.
It is not the attribution engine.

## Environment Wrappers

Environment wrappers adapt constrained site platforms into the same contract
without redefining the contract.

The first-class environment wrapper is `website-input-wix`.

`website-input-wix` must support:

- site-wide bootstrap through Wix-supported custom code or equivalent wrapper
  surfaces
- SPA-safe route change capture
- emission of the canonical website event contract
- optional deeper bridge hooks through platform-native extension points when
  generic browser code is not sufficient

Future environment wrappers must follow the same rule:

- platform-specific install mechanics may vary
- the emitted website contract must not vary

## GTM Wrapper

`website-input-gtm` maps GTM installs into the same canonical website event
contract.

It must:

- provide a stable mapping from data-layer events into canonical `event_name`
  values and descriptor fields
- capture the same attribution evidence fields as direct installs when GTM can
  observe them
- preserve `browser_id` and `session_id` continuity across route changes and
  tagged events
- avoid creating a second event taxonomy that diverges from `website-input-core`

## Bridge Extensions

Bridge extensions adapt backend-specific handoff systems into the shared bridge
contract.

Examples include:

- `website-input-shopify-bridge`
- future EMR bridge packages

All bridge extensions must:

- preserve the generic bridge fields
- populate provider-specific bridge fields when available
- carry website-side identifiers into backend-controlled flows using supported
  platform mechanisms
- emit the same canonical website events and bridge fields regardless of
  backend type

The existence of a bridge extension does not create a second website contract.

## Consent And Degraded Mode

The canonical contract supports degraded operation when consent or platform
limits prevent persistent browser storage.

In degraded mode:

- `session_id` remains required
- `browser_id` may be null
- query-parameter evidence such as UTMs and click ids is still captured when
  observable
- provider cookie-derived values such as `fbc`, `fbp`, or `ttp` are omitted if
  consent or platform behavior disallows them

Degraded mode is a supported contract state.
It is not a silent failure mode.

## QA Contract

`website-input-qa` defines the mandatory operator proof for every install.

The standard proof must demonstrate:

1. a tagged landing visit produces a canonical `page_view` with the expected
   landing, referrer, label, and click-id evidence
2. the same visit preserves `browser_id` and `session_id` continuity across at
   least one additional step when standard mode is active
3. a primary action produces `cta_click` or the stronger domain-specific event
   with the expected descriptor fields
4. a handoff flow produces the expected bridge identifiers and
   `handoff_start`, `handoff_confirmed`, or domain-specific completion events
5. accepted events are visible through the Nex collector path under the correct
   installation scope
6. degraded mode behavior is explicit and inspectable when consent blocks
   persistent identity

## Done Definition

The website input package family is complete for attribution products when:

1. one shared browser-plus-session contract exists across direct, GTM, and
   platform-wrapper installs
2. canonical website events preserve the required attribution evidence fields
3. bridge identifiers are explicit, generic, and backend-extensible
4. the collector preserves canonical website input records without performing
   attribution work
5. Wix and other constrained platforms adapt into the same contract rather than
   defining their own parallel taxonomy
6. every install path has one repeatable operator QA proof
