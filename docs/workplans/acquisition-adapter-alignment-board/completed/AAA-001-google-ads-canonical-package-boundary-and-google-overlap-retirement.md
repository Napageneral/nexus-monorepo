# AAA-001 Google Ads Canonical Package Boundary And Google Overlap Retirement

## Goal

Make `google-ads` the sole canonical Google Ads package and retire overlapping
Google Ads scope from the legacy `google` package.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/acquisition-adapter-package-alignment.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/google-ads-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/google-business-profile-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/adapter-full-surface-compliance-standard.md`

## Current Gap

- active docs still describe a broad `google` package that overlaps Google Ads
  ownership
- `google-ads` and `google` currently tell competing stories about canonical
  Google package boundaries
- the active acquisition adapter set does not yet tell one clean package
  boundary story

## Acceptance

1. active docs state that `google-ads` is the canonical Google Ads package
2. active docs state that `google-business-profile` is the canonical Google
   Business Profile package
3. active docs no longer treat `google` as canonical for Google Ads
4. package and board cross-links point to the dedicated Google Ads and GBP
   package lanes instead of the broad legacy Google package

## Completion Notes

- Demoted the mixed `google` package docs to legacy compatibility/maintenance
  only.
- Removed `ADAPTER_SPEC_GOOGLE.md` from the live Google Ads and Google Business
  Profile board canonical inputs.
- Updated the canonical Google Ads and GBP specs to point only at the dedicated
  package lanes.
- Confirmed the active docs now tell one clean package-boundary story.
