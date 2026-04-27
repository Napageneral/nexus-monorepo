# Devenir Wix Website Outcome Profile

**Status:** CANONICAL
**Last Updated:** 2026-04-07
**Related:** [Devenir Wix Web Signals Supported Install](/Users/tyler/nexus/home/projects/nexus/docs/specs/devenir-wix-web-signals-supported-install.md), [Wix Devenir Aesthetics Read-Only Exploration](/Users/tyler/nexus/home/projects/nexus/docs/validation/wix-devenir-aesthetics-readonly-exploration.md), [Web Journey Source Adapter](/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/docs/specs/web-journey-source-adapter.md), [Web Signals Control-Plane App](/Users/tyler/nexus/home/projects/nexus/packages/apps/web-signals/app/docs/specs/WEB_SIGNALS_CONTROL_PLANE_APP.md), [Attribution Intelligence Taxonomy](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-taxonomy.md)

---

## Purpose

This document defines the published Devenir Wix website surface that Nex must
cover through the first-party `web-signals` + `web-journey` install.

Its job is to make the Devenir website slice explicit enough that Nex can:

- capture middle-funnel behavior truthfully
- preserve the bridge evidence needed to join to Zenoti, Meta, and future Wix
  backend outcomes
- avoid shipping a generic Wix snippet that only guesses at Devenir's real
  outcome surfaces

## Scope

This profile covers browser-observable behavior on `https://www.deveniratx.com/`.

It does not claim:

- final backend order or gift-card truth
- in-iframe Zenoti booking steps after the Devenir site hands the visitor off
- Wix-internal APIs or unstable implementation details that are not visible in
  the published DOM

## Published Surface Profile

The public Devenir sitemap crawl on `2026-04-07` exposed `219` published URLs:

- `31` standard pages
- `90` store product pages
- `87` blog posts
- `6` blog categories
- `5` event detail pages

The current published surface families that the website install must cover are:

- booking and service handoff routes:
  `/services`, `/bookonline`, and localized booking paths such as
  `/es/bookonline`
- direct Zenoti handoff controls:
  `https://deveniratx.zenoti.com/webstoreNew/services/433ee0e5-16e3-425d-bfaf-f192b7b5f9c4`
- storefront and commerce routes:
  `/shop`, `/shop-1`, `/isdinproducts`, `/skinbetterproducts`,
  `/alastinproducts`, `/epionceproducts`, `/revision-skincare`,
  `/skinceuticals`, `/elta-md-1`, and `90` `/product-page/*` URLs
- gift-card route:
  `/gift-card`
- membership and loyalty routes:
  `/memberships`, `/loyalty`
- contact and lead-capture route:
  `/contact`
- marketing-intent routes:
  `/specials`, `/specials-1`, `/refer-friends`, `/referral`,
  and `5` `/event-details/*` routes

The crawl also proved page-local outcome controls beyond global nav text:

- direct Zenoti booking links on `/` and `/services`
- `Add to Cart` and `Checkout` on `/shop` and representative product pages
- `Buy Now` and `Checkout` on `/gift-card`
- real Wix forms on `/contact` and the homepage

## Canonical Outcome Families

### Booking Handoff

The install must treat the following as booking-intent surfaces:

- direct links to `deveniratx.zenoti.com`
- links whose path is `/bookonline`
- links whose path is `/es/bookonline`
- visible controls whose only truthful target is the same Zenoti handoff

Required browser events:

- `page_view` on booking-related pages
- `booking_start` when the visitor clicks from the Devenir site into the
  booking flow

Required bridge evidence:

- normalized target URL
- target host and target path
- route family `booking`
- provider hint `zenoti` when the target host proves it
- any visible booking-center hint if it is already present in the URL

### Storefront And Product Commerce

The install must cover Wix storefront and product intent across:

- `/shop` and `/shop-1`
- brand/category storefront pages
- every `/product-page/*` route
- visible `Add to Cart` controls
- visible `Checkout` controls

Required browser events:

- `page_view` for storefront pages
- `product_view` for `/product-page/*`
- `cart_add` for `Add to Cart`
- `checkout_start` for storefront or product `Checkout`

Required bridge evidence:

- normalized route family `storefront` or `product`
- target URL or page path
- visible control label
- storefront or product-path hints that survive into downstream joins

### Gift Card Commerce

The install must treat `/gift-card` as its own outcome family rather than fold
it into generic storefront clicks.

Required browser events:

- `page_view` on `/gift-card`
- `checkout_start` for `Buy Now`
- `checkout_start` for gift-card checkout controls

Required bridge evidence:

- route family `gift_card`
- target URL or page path
- visible control label

### Membership And Loyalty

The install must preserve membership and loyalty intent as distinct surfaces:

- `/memberships`
- `/loyalty`

Required browser events:

- `page_view`
- `cta_click` with distinct `membership` and `loyalty` surface metadata

Required bridge evidence:

- route family `membership` or `loyalty`
- target URL or page path
- visible control label

### Contact And Lead Capture

The install must treat homepage and contact-page Wix forms as real outcome
surfaces.

Required browser events:

- `page_view`
- `form_start`
- `form_submit`

Required bridge evidence:

- route family `contact`
- normalized page path
- visible form label or submit label when discoverable
- stable DOM-visible hints only; no dependence on dynamic Wix ids

### Specials, Referrals, And Events

The install must preserve high-intent marketing routes even when they do not
immediately hand off to a backend system:

- `/specials`
- `/specials-1`
- `/refer-friends`
- `/referral`
- `/event-details/*`

Required browser events:

- `page_view`
- `cta_click` when no more specific outcome class applies

Required bridge evidence:

- route family `specials`, `referral`, or `event`
- normalized page path
- visible control label

## Classification Rules

The Wix snippet for Devenir must classify outcomes in this order:

1. exact host and exact path matches for booking, storefront, product, gift
   card, membership, loyalty, contact, specials, referral, and event routes
2. exact control-label matches such as `Add to Cart`, `Checkout`, and
   `Buy Now`
3. generic click fallback only when no exact Devenir surface rule applies

The classifier must also:

- preserve locale-aware paths instead of collapsing localized routes
- distinguish nav-origin clicks from page-local outcome controls when the DOM
  exposes that difference
- use explicit route-family and control metadata names instead of a generic
  catch-all field
- keep the shared `web-journey` event vocabulary generic while expressing
  Devenir-specific outcome families through explicit metadata

## Truthfulness Rules

The Devenir Wix install must not:

- call a click `booking_start` unless the target or route really maps to the
  booking surfaces above
- collapse `Add to Cart`, `Checkout`, `Buy Now`, contact forms, and booking
  handoff into the same generic outcome class
- claim visibility into Zenoti iframe interactions that happen after the site
  handoff
- claim completed purchase truth from browser clicks alone

## Consent And Categorization Posture

The canonical posture for this install is that it is analytics and external
data-sharing code.

That means:

- the snippet is not a `functional` site enhancement
- an `essential` categorization is an operator override, not the truthful
  default
- if an always-load posture is used for operational reasons, the compliance
  risk must be treated as an explicit exception rather than hidden in the
  contract
