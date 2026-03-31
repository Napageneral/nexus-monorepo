# AAP-003 Google Ads Acquisition Surface

## Goal

Align the shared Google Ads acquisition surface with the canonical Google Ads
adapter spec used by attribution products, then burn it down through a
dedicated row-parity execution board.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/google-ads-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/google/docs/specs/ADAPTER_SPEC_GOOGLE.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-intelligence-board/in-progress/AIL-002-moonsleep-parity-matrix-for-core-attribution.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/google-ads-row-parity-board/README.md`

## Current Gap

- the current `google` package mixes Google Ads with unrelated Google surfaces
- the current Ads contract is metric-shaped rather than row-shaped
- the attribution product needs a Google Ads-specific shared contract
- the Google lane does not yet have a dedicated execution board comparable to
  Meta and TikTok

## Acceptance

1. the Google Ads acquisition surface is cleanly reusable by attribution apps
2. required Google Ads row families are emitted with provider-native ids
3. unrelated Google surfaces do not block or define the acquisition contract
4. the Google Ads row-parity board exists with a concrete ticket sequence for
   package boundary, row mapping, replay-safe sync, and cleanroom proof
5. cleanroom validation proves real credentialed ingest for the Ads surface

## Outcome

- shared `google-ads` now exists as a dedicated adapter package separate from
  mixed Google Business Profile behavior
- the package emits `account_access_snapshot`, `campaign_daily`,
  `ad_group_daily`, `ad_daily`, and `campaign_hourly` families with
  revision-aware immutable-arrival identities
- real MoonSleep cleanroom proof passed at:
  `/Users/tyler/nexus/state/sandboxes/ded684e9-16fc-48ea-9ba5-c9adfcb03d2d/artifacts/validation/google-ads-row-parity-live/20260331T031508Z/google-ads-proof-summary.json`
- sampled upstream parity passed at:
  `/Users/tyler/nexus/state/artifacts/validation/google-ads/provider-spotcheck-stable-20260331T032244Z.json`
