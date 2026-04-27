# Devenir Wix Website Outcome Proof Ladder

**Status:** VALIDATION
**Last Updated:** 2026-04-08
**Related:** [Devenir Wix Web Signals Supported Install](/Users/tyler/nexus/home/projects/nexus/docs/specs/devenir-wix-web-signals-supported-install.md), [Devenir Wix Website Outcome Profile](/Users/tyler/nexus/home/projects/nexus/docs/specs/devenir-wix-website-outcome-profile.md), [Wix Devenir Aesthetics Read-Only Exploration](/Users/tyler/nexus/home/projects/nexus/docs/validation/wix-devenir-aesthetics-readonly-exploration.md), [Web Journey Source Adapter Validation](/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/docs/validation/web-journey-source-adapter-validation.md), [Attribution Web Signals Install And Proof Workflow](/Users/tyler/nexus/home/projects/nexus/docs/validation/web-signals-install-and-proof-workflow.md)

## Purpose

This document defines the repeatable crawl and live-proof ladder for the
Devenir Wix website outcome surface.

It exists so an operator can verify, before any Wix install/publish, that the
snippet plan still matches the published Devenir site and still covers the real
outcome families that matter for Nex attribution.

## Proof Inputs

The current Devenir crawl profile is:

- published domain: `https://www.deveniratx.com/`
- published URLs discovered from sitemap crawl: `219`
- standard pages: `31`
- store product pages: `90`
- blog posts: `87`
- blog categories: `6`
- event pages: `5`

The published outcome families that must be checked are:

- booking handoff
- storefront and product commerce
- gift-card commerce
- memberships and loyalty
- contact and lead capture
- specials, referral, and event routes

The repo-managed helper surface that now owns the Devenir snippet and proof
shape is:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/sdk/wix/index.mjs`

## Repeatable Crawl

Use the sitemap crawl below to regenerate the published Devenir URL set and
recompute the outcome families:

```bash
python3 - <<'PY'
import urllib.request, xml.etree.ElementTree as ET

ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
root = ET.fromstring(urllib.request.urlopen("https://www.deveniratx.com/sitemap.xml", timeout=20).read())
urls = []
for loc in root.findall(".//sm:sitemap/sm:loc", ns):
    sitemap_url = loc.text.strip()
    sitemap = ET.fromstring(urllib.request.urlopen(sitemap_url, timeout=20).read())
    urls.extend(u.text.strip() for u in sitemap.findall(".//sm:url/sm:loc", ns))

print(len(urls))
for url in sorted(set(urls)):
    print(url)
PY
```

The crawl should then be bucketed into the following families:

- booking routes: `/services`, `/bookonline`, `/es/bookonline`
- direct Zenoti booking targets: `deveniratx.zenoti.com/webstoreNew/services/*`
- storefront routes: `/shop`, `/shop-1`, `/isdinproducts`, `/skinbetterproducts`,
  `/alastinproducts`, `/epionceproducts`, `/revision-skincare`,
  `/skinceuticals`, `/elta-md-1`
- product pages: `/product-page/*`
- gift-card route: `/gift-card`
- membership route: `/memberships`
- loyalty route: `/loyalty`
- contact route: `/contact`
- specials/referral routes: `/specials`, `/specials-1`, `/refer-friends`,
  `/referral`
- event routes: `/event-details/*`

## Representative Live Proof

The proof ladder should verify representative live controls from the published
site, not only sitemap membership.

Minimum proof set:

1. homepage or `/services`
   - prove the direct Zenoti handoff URL is still present
   - prove the booking button label still resolves to the same target family
2. `/bookonline`
   - prove the route is still published and the booking handoff is reachable
3. `/shop`
   - prove `Add to Cart` and `Checkout` are present
4. a representative `/product-page/*`
   - prove `Add to Cart` and `Checkout` are present
5. `/gift-card`
   - prove `Buy Now` and `Checkout` are present
6. `/contact`
   - prove a Wix form exists and can be discovered without relying on unstable
     runtime ids
7. `/memberships` and `/loyalty`
   - prove the routes remain published and are treated as separate outcome
     families

## Proof Events

Before any Wix write, the operator should confirm the current snippet plan can
emit or preserve:

- `page_view`
- `booking_start`
- `product_view`
- `cart_add`
- `checkout_start`
- distinct `gift_card` surface metadata on `checkout_start`
- distinct `membership` and `loyalty` surface metadata on `cta_click`
- `form_start`
- `form_submit`
- generic `cta_click` only when no more specific family applies

## Install-Lane Check

The proof ladder must also record the selected Wix install lane and its
implications:

- `custom-code` for a manual site-wide snippet install
- `gtm` if the site is owned through GTM instead
- `velo-bridge` only if deeper Wix-native bridge work is actually required

The current Devenir posture is that the site-side snippet is analytics and
external data-sharing code, so an `essential` label would be an explicit
operator override rather than the truthful default.

## Repo-Managed Generation Check

Before manual Wix staging, the operator should regenerate the snippet through:

- `buildDevenirAestheticsWixCustomCodeSnippet()`
- `buildDevenirAestheticsWixProofChecklist()`

from:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/sdk/wix/index.mjs`

and confirm the generated body still expresses:

- exact booking host/path matching for Zenoti
- `product_view`, `cart_add`, `checkout_start`, `form_start`, and
  `form_submit`
- explicit surface metadata for gift-card, membership, loyalty, referral,
  specials, and event routes

## Pass Conditions

The proof passes when:

1. the crawl still resolves the published Devenir outcome families
2. the representative live pages still expose the expected route/control
   surfaces
3. the planned snippet classification maps those surfaces to the right outcome
   families
4. the proof notes record any consent or category choice that affects whether
   the snippet may run on the live site

## Runbook References

For install-side operator flow, use:

- [Attribution Web Signals Install And Proof Workflow](/Users/tyler/nexus/home/projects/nexus/docs/validation/web-signals-install-and-proof-workflow.md)
- [Wix Devenir Aesthetics Read-Only Exploration](/Users/tyler/nexus/home/projects/nexus/docs/validation/wix-devenir-aesthetics-readonly-exploration.md)

For package-local `web-journey` proof expectations, use:

- [Web Journey Source Adapter Validation](/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/docs/validation/web-journey-source-adapter-validation.md)

## Current Working Receipt

The Devenir live proof currently passes on the real site and the real Devenir
hosted runtime.

The two current supporting proof bundles are:

- [proof.json](/Users/tyler/nexus/state/artifacts/validation/devenir-wix-live-browser/2026-04-08T02-29-09Z/proof.json)
  - proves live `page_view`, `booking_start`, `product_view`, `cart_add`,
    `checkout_start`, `page_view` on contact, and `form_start`
  - proves top-level `bridge_surface` and `form_id` survive into stored Devenir
    events
  - proves the `/null` contact-form-path bug is fixed
- [proof.json](/Users/tyler/nexus/state/artifacts/validation/devenir-wix-live-browser/2026-04-08T02-46-15Z-browser-id/proof.json)
  - proves `consent_state: "granted"` is now stored on live Devenir events
  - proves persistent `browser_id` is created in local storage and stored on
    Devenir events
  - proves same-browser continuity across multiple live events

The canonical supported install shape validated by those proofs is recorded in:

- [Devenir Wix Web Signals Supported Install](/Users/tyler/nexus/home/projects/nexus/docs/specs/devenir-wix-web-signals-supported-install.md)
