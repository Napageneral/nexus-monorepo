---
summary: "Cleanroom proof for attribution and acquisition adapters after bounded backfill cutover."
title: "ABBLS-005 Attribution Adapter Bounded Backfill Cleanroom"
---

# ABBLS-005 Attribution Adapter Bounded Backfill Cleanroom

## Status

Completed 2026-05-02.

## Scope

Prove bounded backfill behavior for:

- Shopify
- Google Ads
- Meta Ads
- TikTok Business
- TikTok Display
- Google Business Profile
- legacy Google adapter paths that still ship

## Acceptance Criteria

1. Package-local tests pass for each adapter.
2. Each adapter accepts a bounded backfill window.
3. Provider queries use the upper bound when supported.
4. Returned records after `to` are filtered when provider APIs are coarse.
5. Live monitor remains active for adapters with monitor support.
6. Rate limits are handled without broad replay.
7. Restart preserves connection and monitor state where applicable.

## Evidence To Capture

- cleanroom bundle path per adapter or one matrix bundle with per-adapter
  subreports
- provider account ids redacted or aliased
- bounded windows
- row counts by object family
- sample record ids
- provider quota/rate-limit notes

## Evidence

- Docker package matrix:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/adapter-bounded-backfill-package-matrix/20260502T214249Z`
- Passed lanes:
  - `shopify`
  - `google-ads`
  - `meta-ads`
  - `tiktok-business`
  - `tiktok-display`
  - `google-business-profile`
  - `google`

## Notes

- This ticket closes the package-level bounded-window proof for the attribution
  adapter family. Hosted MoonSleep install/restart and provider-backed runtime
  rehydration remain consolidated under ABBLS-010.
