# MoonSleep Shadow Attribution Rollout Board

This board tracks the safe side-by-side rollout of the Nex `web-signals`,
`web-journey`, and `attribution` stack against the real MoonSleep website and
business flows.

This is not the same as the sandbox-only golden journey.

That lane proved the product works end to end in cleanroom. This lane proves
the website SDK can run side by side with the existing MoonSleep website
tracking and that the resulting numbers can be compared over time against the
existing MoonSleep ops system.

Canonical inputs:

- `/Users/tyler/nexus/home/projects/nexus/docs/validation/attribution-golden-journey-validation.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/validation/moonsleep-hosted-attribution-runtime-runbook.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/validation/moonsleep-live-shadow-rollout-runbook.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/moonsleep-hosted-attribution-runtime-board/README.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/web-signals-control-plane-and-web-adapter-family.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-layer.md`
- `/Users/tyler/nexus/home/projects/moonsleep-v1/apps/website/lib/metaTracking.ts`
- `/Users/tyler/nexus/home/projects/moonsleep-v1/apps/website/lib/shopifyCartCheckout.ts`
- `/Users/tyler/nexus/home/projects/moonsleep-v1/apps/website/components/MoonSpoonPage.tsx`
- `/Users/tyler/nexus/home/projects/moonsleep-v1/apps/website/components/SingleProductSection.tsx`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/sdk/bridge/index.mjs`

Scope:

- use a fresh latest MoonSleep website clone rather than the dirty local repo
- integrate the new web-journey SDK in shadow mode alongside existing
  MoonSleep attribution/tracking
- keep checkout latency neutral: no new awaited network step in checkout flow
- treat the local cleanroom lane as stack-readiness proof, not the final
  production-shadow environment
- use the dedicated Frontdoor-hosted MoonSleep runtime as the real production
  shadow environment before touching `https://www.moonsleep.co`
- deploy the shadow site to a separate Vercel project first
- run a live side-by-side validation window against the existing MoonSleep ops
  system from that hosted runtime
- compare first-party events, bridge survival, Shopify outcomes, and
  attributed numbers over a sustained window

Out of scope:

- cutting over the live MoonSleep site immediately
- removing the existing MoonSleep tracking path first
- changing the existing Shopify bridge semantics before comparison proves parity

Status lanes:

- `not-started/`
- `in-progress/`
- `completed/`

## Current Status Snapshot

In Progress:

1. `MSAR-005`

Not Started:

1. `MSAR-006`
2. `MSAR-007`

Completed:

1. `MSAR-001`
2. `MSAR-002`
3. `MSAR-003`
4. `MSAR-004`

## Prod Shadow Readiness

Current posture:

- yes, for local stack readiness on the blocking MoonSleep paid-core scope
- not yet, for the real `https://www.moonsleep.co` production-shadow window
  because the hosted runtime still needs soak evidence even though collector
  transport and the first hosted attribution baseline are now green

Local stack-readiness proof:

- the latest current-code cleanroom rerun passed on 2026-04-05 against:
  - current Nex
  - current MoonSleep shadow site
  - `meta-ads`
  - `google-ads`
  - `tiktok-business`
  - `shopify`
- `web-journey`
- `web-signals`
  - `attribution`
- `tiktok-display` is intentionally not a rollout blocker for this lane
- prod-origin cleanroom staging also passes:
  - collector preflight for `https://www.moonsleep.co`
  - fresh `web-signals` installation + rotated sender token
  - dedicated `moonsleep-prod-shadow` scope + bindings
  - synthetic collector ingest with `web_events=3`
  - snapshot artifact:
    `/Users/tyler/nexus/state/artifacts/validation/moonsleep-shadow-snapshots/moonsleep-shadow-snapshot-2026-04-05T22-01-57-243Z.json`
- the safe shadow Vercel site dry run now also passes after redeploying with:
  - `VITE_MOONSLEEP_BUILD_ID`
  - `VITE_WEB_JOURNEY_SHADOW_*`
  - browser proof artifact:
    `/Users/tyler/nexus/state/artifacts/validation/moonsleep-shadow-site-browser/shadow-site-20260405T170838/browser-proof.json`

Blocking hosted prerequisite:

- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/moonsleep-hosted-attribution-runtime-board/README.md`

Hosted runtime progress now achieved:

- dedicated hosted MoonSleep runtime exists:
  `srv-1c4b077a-1f2`
- hosted package set is installed there
- hosted MoonSleep upstreams are connected there
- hosted safe demo browser proof is green:
  `/Users/tyler/nexus/home/projects/state/artifacts/validation/moonsleep-hosted-demo-shadow-browser/demo-shadow-2026-04-06T01-07-12-200Z/browser-proof.json`
- hosted real prod-origin preflight is green:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime/moonsleep-prod-shadow-preflight-2026-04-06T01-09-27-908Z.json`
- hosted baseline snapshot now exists:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-shadow-snapshots/moonsleep-shadow-snapshot-2026-04-06T01-15-44-322Z.json`

Remaining hosted gate before the real MoonSleep deploy:

- hosted soak and repeated freshness snapshots over time

Still open after production enablement:

- `MSAR-005` is not complete until live backend bridge survival is proven
  through real Shopify outcomes
- `MSAR-006` is the actual `12h` side-by-side window
- `MSAR-007` is the comparison readout and continuation decision

## Execution Order

1. lock the rollout constraints and comparison contract
2. prepare a fresh latest MoonSleep website shadow clone
3. integrate the web-journey SDK in strict shadow mode
4. deploy the cloned site to a separate Vercel project
5. prove website events, bridge fields, and checkout neutrality in local
   cleanroom
6. stand up the dedicated hosted MoonSleep runtime and prove the same stack
   there
7. point the real MoonSleep production website shadow envs at that hosted
   runtime
8. run the side-by-side live comparison window
9. publish the comparison readout and decide on continued prod shadowing

## Latest Notes

- the shadow site is live at `https://moonsleep-attribution-shadow.vercel.app`
- the clean deploy branch for the real MoonSleep site is:
  - repo: `/Users/tyler/nexus/home/projects/moonsleep-live-shadow-prep`
  - branch: `codex/moonsleep-live-shadow-prep`
  - commit: `4ea226f`
- the current storefront no longer uses the older hidden Buy Button helper path
  and instead runs the Shopify controlled checkout flow through:
  - `/Users/tyler/nexus/home/projects/moonsleep-live-shadow-prep/apps/website/lib/shopifyCartCheckout.ts`
  - `/Users/tyler/nexus/home/projects/moonsleep-live-shadow-prep/apps/website/components/MoonSpoonPage.tsx`
  - `/Users/tyler/nexus/home/projects/moonsleep-live-shadow-prep/apps/website/components/SingleProductSection.tsx`
- the shadow collector still fans out from:
  - `/Users/tyler/nexus/home/projects/moonsleep-live-shadow-prep/apps/website/lib/metaTracking.ts`
  and stays non-awaited / fire-and-forget on the commerce critical path
- the local cleanroom lane is now an upstream readiness proof, not the final
  long-running environment for the real MoonSleep production shadow window
- the dedicated hosted MoonSleep target is now tracked at:
  - `/Users/tyler/nexus/home/projects/nexus/docs/workplans/moonsleep-hosted-attribution-runtime-board/README.md`
- the latest paid-core shadow refresh cleanroom proof passed on current Nex plus
  current MoonSleep shadow site at:
  - `/Users/tyler/nexus/state/artifacts/validation/attribution-golden-journey/golden-journey-proof-20260405T210911Z.json`
- the retained current-code rerun exited cleanly with:
  - `recovered_from_artifact=false`
  - `transport_error=null`
- that refresh lane intentionally excluded `tiktok-display` with
  `AGJV_INCLUDE_TIKTOK_DISPLAY=0` because the MoonSleep prod shadow rollout is
  validating paid acquisition, website input, and Shopify outcome flow rather
  than the optional organic/display surface
- the retained cleanroom collector now allows the shadow origin and passes
  public preflight
- the retained cleanroom collector also now allows the real production origin
  and passes public preflight for `https://www.moonsleep.co`
- a dedicated production shadow scope has been staged in cleanroom:
  - `moonsleep-prod-shadow`
- the current `moonsleep-prod-shadow` staging snapshot shows:
  - `ad_facts=1237`
  - `web_events=3`
  - `business_outcomes=6446`
  - `outcome_attributions=3087`
- a marked browser run reached real Shopify checkout and persisted:
  - `page_view`
  - `product_view`
  - `cta_click`
  - `handoff_start`
  - `checkout_created`
  - `handoff_confirmed`
- the safe shadow site now emits that full event chain directly from the
  deployed Vercel bundle, with `6` collector requests and `3` successful
  collector responses captured in the browser proof artifact
- the remaining open question before the `12h` window is backend bridge
  survival all the way through real Shopify outcomes, not website-to-checkout
  transport
