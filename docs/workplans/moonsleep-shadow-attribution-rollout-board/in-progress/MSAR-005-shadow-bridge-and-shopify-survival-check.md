# MSAR-005 Shadow Bridge And Shopify Survival Check

## Goal

Prove that the website-input shadow integration survives the website-to-Shopify
handoff without regressing the existing flow.

## Initial Assumption

The first shadow rollout should try to prove bridge survival without rewriting
the live MoonSleep checkout attributes immediately.

Reason:

- MoonSleep already writes `ms_*` attribution and bridge fields into Shopify
  checkout attributes
- the shared Shopify adapter already normalizes those `ms_*` values into
  generic `bridge_attributes`
- the attribution app can already reconcile backend outcomes from
  `session_id`, `checkout_token`, and normalized backend bridge evidence

If that proves insufficient in comparison, a second pass can add parallel
`wi_*` checkout attributes additively.

## Acceptance

1. checkout and handoff still function normally
2. the shadow system preserves bridge evidence for Shopify outcomes
3. the existing MoonSleep bridge path remains intact during shadow mode

## Current Findings

- the current MoonSleep storefront checkout seam is the direct Shopify
  Storefront Cart flow in:
  - `/Users/tyler/nexus/home/projects/moonsleep-live-shadow-prep/apps/website/lib/shopifyCartCheckout.ts`
  - `/Users/tyler/nexus/home/projects/moonsleep-live-shadow-prep/apps/website/components/MoonSpoonPage.tsx`
  - `/Users/tyler/nexus/home/projects/moonsleep-live-shadow-prep/apps/website/components/SingleProductSection.tsx`
- the shadow site reaches real Shopify checkout successfully
- the shadow website-input collector now persists the full website-to-checkout
  chain for a marked run:
  - `page_view`
  - `product_view`
  - `cta_click`
  - `handoff_start`
  - `checkout_created`
  - `handoff_confirmed`
- `checkout_created` preserves:
  - `checkout_token`
  - `checkout_key`
  - `checkout_id`
  - `handoff_id`
  - the original UTM and `fbclid` evidence
- the existing MoonSleep `ms_*` bridge path is still untouched in the website
  code
- the latest safe shadow site dry run proves the deployed Vercel bundle itself
  now emits the full chain side by side:
  - browser proof:
    `/Users/tyler/nexus/state/artifacts/validation/moonsleep-shadow-site-browser/shadow-site-20260405T170838/browser-proof.json`
  - persisted event match count:
    `6`
  - persisted event names:
    `handoff_confirmed, checkout_created, handoff_start, cta_click, product_view, page_view`
- the latest current-code paid-core shadow refresh cleanroom proof passed on
  2026-04-05 and confirms the rollout remains safe to advance toward the
  production shadow window:
  - `/Users/tyler/nexus/state/artifacts/validation/attribution-golden-journey/golden-journey-proof-20260405T210911Z.json`
- the prod-origin staging path also now passes in cleanroom:
  - `https://www.moonsleep.co` CORS preflight
  - fresh production website installation
  - dedicated `moonsleep-prod-shadow` scope
  - synthetic website-input ingest reflected in:
    `/Users/tyler/nexus/state/artifacts/validation/moonsleep-shadow-snapshots/moonsleep-shadow-snapshot-2026-04-05T22-01-57-243Z.json`

## Remaining Work

1. repeat the same bridge-survival proof against the dedicated hosted
   MoonSleep runtime, not only the local cleanroom proof lane
2. prove that the same bridge evidence survives all the way into real Shopify
   outcomes during the hosted side-by-side window
3. compare outcome linking in the Nex attribution app against the existing
   MoonSleep ops outputs before deciding whether parallel `wi_*` checkout
   attributes are needed
