# Attribution Website Input Install And Proof Workflow

**Status:** VALIDATION
**Last Updated:** 2026-03-31
**Related:** [Attribution Website Input Package And Install Contract](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-website-input-package-and-install-contract.md), [Attribution Intelligence Layer](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-layer.md), [Attribution Intelligence Taxonomy](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-taxonomy.md)

---

## Purpose

This document defines the default operator workflow for installing the shared
website input package family on a customer website and proving that the install
captures attribution evidence correctly.

It also defines how companion pixel installs fit into the same onboarding
motion without changing the first-party website input contract.

## Core Principle

The Nex-side collector is not installed on the customer website.

The customer website receives one site-side sender package:

- `website-input-core`
- `website-input-gtm`
- an environment wrapper such as `website-input-wix`

That sender emits canonical website events to `website-input-collector`.

## Default Operator Flow

The default operator flow is:

1. qualify the customer website environment
2. create or select the Nex `website_installation_id`
3. choose the install mode
4. install baseline first-party capture
5. wire explicit funnel and handoff surfaces
6. add bridge extensions for backend-controlled flows
7. install or verify companion pixels and tag ownership
8. run the proof flow
9. hand the installation to downstream attribution-app binding

## Preflight Checklist

Before install begins, the operator must know:

- the website platform and editing surface
- whether the site supports direct code changes, GTM, custom code, or a
  platform-specific extension model
- whether the site is SPA-like and needs route-change handling
- the consent and cookie-management surface
- the backend handoff type:
  - checkout
  - form
  - booking
  - lead
  - intake
  - payment
- the system of record for the downstream business outcome
- whether Meta, Google, and TikTok pixels already exist and who currently owns
  them

## Install Modes

The install decision tree is:

1. prefer direct SDK install on custom-code websites
2. use GTM when the customer already relies on GTM and the needed funnel
   surfaces are observable there
3. use a platform wrapper when the website environment constrains direct code
   access
4. add bridge extensions whenever the site hands off into a backend-controlled
   flow

Baseline capture and bridge-quality attribution are different milestones.

Baseline capture means:

- page and route visibility
- browser and session identity
- referrer, UTMs, and paid click ids
- primary CTA capture

Bridge-quality attribution means:

- explicit handoff events
- preserved bridge identifiers
- traceable linkage into the backend outcome system

## Custom-Code Hosted Workflow

This is the default path for sites like MoonSleep where the operator controls
the application codebase.

### Operator Steps

1. create the website installation in Nex and obtain
   `website_installation_id`
2. add `website-input-core` to the site codebase
3. configure collector endpoint, `website_installation_id`, and consent
   behavior
4. initialize the package in the root application shell
5. wire page and route tracking
6. instrument explicit surfaces for:
   - primary CTAs
   - content or product detail views
   - handoff starts
   - handoff confirmations
7. add the required bridge extension when the site enters checkout, form,
   booking, intake, or payment flows
8. install or verify companion pixels if the customer uses them
9. run the proof flow in staging or preview first, then production

### Expected DX

The developer experience should be:

- one small configuration block
- one root bootstrap
- a small number of explicit helper calls around key surfaces
- no custom event-taxonomy design work
- no need to reimplement browser identity or click-id parsing

### Expected Validation Path

The operator should be able to validate:

- locally or in preview for integration sanity
- in staging with a tagged landing URL
- in production on the final domain for final acceptance

## Wix Workflow

Wix is a first-class environment, but it is not equivalent to a custom-code
site.

### Compatibility Gate

Before install, the operator must determine:

- whether the site supports Wix custom code
- whether the site uses GTM already
- whether the funnel uses Wix-native business solutions such as bookings or
  forms
- whether deeper Velo or platform-native extension work is required

If the site cannot host the needed bootstrap or bridge surface, the install is
not bridge-capable even if baseline capture is still possible.

### Operator Steps

1. create the website installation in Nex and obtain
   `website_installation_id`
2. choose the Wix install lane:
   - custom-code baseline
   - GTM baseline
   - deeper Wix wrapper plus bridge work
3. install the baseline bootstrap site-wide
4. confirm route-change handling for the Wix navigation model
5. register explicit CTA, form, booking, or service surfaces into the canonical
   website event contract
6. add Wix-specific bridge work for bookings, forms, or other backend-controlled
   flows when generic bootstrap is insufficient
7. install or verify companion pixels using one chosen ownership path
8. publish the site
9. run the proof flow on the published domain

### Expected DX

The developer or operator experience should be:

- one Wix-specific install choice inside Nex
- generated instructions for the exact Wix lane
- a clear distinction between:
  - baseline first-party capture
  - deeper bridge work
- no promise that GTM alone can solve every Wix business-solution path

### Expected Validation Path

The operator should expect:

- limited confidence from unpublished or partially instrumented previews
- final acceptance on the published connected domain
- extra proof steps when bookings, forms, or other Wix-native flows own the
  handoff

## Companion Pixels

Companion pixels are part of the operator onboarding motion, but they are not
the first-party source of truth.

The policy is:

1. the website input package family remains the canonical first-party
   attribution surface
2. Meta, Google, and TikTok pixels are optional companion installs for
   platform-side optimization and matching
3. every install must declare pixel ownership clearly:
   - native platform integration
   - GTM
   - custom code
4. one event surface must not be owned by multiple competing pixel paths
5. duplicate tag ownership is a validation failure

## Standard Proof Script

The standard proof script is:

1. open a tagged landing URL that includes expected UTMs and, when possible, a
   paid click identifier
2. confirm one accepted `page_view` under the correct
   `website_installation_id`
3. confirm the event preserved:
   - `browser_id` in standard mode
   - `session_id`
   - landing URL
   - referrer when present
   - UTMs and click ids when present
4. navigate to one additional tracked step and confirm identity continuity
5. trigger the primary CTA and confirm `cta_click` or the stronger
   domain-specific event with the expected descriptor fields
6. enter the handoff flow and confirm:
   - `handoff_start`
   - explicit bridge fields
   - `handoff_confirmed` or the relevant stronger domain-specific completion
     event when confirmation is available
7. if a backend bridge is installed, confirm the downstream system preserves
   the expected bridge identifiers
8. if companion pixels are part of the install, confirm the selected ownership
   path fired the expected platform events exactly once

## Pass Conditions

The install passes when:

1. the canonical website events arrive under the correct
   `website_installation_id`
2. identity, landing, referrer, label, and paid-id evidence are preserved as
   expected for the install mode
3. the primary site surfaces emit the intended canonical event names and
   descriptor fields
4. bridge identifiers are explicit and traceable across the handoff
5. degraded mode is explicit when consent blocks persistent identity
6. companion pixel ownership is unambiguous and non-duplicative

## Failure Modes Requiring Rework

The install is not complete when:

- the site emits only page views and no meaningful CTA or handoff events
- the site cannot preserve bridge identifiers into the backend flow
- multiple pixel ownership paths fire duplicate platform events
- the platform environment supports baseline capture but not the promised
  bridge behavior
- consent behavior silently suppresses required fields without marking degraded
  mode
