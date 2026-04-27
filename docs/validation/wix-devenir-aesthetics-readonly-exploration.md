---
summary: "Local operator pointer for the first-client Wix admin credential and read-only exploration lane."
title: "Wix Devenir Aesthetics Read-Only Exploration"
---

# Wix Devenir Aesthetics Read-Only Exploration

This note exists so future agents can find the local credential pointer and the
current working identifiers without re-pasting the secret.

## Secret Storage

- raw Wix admin API key:
  `/Users/tyler/.config/moonsleep/web-signals/wix-devenir-aesthetics-api-key.jwt`
- non-secret metadata:
  `/Users/tyler/.config/moonsleep/web-signals/wix-devenir-aesthetics-api-key.metadata.json`

Do not copy the raw token into repo docs, patches, or logs.

## Current Working Context

- owner email: `tyler@glowbot.com`
- service: `wix-admin`
- account label: `devenir-aesthetics`
- Wix account id: `deb2d4bc-c086-47f7-871b-72c97ed03315`
- Wix API key id: `ea4ad60c-05f2-46d3-b054-065e56c169dd`
- Wix application id: `392f45e8-272a-40b5-9e78-70e59a67cb94`
- working site id:
  `e09e4c52-0ff6-4efa-8dc0-6b04e23def4f`
- site id source: inferred from the `/dashboard/<id>/...` segment in the Wix
  admin URL shown in the dashboard screenshot on `2026-04-01`

Treat the site id as an operator-usable working value, but re-confirm it before
any non-read-only work.

## Safety

- read-only exploration only
- do not run write, publish, update, delete, or mutation calls against the real
  client site
- prefer product, order, bookings, and form-submission discovery probes first
- keep the secret on disk or in Nex credentials, not in repo files

## Local Compatibility Check

The old dedicated Wix probe script was removed during the hard cut away from
the earlier hybrid web package. For current install-lane evaluation, use
the `web-journey` Wix helper instead:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/sdk/wix/index.mjs`

Example:

```bash
node --input-type=module <<'EOF'
import { buildWixInstallPlan } from "/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/sdk/wix/index.mjs";

console.log(JSON.stringify(buildWixInstallPlan({
  site_type: "wix",
  published: true,
  connected_domain: true,
  custom_code_enabled: true,
  gtm_enabled: false,
  velo_enabled: false,
}), null, 2));
EOF
```

## Repo-Managed Snippet Generation

The Devenir snippet is now generated from the repo-managed Wix helper rather
than treated as a hand-edited local script.

The canonical supported Devenir install shape now lives in:

- [Devenir Wix Web Signals Supported Install](/Users/tyler/nexus/home/projects/nexus/docs/specs/devenir-wix-web-signals-supported-install.md)

Use the current Devenir install metadata and sender-token pointer to regenerate
the exact snippet body for manual Wix review:

```bash
node --input-type=module <<'EOF'
import fs from "node:fs";
import {
  buildDevenirAestheticsWixCustomCodeSnippetFromMetadata,
  buildDevenirAestheticsWixProofChecklist,
} from "/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/sdk/wix/index.mjs";

const metadata = JSON.parse(fs.readFileSync(
  "/Users/tyler/.config/moonsleep/web-signals/devenir-aesthetics-web-signals-installation-20260407-v012.metadata.json",
  "utf8",
));
const senderToken = fs.readFileSync(
  "/Users/tyler/.config/moonsleep/web-signals/devenir-aesthetics-web-signals-installation-20260407-v012.sender-token.txt",
  "utf8",
).trim();

const snippet = buildDevenirAestheticsWixCustomCodeSnippetFromMetadata({
  metadata,
  sender_token: senderToken,
  initial_consent_state: "granted",
});

console.log(snippet);
console.error(JSON.stringify(buildDevenirAestheticsWixProofChecklist({
  site_type: "wix",
  published: true,
  connected_domain: true,
  custom_code_enabled: true,
}), null, 2));
EOF
```

This command is local-only. It does not mutate Wix.

The current validated generated Devenir artifact is:

- `/Users/tyler/.config/moonsleep/web-signals/devenir-aesthetics-wix-custom-code-web-signals-20260408-v017-essential-compact-granted-script-tag.html`

## Live Findings

Read-only Wix API and public-site checks on `2026-04-01` established:

- site id `e09e4c52-0ff6-4efa-8dc0-6b04e23def4f` resolves to published premium
  site `https://www.deveniratx.com/`
- display name: `Devenir Aesthetics`
- internal site name: `deveniratx`
- created date: `2023-03-31T21:55:57.806Z`
- updated date: `2026-03-31T17:04:18.813Z`
- connected domain: yes
- collaborator access via account `deb2d4bc-c086-47f7-871b-72c97ed03315`
  works for site-level read calls

Public sitemap checks established:

- `31` standard pages
- `90` store product pages
- `87` blog posts
- `6` blog categories
- `5` event pages
- Spanish localized sitemap families exist for pages, products, and events

Important public routes include:

- `/services`
- `/contact`
- `/shop`
- `/gift-card`
- `/bookonline`
- `/memberships`
- `/loyalty`
- `/blog`

Wix API checks established:

- Stores catalog uses `stores-reader/v1`, not catalog v3
- order search succeeds and reports `89` total orders as of `2026-04-01`
- recent order mix includes `PHYSICAL` items and `GIFT_CARD` items
- common recent line items include retail skincare, gift cards, and at least one
  treatment-like item sold as store inventory (`Botox Unit`)
- order `attributionSource` is currently `UNSPECIFIED` on the sampled results
- contacts query succeeds and reports `6836` CRM contacts
- form submissions query succeeds for namespace `wix.form_app.form`
- sampled submissions count: `40`
- sampled forms currently collapse to one visible form id:
  `bfbdc940-38cf-48f8-b4f6-464b3a8aceaf`
- sampled form fields include `email` plus one boolean-like field key
  `form_field_7511`
- sampled submitters include both visitors and members
- bookings services query currently returns zero services
- extended bookings query currently returns zero results

Preliminary public HTML checks did not show obvious first-response evidence of:

- Google Tag Manager
- Google `gtag`
- Meta Pixel
- TikTok Pixel
- Pinterest
- Hotjar
- Clarity
- Segment

Treat that as preliminary only. Re-check Wix custom code and any deferred
runtime tags before adding companion pixels.

## Integration Shape

The current best-fit integration plan is:

1. use the `web-journey` Wix compatibility lane in baseline capture mode first
2. install `web-journey` site-wide through Wix-supported custom code or
   an existing GTM lane if one is confirmed later
3. capture canonical `page_view`, route transitions, CTA clicks, and handoff
   starts across:
   - main marketing pages
   - `/shop` and product pages
   - `/gift-card`
   - `/contact`
   - `/bookonline`
   - `/memberships`
   - `/loyalty`
   - `/blog` and article pages
   - event pages
4. treat the Wix API key as a server-side enrichment path, not as the browser
   integration itself
5. add a read-only server-side reconciliation lane for:
   - e-commerce orders
   - CRM contacts
   - Wix form submissions

The current evidence does not justify a bookings-specific bridge yet because the
Bookings APIs returned no active services or bookings, even though a public
`/bookonline` page exists.

The current evidence does justify:

- a browser-side first-party capture lane
- a server-side order and form enrichment lane
- locale-aware route normalization because Spanish sitemap families are live
- conservative tag-ownership review before adding companion pixels

The current canonical Devenir website outcome profile now lives in:

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/devenir-wix-website-outcome-profile.md`

Implementation gaps for the snippet and proof lane now live in:

- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/devenir-wix-website-outcome-coverage-board/README.md`

The active Devenir crawl and proof ladder now lives in:

- `/Users/tyler/nexus/home/projects/nexus/docs/validation/devenir-wix-website-outcome-proof-ladder.md`
