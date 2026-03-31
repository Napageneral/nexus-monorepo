# AAP-003 Google Ads Acquisition Surface

## Goal

Align the shared Google Ads acquisition surface with the canonical Google Ads
adapter spec used by attribution products.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/google-ads-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/google/docs/specs/ADAPTER_SPEC_GOOGLE.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-intelligence-board/in-progress/AIL-002-moonsleep-parity-matrix-for-core-attribution.md`

## Current Gap

- the current `google` package mixes Google Ads with unrelated Google surfaces
- the current Ads contract is metric-shaped rather than row-shaped
- the attribution product needs a Google Ads-specific shared contract

## Acceptance

1. the Google Ads acquisition surface is cleanly reusable by attribution apps
2. required Google Ads row families are emitted with provider-native ids
3. unrelated Google surfaces do not block or define the acquisition contract
4. cleanroom validation proves real credentialed ingest for the Ads surface
