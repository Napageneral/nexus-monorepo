# MoonSleep Live Shadow Rollout Runbook

This runbook covers the low-risk production shadow enablement for the Nex
`web-signals` control plane and `web-journey` collector on the real MoonSleep
website.

This is a shadow rollout only.

It does not replace the existing MoonSleep attribution path, and it does not
change the current Shopify `ms_*` bridge attributes.

Current decision:

- do not use a local cleanroom plus tunnel as the intended long-running
  environment for the real MoonSleep production shadow window
- use the dedicated Frontdoor-hosted MoonSleep runtime instead
- treat the local cleanroom proof as readiness evidence only

Hosted prerequisite:

- `/Users/tyler/nexus/home/projects/nexus/docs/validation/moonsleep-hosted-attribution-runtime-runbook.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/moonsleep-hosted-attribution-runtime-board/README.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/web-signals/app/docs/validation/WEB_SIGNALS_CONTROL_PLANE_VALIDATION.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/docs/validation/web-journey-source-adapter-validation.md`

## Prepared Branch

- clean deploy repo:
  `/Users/tyler/nexus/home/projects/moonsleep-live-shadow-prep`
- branch:
  `codex/moonsleep-live-shadow-prep`
- prepared commit:
  `4ea226f`
- website-only delta vs `main`:
  - `/Users/tyler/nexus/home/projects/moonsleep-live-shadow-prep/apps/website/lib/metaTracking.ts`
  - `/Users/tyler/nexus/home/projects/moonsleep-live-shadow-prep/apps/website/lib/websiteInputShadow.ts`
- clean branch acceptance:
  - build passes with `npm run build:website`
  - no analytics, worker, or Shopify bridge rewrites are included

## Current Storefront Seam

The current MoonSleep storefront uses direct Shopify Storefront Cart checkout.

Treat these as the live commerce seam when validating the shadow rollout:

- `/Users/tyler/nexus/home/projects/moonsleep-live-shadow-prep/apps/website/lib/shopifyCartCheckout.ts`
- `/Users/tyler/nexus/home/projects/moonsleep-live-shadow-prep/apps/website/components/MoonSpoonPage.tsx`
- `/Users/tyler/nexus/home/projects/moonsleep-live-shadow-prep/apps/website/components/SingleProductSection.tsx`
- `/Users/tyler/nexus/home/projects/moonsleep-live-shadow-prep/apps/website/lib/metaTracking.ts`

The older Buy Button helper path is no longer the authoritative checkout path
for this rollout.

## Rollout Constraints

1. Keep the existing MoonSleep website tracking path active.
2. Do not add any new awaited network call in checkout.
3. Keep the current Shopify `ms_*` checkout attributes untouched.
4. Treat the Nex collector as additive shadow traffic only.
5. Roll back by removing the env flags, not by editing code during the window.
6. Do not alter `startShopifyCartCheckout()` behavior except through the
   existing `trackFunnelEvent()` fanout in `metaTracking.ts`.

## Required Website Env Vars

Set these on the MoonSleep website deployment target:

- `VITE_MOONSLEEP_BUILD_ID=<git commit or release build id>`
- `VITE_WEB_JOURNEY_SHADOW_ENABLED=1`
- `VITE_WEB_JOURNEY_SHADOW_COLLECTOR_BASE_URL=<hosted collector base url>`
- `VITE_WEB_JOURNEY_SHADOW_INSTALLATION_ID=<web installation id>`
- `VITE_WEB_JOURNEY_SHADOW_SENDER_TOKEN=<sender token>`

Do not store the sender token in docs.

Rotate or mint the sender token immediately before rollout if you want a fresh
credential for the production shadow window.

MoonSleep storefront builds now require a real build id. For Vercel-hosted
shadow rolls, set `VITE_MOONSLEEP_BUILD_ID` explicitly or the production build
will fail in `vite.config.ts`.

## Runtime Requirements

Before enabling the live site, make sure the target runtime is ready with:

- all MoonSleep core adapters installed and connected
- `web-signals` installed
- `attribution` installed
- one scope bound for the shadow run
- one website installation bound to the real MoonSleep production origin
- runtime CORS allowlist including the real MoonSleep origin

For the real rollout target, that runtime should be the dedicated hosted
MoonSleep runtime rather than a local cleanroom.

For the MoonSleep production shadow lane, the blocking proof scope is:

- `meta-ads`
- `google-ads`
- `tiktok-business`
- `shopify`
- `web-journey`
- `web-signals`
- `attribution`

`tiktok-display` is not required to proceed with the production website shadow
window because it is not part of the paid + website + backend attribution core.

Latest paid-core shadow refresh proof:

- `/Users/tyler/nexus/state/artifacts/validation/attribution-golden-journey/golden-journey-proof-20260405T210911Z.json`

Latest prod-origin cleanroom staging proof:

- `/Users/tyler/nexus/state/artifacts/validation/moonsleep-shadow-snapshots/moonsleep-shadow-snapshot-2026-04-05T22-01-57-243Z.json`

Latest safe shadow site browser dry run:

- `/Users/tyler/nexus/home/projects/state/artifacts/validation/moonsleep-hosted-demo-shadow-browser/demo-shadow-2026-04-06T01-07-12-200Z/browser-proof.json`
- `/Users/tyler/nexus/home/projects/state/artifacts/validation/moonsleep-hosted-demo-shadow-browser/demo-shadow-2026-04-06T01-07-12-200Z/landing.png`
- `/Users/tyler/nexus/home/projects/state/artifacts/validation/moonsleep-hosted-demo-shadow-browser/demo-shadow-2026-04-06T01-07-12-200Z/post-click.png`

Latest hosted prod-origin preflight:

- `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime/moonsleep-prod-shadow-preflight-2026-04-06T01-09-27-908Z.json`

Latest hosted baseline snapshot:

- `/Users/tyler/nexus/state/artifacts/validation/moonsleep-shadow-snapshots/moonsleep-shadow-snapshot-2026-04-06T01-15-44-322Z.json`
- `/Users/tyler/nexus/state/artifacts/validation/moonsleep-shadow-snapshots/moonsleep-shadow-snapshot-2026-04-06T13-35-55-004Z.json`

If you rerun the cleanroom bootstrap, pass the website origins through:

- `ATTRIBUTION_GOLDEN_JOURNEY_DEMO_SITE_URL=<primary site url>`
- `ATTRIBUTION_GOLDEN_JOURNEY_ALLOWED_ORIGINS=<comma-separated extra origins>`

The cleanroom launcher now supports additive allowed origins in:

- `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/attribution-golden-journey-cleanroom-live.ts`

Latest live prod browser proof on `https://www.moonsleep.co`:

- `/Users/tyler/nexus/state/artifacts/validation/moonsleep-live-prod-shadow-browser/prod-live-shadow-2026-04-06T02-22-32-371Z/browser-proof.json`

## Production Shadow Deployment Checklist

Use this exact order for the production shadow window.

### 1. Prepare The Hosted MoonSleep Runtime

Complete the hosted-runtime phases first:

- `/Users/tyler/nexus/home/projects/nexus/docs/validation/moonsleep-hosted-attribution-runtime-runbook.md`

Export the hosted runtime inputs for the remaining steps:

- `MOONSLEEP_SHADOW_RUNTIME_BASE_URL`
- `MOONSLEEP_SHADOW_RUNTIME_TOKEN`
- `COLLECTOR_BASE_URL`

The real production shadow window should use the hosted collector URL, not a
local tunnel.

Current hosted target:

- server id: `srv-1c4b077a-1f2`
- runtime base URL: `https://t-e86786c3-537.nexushub.sh`
- current prod-shadow env pointer:
  `/Users/tyler/.config/moonsleep/web-signals/moonsleep-prod-shadow.env`

Do not rotate the prod-shadow sender token casually once the live window
starts; rotate it deliberately and update the deployment envs in one step.

### 2. Create A Fresh Production Website Installation

Use the hosted collector URL and target the real MoonSleep origin:

```bash
INSTALL_JSON=$(curl -sS \
  -X POST "$MOONSLEEP_SHADOW_RUNTIME_BASE_URL/runtime/operations/web-signals.installations.create" \
  -H "Authorization: Bearer $MOONSLEEP_SHADOW_RUNTIME_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -nc \
    --arg label 'MoonSleep Production Shadow' \
    --arg siteOrigin 'https://www.moonsleep.co' \
    --arg collectorBaseUrl "$COLLECTOR_BASE_URL" \
    '{label:$label,siteOrigin:$siteOrigin,runtime_base_url:$collectorBaseUrl,metadata:{proof:"moonsleep-live-shadow",mode:"production-shadow"}}')"
)

WEB_INSTALLATION_ID=$(printf '%s' "$INSTALL_JSON" | jq -r '.payload.installation.web_installation_id')
WEB_JOURNEY_CONNECTION_ID=$(printf '%s' "$INSTALL_JSON" | jq -r '.payload.installation.web_journey_connection_id')
WEB_SIGNALS_SENDER_TOKEN=$(printf '%s' "$INSTALL_JSON" | jq -r '.payload.token')
export WEB_INSTALLATION_ID
export WEB_JOURNEY_CONNECTION_ID
export WEB_SIGNALS_SENDER_TOKEN
```

Do not copy the sender token into docs.

### 3. Bind A Dedicated Production Shadow Scope

Read the connection ids from the hosted MoonSleep runtime or from the proof
bundle you capture while bringing that hosted runtime up:

```bash
PROOF_JSON=<summary_path from step 1 or durable latest proof path>
META_CONNECTION_ID=$(jq -r '.proof_summary.adapters.meta_ads.connection.connection_id' "$PROOF_JSON")
GOOGLE_CONNECTION_ID=$(jq -r '.proof_summary.adapters.google_ads.connection.connection_id' "$PROOF_JSON")
TIKTOK_CONNECTION_ID=$(jq -r '.proof_summary.adapters.tiktok_business.connection.connection_id' "$PROOF_JSON")
SHOPIFY_CONNECTION_ID=$(jq -r '.proof_summary.adapters.shopify.connection.connection_id' "$PROOF_JSON")
SCOPE_ID=moonsleep-prod-shadow
export SCOPE_ID
```

Create the scope and bindings:

```bash
curl -sS \
  -X POST "$MOONSLEEP_SHADOW_RUNTIME_BASE_URL/runtime/operations/attribution.scopes.upsert" \
  -H "Authorization: Bearer $MOONSLEEP_SHADOW_RUNTIME_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"scope_id\":\"$SCOPE_ID\",\"label\":\"MoonSleep Prod Shadow\",\"description\":\"Live side-by-side production shadow window for MoonSleep attribution.\"}"

curl -sS \
  -X POST "$MOONSLEEP_SHADOW_RUNTIME_BASE_URL/runtime/operations/attribution.bindings.upsert" \
  -H "Authorization: Bearer $MOONSLEEP_SHADOW_RUNTIME_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"scope_id\":\"$SCOPE_ID\",\"role\":\"acquisition\",\"source_type\":\"adapter_connection\",\"connection_id\":\"$META_CONNECTION_ID\",\"platform\":\"meta-ads\",\"label\":\"Meta Ads\"}"

curl -sS \
  -X POST "$MOONSLEEP_SHADOW_RUNTIME_BASE_URL/runtime/operations/attribution.bindings.upsert" \
  -H "Authorization: Bearer $MOONSLEEP_SHADOW_RUNTIME_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"scope_id\":\"$SCOPE_ID\",\"role\":\"acquisition\",\"source_type\":\"adapter_connection\",\"connection_id\":\"$GOOGLE_CONNECTION_ID\",\"platform\":\"google-ads\",\"label\":\"Google Ads\"}"

curl -sS \
  -X POST "$MOONSLEEP_SHADOW_RUNTIME_BASE_URL/runtime/operations/attribution.bindings.upsert" \
  -H "Authorization: Bearer $MOONSLEEP_SHADOW_RUNTIME_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"scope_id\":\"$SCOPE_ID\",\"role\":\"acquisition\",\"source_type\":\"adapter_connection\",\"connection_id\":\"$TIKTOK_CONNECTION_ID\",\"platform\":\"tiktok-business\",\"label\":\"TikTok Business\"}"

curl -sS \
  -X POST "$MOONSLEEP_SHADOW_RUNTIME_BASE_URL/runtime/operations/attribution.bindings.upsert" \
  -H "Authorization: Bearer $MOONSLEEP_SHADOW_RUNTIME_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"scope_id\":\"$SCOPE_ID\",\"role\":\"backend\",\"source_type\":\"adapter_connection\",\"connection_id\":\"$SHOPIFY_CONNECTION_ID\",\"platform\":\"shopify\",\"label\":\"Shopify\"}"

curl -sS \
  -X POST "$MOONSLEEP_SHADOW_RUNTIME_BASE_URL/runtime/operations/attribution.bindings.upsert" \
  -H "Authorization: Bearer $MOONSLEEP_SHADOW_RUNTIME_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"scope_id\":\"$SCOPE_ID\",\"role\":\"website\",\"source_type\":\"adapter_connection\",\"connection_id\":\"$WEB_JOURNEY_CONNECTION_ID\",\"platform\":\"web-journey\",\"label\":\"MoonSleep Production Website\"}"
```

### 4. Set The Production Website Env Gate

Deploy only from:

- `/Users/tyler/nexus/home/projects/moonsleep-live-shadow-prep`

Required envs on the MoonSleep website deployment target:

```bash
VITE_WEB_JOURNEY_SHADOW_ENABLED=1
VITE_WEB_JOURNEY_SHADOW_COLLECTOR_BASE_URL=$COLLECTOR_BASE_URL
VITE_WEB_JOURNEY_SHADOW_INSTALLATION_ID=$WEB_INSTALLATION_ID
VITE_WEB_JOURNEY_SHADOW_SENDER_TOKEN=$WEB_SIGNALS_SENDER_TOKEN
```

### 5. Immediately Verify Post-Deploy

Run one marked journey, then trigger a pipeline replay:

```bash
curl -sS \
  -X POST "$MOONSLEEP_SHADOW_RUNTIME_BASE_URL/runtime/operations/attribution.pipeline.trigger" \
  -H "Authorization: Bearer $MOONSLEEP_SHADOW_RUNTIME_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"scope_id\":\"$SCOPE_ID\",\"limit_per_platform\":250}"
```

Then capture a marked snapshot:

```bash
cd /Users/tyler/nexus/home/projects/nexus/nex
MOONSLEEP_SHADOW_RUNTIME_BASE_URL=$MOONSLEEP_SHADOW_RUNTIME_BASE_URL \
MOONSLEEP_SHADOW_RUNTIME_TOKEN=$MOONSLEEP_SHADOW_RUNTIME_TOKEN \
MOONSLEEP_SHADOW_SCOPE_ID=$SCOPE_ID \
MOONSLEEP_SHADOW_WEB_INSTALLATION_ID=$WEB_INSTALLATION_ID \
MOONSLEEP_SHADOW_MARKER=<unique-marker> \
node --import tsx scripts/e2e/moonsleep-shadow-snapshot.ts
```

### 6. Run The 12-Hour Window

Take one snapshot per hour:

```bash
cd /Users/tyler/nexus/home/projects/nexus/nex
for hour in $(seq 0 11); do
  ts=$(date +%Y%m%dT%H%M%S)
  MOONSLEEP_SHADOW_RUNTIME_BASE_URL=$MOONSLEEP_SHADOW_RUNTIME_BASE_URL \
  MOONSLEEP_SHADOW_RUNTIME_TOKEN=$MOONSLEEP_SHADOW_RUNTIME_TOKEN \
  MOONSLEEP_SHADOW_SCOPE_ID=$SCOPE_ID \
  MOONSLEEP_SHADOW_WEB_INSTALLATION_ID=$WEB_INSTALLATION_ID \
  node --import tsx scripts/e2e/moonsleep-shadow-snapshot.ts | tee "/tmp/moonsleep-shadow-snapshot-$ts.json"
  sleep 3600
done
```

Artifacts accumulate under:

- `/Users/tyler/nexus/state/artifacts/validation/moonsleep-shadow-snapshots`

## Pre-Enablement Checks

1. Confirm the prepared branch is still clean:
   `git -C /Users/tyler/nexus/home/projects/moonsleep-live-shadow-prep status --short --branch`
2. Confirm the website build still passes:
   `npm run build:website`
3. Run the storefront fast canary or equivalent checkout proof against the
   target deployment URL so the current build is known-good before shadow is
   enabled.
4. Confirm collector preflight from the real MoonSleep origin returns `204`.
5. Confirm the hosted MoonSleep runtime health is healthy.
6. Record a pre-enablement snapshot with the snapshot tool below.

## Snapshot Tool

Use:

- `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/moonsleep-shadow-snapshot.ts`

It accepts either:

- `MOONSLEEP_SHADOW_SERVER_UNDER_TEST_FILE=<server-under-test.json path>`

or:

- `MOONSLEEP_SHADOW_RUNTIME_BASE_URL=<http base url>`
- `MOONSLEEP_SHADOW_RUNTIME_TOKEN=<runtime token>`

Optional:

- `MOONSLEEP_SHADOW_SCOPE_ID=moonsleep-shadow`
- `MOONSLEEP_SHADOW_WEB_INSTALLATION_ID=<web installation id>`
- `MOONSLEEP_SHADOW_MARKER=<utm marker>`

Example:

```bash
cd /Users/tyler/nexus/home/projects/nexus/nex
MOONSLEEP_SHADOW_RUNTIME_BASE_URL=http://127.0.0.1:49934 \
MOONSLEEP_SHADOW_RUNTIME_TOKEN=fresh-nex-sandbox \
MOONSLEEP_SHADOW_SCOPE_ID=moonsleep-shadow \
MOONSLEEP_SHADOW_WEB_INSTALLATION_ID=<installation-id> \
node --import tsx scripts/e2e/moonsleep-shadow-snapshot.ts
```

Artifacts are written under:

- `/Users/tyler/nexus/state/artifacts/validation/moonsleep-shadow-snapshots`

## Initial Proof After Enablement

Immediately after deployment:

1. Open the real MoonSleep site with a unique `utm_campaign` marker.
2. Trigger one safe browse-to-checkout journey.
3. Confirm the collector receives:
   - `page_view`
   - `product_view`
   - `cta_click`
   - `handoff_start`
   - `checkout_created`
   - `handoff_confirmed`
4. Trigger the attribution pipeline if needed.
5. Capture a marked snapshot with `MOONSLEEP_SHADOW_MARKER=<marker>`.

## 12-Hour Side-By-Side Window

During the comparison window, capture repeated snapshots and compare:

- website event counts
- pipeline `web_events`
- adapter health and monitor continuity
- attribution summary totals
- funnel counts
- backend outcomes and attributed outcomes
- MoonSleep ops totals for the same local-date window

Existing compare harnesses that can be reused or extended:

- `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/attribution-ops-compare-proof.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/attribution-ops-compare-soak.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/attribution-ops-compare-cleanroom-live.ts`

## Rollback

If anything looks risky:

1. disable `VITE_WEB_JOURNEY_SHADOW_ENABLED`
2. redeploy the MoonSleep website
3. leave the hosted runtime and attribution app running for inspection
4. preserve the failing snapshot artifacts and browser proof

Rollback should not require code changes if the env gate is respected.
