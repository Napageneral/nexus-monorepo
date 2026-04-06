# MSAR-003 Shadow SDK Integration With No Checkout Latency

## Goal

Integrate the `website-input` SDK alongside MoonSleep's existing tracking
without adding checkout latency.

## Implementation Guardrails

1. do not add any new awaited collector call on the path that starts at
   `startBuyButtonCheckout(...)` in
   `/Users/tyler/nexus/home/projects/moonsleep-attribution-shadow/apps/website/lib/buyButtonAttribution.ts`
2. keep `checkoutClient.create(...)` as the only awaited network hop in the
   controlled checkout path
3. send shadow website-input traffic through a beacon-first or explicit
   fire-and-forget path:
   - prefer `navigator.sendBeacon(...)` when the event is emitted during
     navigation-sensitive handoff
   - otherwise use `void fetch(..., { keepalive: true }).catch(() => {})`
4. keep the existing MoonSleep `ms_*` checkout attributes untouched during the
   shadow window
5. if checkout bridge fields are mirrored into the new path, make them
   additive and namespaced using the `website-input` bridge helpers in
   `/Users/tyler/nexus/home/projects/nexus/packages/apps/website-input/sdk/bridge/index.mjs`
6. do not change the existing MoonSleep funnel endpoint behavior first; the new
   path should subscribe alongside it in shadow mode

## Current Implementation Direction

- fan out from the existing MoonSleep funnel payload construction in
  `/Users/tyler/nexus/home/projects/moonsleep-attribution-shadow/apps/website/lib/metaTracking.ts`
  so both systems see the same browser event evidence
- use a dedicated shadow forwarder module in
  `/Users/tyler/nexus/home/projects/moonsleep-attribution-shadow/apps/website/lib/websiteInputShadow.ts`
- keep transport non-awaited and `keepalive`-safe
- do not rewrite Shopify checkout attributes in the first pass; the current
  Shopify adapter and attribution app already normalize MoonSleep `ms_*`
  bridge attributes into generic backend bridge evidence

## Transport Constraint

The first shadow pass cannot use bare `navigator.sendBeacon(...)` for the new
collector path because the current collector contract expects an authenticated
sender token.

That means the safe shadow transport is:

- `void fetch(..., { keepalive: true }).catch(() => {})`

and not:

- `await fetch(...)`
- any new synchronous wait around checkout redirect

## Planned Shape

- map MoonSleep funnel events into canonical website-input events side by side
- gate the shadow path behind explicit env-backed rollout config
- keep page-view and CTA forwarding outside checkout-critical code
- keep handoff and checkout-created forwarding detached from redirect timing

## Acceptance

1. the SDK runs in shadow mode behind config
2. no new awaited network step is introduced in the checkout path
3. existing MoonSleep `ms_*` bridge attributes remain intact
4. any new bridge payload fields are additive and namespaced
