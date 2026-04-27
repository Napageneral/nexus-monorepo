# DWO-002 Exact Outcome Classification And Bridge Preservation

## Goal

Upgrade the Devenir Wix snippet so it captures the site's real outcome
families truthfully and preserves enough metadata to bind those events to
Zenoti, Meta, and future Wix backend outcomes in Nex.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/devenir-wix-website-outcome-profile.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-taxonomy.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/docs/specs/web-journey-source-adapter.md`

## Current Gap

- booking classification currently relies on broad text and URL heuristics
- storefront, product, gift-card, membership, loyalty, contact, specials, and
  referral surfaces are mostly collapsed into generic `cta_click`
- the current payload preserves generic target metadata, but not enough
  normalized Devenir surface evidence for reliable downstream joins

## Acceptance

1. booking, storefront, product, gift-card, membership, loyalty, contact,
   specials, referral, and event surfaces are classified through exact route
   and control rules before generic fallback
2. the snippet emits truthful Devenir-specific events such as `product_view`,
   `cart_add`, `checkout_start`, `form_start`, and `form_submit` where the DOM
   proves them, while gift-card, membership, and loyalty remain distinguishable
   through explicit surface metadata under the shared `web-journey` canon
3. emitted payloads preserve normalized route-family, control-source, target
   host/path, and visible control metadata needed for downstream joins
4. metadata field names stay explicit and stable; do not introduce a generic
   `kind` field
5. clicks inside third-party booking or checkout surfaces are not overclaimed
   once the user leaves the Devenir DOM

## Closure Note

This ticket is closed.

The Devenir Wix classifier now covers:

- exact Zenoti booking host/path matching
- `/bookonline` and localized booking routes
- storefront and product-page coverage with `product_view`, `cart_add`, and
  `checkout_start`
- gift-card purchase intent through `checkout_start` plus explicit `gift_card`
  surface metadata
- membership and loyalty intent through distinct surface metadata under the
  shared `cta_click` canon
- homepage/contact lead forms with `form_start` and `form_submit`
- referral, specials, and event routes through exact route-family fallback

The implemented files are:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/sdk/wix/snippet.mjs`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/sdk/wix/profiles/devenir-aesthetics.mjs`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/sdk/wix/index.mjs`

The canonical Devenir outcome/profile and proof corpus now reflect the same
shared event taxonomy:

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/devenir-wix-website-outcome-profile.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/validation/devenir-wix-website-outcome-proof-ladder.md`
