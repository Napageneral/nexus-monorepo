# GBP-001 Google Business Profile Package Boundary Auth And Provider Access

## Goal

Establish the dedicated Google Business Profile package boundary, OAuth model,
and official provider access path.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/google-business-profile-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/acquisition-adapter-package-alignment.md`

## Current Gap

- GBP currently only exists as a thin Places path inside the mixed `google`
  package
- the package boundary is not yet separated from Google Ads
- the official GBP API access posture is not documented in Nex

## Acceptance

1. a dedicated `google-business-profile` package boundary is explicit
2. required OAuth fields are concrete enough to refresh access tokens
3. the official GBP APIs replace the fake Places-only posture
4. `adapter.health` can prove visible GBP account scope
