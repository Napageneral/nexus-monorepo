# MSAR-002 Fresh Shadow Clone And Baseline

## Goal

Use a fresh latest MoonSleep website clone as the basis for shadow integration.

## Baseline Findings

- the shadow clone lives at
  `/Users/tyler/nexus/home/projects/moonsleep-attribution-shadow`
- the working branch is `codex/moonsleep-shadow-attribution`
- the website deploy surface is the Vite workspace at
  `/Users/tyler/nexus/home/projects/moonsleep-attribution-shadow/apps/website`
- the current website boot path is:
  - `/Users/tyler/nexus/home/projects/moonsleep-attribution-shadow/apps/website/index.html`
  - `/Users/tyler/nexus/home/projects/moonsleep-attribution-shadow/apps/website/index.tsx`
  - `/Users/tyler/nexus/home/projects/moonsleep-attribution-shadow/apps/website/App.tsx`
- the checkout-critical path is isolated in:
  - `/Users/tyler/nexus/home/projects/moonsleep-attribution-shadow/apps/website/lib/metaTracking.ts`
  - `/Users/tyler/nexus/home/projects/moonsleep-attribution-shadow/apps/website/lib/buyButtonAttribution.ts`
  - `/Users/tyler/nexus/home/projects/moonsleep-attribution-shadow/apps/website/components/ShopifyBuyButton.tsx`
- MoonSleep already emits first-party funnel events with `navigator.sendBeacon`
  preference, which gives us a safe pattern to mirror for the shadow SDK path
  rather than introducing a new blocking fetch in checkout

## Open Work

1. capture the exact deployment target for the separate Vercel shadow site
2. record one pre-integration browser baseline from the untouched shadow clone
3. keep the local dirty `/Users/tyler/nexus/home/projects/moonsleep-v1` repo out
   of this rollout lane

## Acceptance

1. the shadow repo is a separate latest clone, not a pull into the dirty local
   `moonsleep-v1`
2. the baseline branch and deployment target are documented
3. the existing MoonSleep website behavior is captured before SDK changes
