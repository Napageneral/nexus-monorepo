# MoonSleep Hosted Attribution Runtime Runbook

This runbook defines the target path for the real MoonSleep attribution shadow
program.

The local sandbox-managed cleanroom remains the proof substrate for product
readiness. It is no longer the intended long-running environment for the real
MoonSleep website shadow rollout.

The intended runtime for that rollout is:

1. Frontdoor-managed
2. hosted on Hetzner
3. dedicated to MoonSleep for this proof window

## Why This Runbook Exists

The MoonSleep attribution stack is already proven locally in cleanroom.

What still matters before the real website shadow goes live is:

1. hosted package lifecycle proof through Frontdoor
2. durable hosted backfill and monitor behavior
3. a stable hosted collector URL for the real MoonSleep website
4. a hosted attribution scope that can be observed over a real comparison
   window without relying on a local machine or a temporary tunnel

## Canonical Inputs

- `/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_HOSTED_PACKAGE_LIVE_TESTING.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/runbooks/platform/prod-runtime-package-deployment-procedure.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/source-adapters-control-plane-and-proof-standard.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/validation/attribution-golden-journey-validation.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/web-signals/app/docs/validation/WEB_SIGNALS_CONTROL_PLANE_VALIDATION.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/docs/validation/web-journey-source-adapter-validation.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/moonsleep-hosted-attribution-runtime-board/README.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/moonsleep-shadow-attribution-rollout-board/README.md`

## Blocking Package Set

- `meta-ads`
- `google-ads`
- `tiktok-business`
- `shopify`
- `web-journey`
- `web-signals`
- `attribution`

`tiktok-display` is optional for the MoonSleep paid-core rollout and should not
block this runbook unless the later side-by-side findings prove it is needed.

## Current Hosted Runtime

The currently retained MoonSleep hosted runtime is:

- server id: `srv-1c4b077a-1f2`
- tenant id: `t-e86786c3-537`
- runtime base URL: `https://t-e86786c3-537.nexushub.sh`

Package state already proven there:

- adapters:
  `meta-ads`, `google-ads`, `tiktok-business`, `shopify`, `web-journey`
- apps:
  `web-signals`, `attribution`

Current web-signals installations already minted there:

- safe shadow site:
  `c65523a0-5cb9-4564-bdc5-b740abade563`
- real `https://www.moonsleep.co` prod-shadow:
  `d6938cce-7180-4a76-8727-c8666d5a03e3`
- demo shadow site:
  `1d64a0ae-78eb-4951-8cb2-a5dc3e862813`

Local env pointers for those hosted installs live at:

- `/Users/tyler/.config/moonsleep/web-signals/moonsleep-hosted-safe-shadow.env`
- `/Users/tyler/.config/moonsleep/web-signals/moonsleep-prod-shadow.env`
- `/Users/tyler/.config/moonsleep/web-signals/moonsleep-hosted-demo-shadow.env`

Current hosted proof artifacts:

- runtime setup:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime/moonsleep-hosted-runtime-setup-2026-04-05.json`
- hosted demo browser proof:
  `/Users/tyler/nexus/home/projects/state/artifacts/validation/moonsleep-hosted-demo-shadow-browser/demo-shadow-2026-04-06T01-07-12-200Z/browser-proof.json`
- hosted prod-origin preflight:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime/moonsleep-prod-shadow-preflight-2026-04-06T01-09-27-908Z.json`
- hosted post-replay baseline snapshot:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-shadow-snapshots/moonsleep-shadow-snapshot-2026-04-06T01-15-44-322Z.json`
- hosted soak snapshot:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-shadow-snapshots/moonsleep-shadow-snapshot-2026-04-06T13-35-55-004Z.json`

Hosted collector allowlist now explicitly includes:

- `https://moonsleep-attribution-demo.vercel.app`
- `https://moonsleep-attribution-shadow.vercel.app`
- `https://www.moonsleep.co`

The hosted website lane is now interpreted canonically as:

- `web-signals` control plane
- `web-journey` source adapter
- `attribution` consuming app

## Non-Negotiable Rules

1. Do not point `https://www.moonsleep.co` at a local cleanroom collector for
   the real comparison window.
2. Do not remove or rewrite the existing MoonSleep tracking path during the
   first hosted shadow window.
3. Do not add any awaited network step in the MoonSleep checkout flow.
4. Do not reuse the safe shadow-site installation id or sender token for the
   real MoonSleep production site.
5. Do not treat hosted provisioning, hosted install, or hosted backfill as
   implied just because the local cleanroom proof is green.

## Hosted Execution Phases

### 1. Hosted Provisioning

Provision one dedicated MoonSleep runtime through Frontdoor on Hetzner and
record:

- server id
- hosted runtime base URL
- runtime access token mint path
- retention or cleanup posture

This should follow the canonical Frontdoor hosted seams rather than an ad hoc
SSH-only path.

### 2. Hosted Package Install

Install the blocking package set through Frontdoor-managed package lifecycle
seams and confirm the hosted runtime reflects:

- installed adapters:
  `meta-ads`, `google-ads`, `tiktok-business`, `shopify`, `web-journey`
- installed apps:
  `web-signals`, `attribution`

### 3. Hosted Connections And Backfills

Create the real MoonSleep upstream connections on the hosted runtime and run
full backfills there.

Minimum baseline:

- Meta Ads connected and backfilled
- Google Ads connected and backfilled
- TikTok Business connected and backfilled
- Shopify connected and backfilled
- attribution scope and bindings materialized against those sources

Current state:

- the four blocking upstreams are already connected on `srv-1c4b077a-1f2`
- records are present for all four
- the remaining work is to treat this as the authoritative baseline, trigger
  or observe attribution materialization to convergence, and hold the runtime
  through the soak window before using it for the real live-site deploy

### 4. Hosted Website Installation

Create a fresh `web-signals` installation for the MoonSleep shadow program on
the hosted runtime.

Do this twice if needed:

- one installation for the safe shadow site
- one separate installation for the real `https://www.moonsleep.co` site

The real production installation must use a fresh sender token and the hosted
collector URL.

### 5. Safe Shadow Site Proof

Before touching `https://www.moonsleep.co`, prove the hosted collector with the
safe shadow site:

- browser-led page view
- product view
- CTA click
- handoff start
- checkout created
- handoff confirmed

Then confirm the hosted attribution UI renders those events under the intended
MoonSleep scope.

Current state:

- hosted demo browser proof is green and reaches real Shopify checkout
- the hosted runtime recorded:
  `page_view`, `product_view`, `cta_click`, `handoff_start`,
  `checkout_created`, and `handoff_confirmed`
- the remaining website-side proof is the actual env-gated real MoonSleep site
  deploy, not collector transport

### 6. Hosted Soak

Observe the hosted runtime over time before the real website shadow goes live:

- adapter freshness
- monitor continuity
- attribution pipeline continuity
- repeated hosted snapshots

This is the point where the hosted runtime earns the right to be used as the
real comparison environment.

### 7. Real Website Shadow Window

Only after the hosted runtime is stable should the real MoonSleep website be
env-gated to point at the hosted collector.

That production-shadow execution still follows the deployment guardrails in:

- `/Users/tyler/nexus/home/projects/nexus/docs/validation/moonsleep-live-shadow-rollout-runbook.md`

But the runtime base URL, collector URL, installation id, and sender token
should come from the hosted MoonSleep runtime, not from a local cleanroom.

## Acceptance

This runbook is complete only when:

1. the hosted MoonSleep runtime exists and is reachable
2. the blocking package set is installed there
3. real MoonSleep connections are backfilled there
4. the safe shadow site is proven against that hosted runtime
5. the hosted runtime survives a meaningful soak
6. the real MoonSleep website shadow window can be executed without a local
   tunnel dependency

Current status:

- `1` through `5` are effectively satisfied
- `6` remains the open gate before the real MoonSleep website shadow deploy
