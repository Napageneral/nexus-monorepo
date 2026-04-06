# MSAR-006 Live Side-By-Side 12h Comparison

## Goal

Run a live side-by-side comparison between MoonSleep ops and the Nex
attribution app over a sustained validation window.

## Ready Inputs

- clean deploy branch:
  `/Users/tyler/nexus/home/projects/moonsleep-live-shadow-prep`
- clean deploy branch name:
  `codex/moonsleep-live-shadow-prep`
- clean deploy branch prepared commit:
  `4ea226f`
- cleanroom comparison scope:
  `moonsleep-shadow`
- hosted prerequisite board:
  `/Users/tyler/nexus/home/projects/nexus/docs/workplans/moonsleep-hosted-attribution-runtime-board/README.md`
- current review-safe shadow site:
  `https://moonsleep-attribution-shadow.vercel.app`
- rollout/snapshot runbook:
  `/Users/tyler/nexus/home/projects/nexus/docs/validation/moonsleep-live-shadow-rollout-runbook.md`
- snapshot tool:
  `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/moonsleep-shadow-snapshot.ts`
- latest current-code cleanroom rerun:
  `/Users/tyler/nexus/state/artifacts/validation/attribution-golden-journey/golden-journey-proof-20260405T210911Z.json`
- latest hosted demo browser proof:
  `/Users/tyler/nexus/home/projects/state/artifacts/validation/moonsleep-hosted-demo-shadow-browser/demo-shadow-2026-04-06T01-07-12-200Z/browser-proof.json`
- latest hosted prod-origin preflight:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime/moonsleep-prod-shadow-preflight-2026-04-06T01-09-27-908Z.json`
- latest hosted baseline snapshot:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-shadow-snapshots/moonsleep-shadow-snapshot-2026-04-06T01-15-44-322Z.json`

Note:

- do not use the local cleanroom as the intended long-running environment for
  the real website shadow window
- promote the same stack into the dedicated hosted MoonSleep runtime first and
  point the snapshot tool at that runtime explicitly
- do not treat hosted collector/browser proof alone as sufficient; the hosted
  attribution scope now has a first converged baseline, but the runtime still
  needs to survive the soak window before the real MoonSleep deploy
- the current MoonSleep checkout seam for this rollout is the controlled
  Shopify Storefront Cart path, not the older hidden Buy Button flow
- the production shadow deployment checklist now lives directly in the rollout
  runbook and should be followed in that order instead of reconstructed from
  older proof notes
- the safe shadow Vercel dry run already proved the live browser path once the
  build id and shadow envs were present:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-shadow-site-browser/shadow-site-20260405T170838/browser-proof.json`

## Live Shadow Deployment Inputs For Tomorrow

Create a separate website installation for the real MoonSleep production site.
Do not reuse the shadow Vercel installation id or sender token.

Required live-site env vars:

- `VITE_MOONSLEEP_BUILD_ID=<git commit or release build id>`
- `VITE_WEBSITE_INPUT_SHADOW_ENABLED=true`
- `VITE_WEBSITE_INPUT_SHADOW_COLLECTOR_BASE_URL=<hosted collector base>`
- `VITE_WEBSITE_INPUT_SHADOW_INSTALLATION_ID=<live moonsleep.co installation id>`
- `VITE_WEBSITE_INPUT_SHADOW_SENDER_TOKEN=<fresh rotated sender token for the live installation>`

Required cleanroom/runtime allowlist input:

- add `https://www.moonsleep.co` to the runtime allowed origins used by the
  collector runtime
- if local reruns are still used for prep, the cleanroom launcher supports
  additive origins through:
  `ATTRIBUTION_GOLDEN_JOURNEY_ALLOWED_ORIGINS`

## Deployment Guardrails

1. do not remove the existing MoonSleep attribution path
2. do not change `ms_*` Shopify bridge attributes during the first live shadow
   window
3. keep the shadow collector fanout non-awaited
4. deploy only the clean website branch, not the dirty local MoonSleep repo
5. rotate a fresh sender token for the live-site installation before deploy

## Immediate Post-Deploy Sanity Checks

1. open `https://www.moonsleep.co` with a unique marker in:
   - `utm_source`
   - `utm_medium`
   - `utm_campaign`
   - `fbclid`
2. click through to Shopify checkout once
3. confirm the cleanroom collector receives:
   - `page_view`
   - `product_view`
   - `cta_click`
   - `handoff_start`
   - `checkout_created`
   - `handoff_confirmed`
4. trigger one manual attribution replay if needed:
   - `attribution.pipeline.trigger`
5. confirm the scope counts increase in:
   - `website-input.events.list`
   - `attribution.pipeline.status`
6. capture a marked snapshot with:
   - `MOONSLEEP_SHADOW_MARKER=<marker> node --import tsx scripts/e2e/moonsleep-shadow-snapshot.ts`

## 12-Hour Comparison Window

Window length:

- target `12 hours`
- checkpoint every `60 minutes`

Capture method:

- use the snapshot tool on each checkpoint and write artifacts under:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-shadow-snapshots`

MoonSleep ops comparison categories:

- paid spend
- impressions
- clicks
- landing page views
- purchases / orders
- purchase value / gross revenue
- first-party sessions
- funnel step counts
- attributed source/channel mix

Nex comparison categories:

- `attribution.summary`
- `attribution.funnel`
- `attribution.outcomes.list`
- `attribution.pipeline.status`
- `website-input.events.list`

## Comparison Expectations

Expected to match closely:

- paid platform totals from Meta, Google Ads, and TikTok Business
- Shopify backend outcomes
- raw website step ordering for marked probe sessions

Expected to differ initially:

- absolute first-party counts during the first hour after deployment
- attribution distribution for recent in-flight sessions while data settles
- any outcome rows that still depend on legacy-only bridge evidence

## Decision Threshold

Good enough to proceed toward prod shadow continuation:

1. no checkout regressions are observed
2. the live shadow collector stays healthy for the full window
3. paid and backend totals stay directionally aligned with MoonSleep ops
4. first-party funnel and attribution mismatches are explainable, not random

Pause and investigate if:

1. checkout behavior regresses
2. collector errors spike or browser console errors show blocking failures
3. backend outcomes cannot be linked through bridge evidence reliably
4. side-by-side totals diverge materially without a clear cause

## Acceptance

1. the comparison window lasts approximately `12 hours`
2. both systems are reading the same live business inputs
3. differences are recorded by metric category rather than hand-waved
