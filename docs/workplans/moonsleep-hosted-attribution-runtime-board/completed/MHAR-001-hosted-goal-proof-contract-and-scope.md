# MHAR-001 Hosted Goal Proof Contract And Scope

## Goal

Lock the new MoonSleep target state:

- dedicated Frontdoor-managed runtime
- Hetzner-hosted
- real MoonSleep adapters and apps installed there
- full backfill and live-monitor proof there
- real MoonSleep website shadow deployment only after that hosted runtime is
  stable

## Why This Exists

The local sandbox-managed cleanroom already proved the product seams. It is not
the right long-running environment for the real MoonSleep shadow rollout.

The real target needs:

1. a stable collector URL
2. a durable runtime that can be observed over time
3. real hosted package lifecycle proof through Frontdoor
4. one place to run the `12h` side-by-side window without relying on local
   tunnels or a retained sandbox

## Required Contract

1. The hosted target is a dedicated MoonSleep runtime, not a shared local
   runtime and not a temporary tunnel.
2. The blocking package set is:
   - `meta-ads`
   - `google-ads`
   - `tiktok-business`
   - `shopify`
   - `website-input`
   - `attribution`
3. `tiktok-display` remains optional for this lane unless the MoonSleep shadow
   comparison later proves it is needed.
4. The real MoonSleep website shadow rollout is downstream of hosted runtime
   readiness, not a substitute for it.
5. The existing MoonSleep tracking and Shopify `ms_*` bridge path stay intact
   during the first live comparison window.

## Acceptance

1. the hosted goal is explicit in the MoonSleep workplans and runbooks
2. the prod shadow board no longer implies a local cleanroom collector is good
   enough for the real rollout
3. the next execution tickets are sequenced around hosted runtime readiness
