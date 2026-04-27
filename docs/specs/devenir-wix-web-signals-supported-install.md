# Devenir Wix Web Signals Supported Install

**Status:** CANONICAL
**Last Updated:** 2026-04-08
**Related:** [Devenir Wix Website Outcome Profile](/Users/tyler/nexus/home/projects/nexus/docs/specs/devenir-wix-website-outcome-profile.md), [Devenir Wix Website Outcome Proof Ladder](/Users/tyler/nexus/home/projects/nexus/docs/validation/devenir-wix-website-outcome-proof-ladder.md), [Wix Devenir Aesthetics Read-Only Exploration](/Users/tyler/nexus/home/projects/nexus/docs/validation/wix-devenir-aesthetics-readonly-exploration.md), [Wix SDK Helper](/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/sdk/wix/index.mjs), [Wix Snippet Runtime](/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/sdk/wix/snippet.mjs)

## Purpose

This document defines the supported Devenir website install that is now working
against the real Devenir Wix site and the real Devenir hosted Nex runtime.

It exists to make the supported lane explicit so future operator work does not
re-open the earlier failures around Wix embed injection, non-executing custom
code bodies, missing hosted CORS allowlists, or missing browser identity
continuity.

## Supported Architecture

The supported Devenir website install has four required pieces:

1. Devenir hosted runtime with `web-signals` and `web-journey` installed
2. a live `web_installation_id` plus sender-token pair owned by Devenir
3. a repo-generated Devenir-specific Wix Custom Code snippet
4. a Wix Custom Code install on the real Devenir site

The browser contract is:

- first-party browser snippet on `https://www.deveniratx.com/`
- collector target:
  `https://t-673f3131-f16.nexushub.sh/runtime/operations/web-signals.web-journey.collect`
- live Devenir website install:
  `5ce4b72a-0218-4c75-85db-151c35b09e8a`

The generator contract is:

- repo entrypoint:
  [index.mjs](/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/sdk/wix/index.mjs#L155)
- Devenir compact runtime:
  [snippet.mjs](/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/sdk/wix/snippet.mjs#L843)

## Required Hosted Runtime Posture

The Devenir hosted runtime must satisfy all of the following:

- `web-signals` installed
- `web-journey` installed
- valid Devenir web-install metadata and sender token present
- hosted browser CORS allowlist includes:
  - `https://www.deveniratx.com`
  - `https://deveniratx.com`

The hosted CORS requirement is not optional for a browser-origin install.
Without it, the Wix snippet will execute but every collector post will fail at
the browser boundary.

## Required Wix Install Posture

The supported Devenir lane is Wix Custom Code, not Wix Custom Embeds.

The supported Wix settings are:

- name: `Glowbot Devenir Web Signals`
- apply to: `All pages`
- load mode: `Load code once per page`
- placement: `Body - End`
- code type: `Essential`

The supported Devenir install is an always-load posture. That means the browser
snippet is expected to execute on page load rather than wait on Wix analytics
consent gating.

## Required Snippet Shape

The supported Devenir snippet must satisfy all of the following:

- generated from the repo-managed helper, not hand-edited in Wix
- compact enough to fit Wix Custom Code limits
- wrapped as HTML `<script>...</script>`, not raw JavaScript text
- idempotent on repeat injection
- free of blocking runtime `await` or checkout-gating network behavior
- `fetch(..., { keepalive: true })` fire-and-forget collector behavior

The compact Devenir lane exists because the generic reusable Wix runtime was too
large for Wix Custom Code. The supported Devenir builder is intentionally
Devenir-specific rather than a generic one-size-fits-all Wix payload.

## Outcome Coverage Contract

The supported Devenir snippet must truthfully cover:

- `page_view`
- `booking_start`
- `product_view`
- `cart_add`
- `checkout_start`
- `form_start`
- `form_submit`
- `cta_click` where no more specific family applies

The supported Devenir outcome families are:

- booking handoff into Zenoti
- storefront and product intent
- gift-card checkout intent
- membership intent
- loyalty intent
- contact lead capture
- specials, referral, and event route intent

The required bridge and identity fields are:

- top-level `bridge_surface` for booking, checkout, and form flows
- top-level `form_id` for lead-capture forms
- normalized `target_path`
- `form_action_path: null` when Wix exposes no action
- persistent `browser_id`
- session-scoped `session_id`

## Consent And Identity Continuity

The supported Devenir install initializes with:

- `initial_consent_state: "granted"`
- persistent browser identity stored at:
  `devenir.web_journey.browser_id`

This is the same broad posture already used by the MoonSleep website journey
install: immediate browser-id creation plus `granted` consent on emitted events.

The purpose of that posture is not basic capture. Basic capture already works
without it.

Its purpose is identity continuity:

- same-browser stitching across later visits
- stronger joins between earlier website activity and later downstream outcomes
- less dependence on fresh UTMs as the only continuity mechanism

## Explicitly Unsupported Lanes

The following are not supported for Devenir:

- Wix Custom Embeds API as the primary install lane
- API-created embed rows as the main operator workflow
- raw JavaScript pasted into Wix Custom Code without a `<script>` wrapper
- hosted browser collect without the Devenir origin allowlist
- a Devenir install that relies on `consent_state: "unknown"` when persistent
  browser identity is required

## Validation Contract

The supported Devenir install is only considered healthy when all of the
following remain true in live proof:

1. the public site renders normally
2. the Wix snippet namespace is present in the browser
3. collector requests return `200`
4. Devenir runtime stores the emitted events
5. stored events preserve:
   - `bridge_surface`
   - `form_id`
   - normalized contact-form paths
   - `consent_state: "granted"`
   - non-null persistent `browser_id`

The canonical validation ladder remains:

- [Devenir Wix Website Outcome Proof Ladder](/Users/tyler/nexus/home/projects/nexus/docs/validation/devenir-wix-website-outcome-proof-ladder.md)

## Current Validated Devenir Receipt

The current validated generated Devenir artifact is:

- [devenir-aesthetics-wix-custom-code-web-signals-20260408-v017-essential-compact-granted-script-tag.html](/Users/tyler/.config/moonsleep/web-signals/devenir-aesthetics-wix-custom-code-web-signals-20260408-v017-essential-compact-granted-script-tag.html)

That artifact is generated from:

- [devenir-aesthetics-web-signals-installation-20260407-v012.metadata.json](/Users/tyler/.config/moonsleep/web-signals/devenir-aesthetics-web-signals-installation-20260407-v012.metadata.json)
- [devenir-aesthetics-web-signals-installation-20260407-v012.sender-token.txt](/Users/tyler/.config/moonsleep/web-signals/devenir-aesthetics-web-signals-installation-20260407-v012.sender-token.txt)

and the helper entrypoint:

- [buildDevenirAestheticsWixCustomCodeSnippetFromMetadata()](/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/sdk/wix/index.mjs#L155)

## Known Limits

This supported install still does not claim:

- visibility into Zenoti iframe steps after the Devenir handoff
- final purchase truth from browser clicks alone
- server-side Wix order, contact, or form reconciliation
- banner-driven consent synchronization with Wix privacy controls

Those are separate concerns from the working Devenir website install defined
here.
