# MHAR-002 Package Release And Frontdoor Install Readiness

## Goal

Prove that the full blocking MoonSleep attribution package set is ready to be
installed on one hosted Frontdoor-managed runtime.

## Scope

- package release and publication state
- hosted install boundary for:
  - `meta-ads`
  - `google-ads`
  - `tiktok-business`
  - `shopify`
  - `website-input`
  - `attribution`
- package discovery and runtime catalog expectations after install

## Acceptance

1. each required package has a known hosted install path
2. the package set can be installed on one hosted runtime without inventing a
   special MoonSleep-only path
3. any remaining release, manifest, or hosted packaging gaps are captured
   explicitly before provisioning the MoonSleep runtime

## Current Findings

Validated installable paths:

- adapters install from package roots:
  - `/Users/tyler/nexus/home/projects/nexus/packages/adapters/meta-ads`
  - `/Users/tyler/nexus/home/projects/nexus/packages/adapters/google-ads`
  - `/Users/tyler/nexus/home/projects/nexus/packages/adapters/tiktok-business`
  - `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify`
- apps install from app package roots:
  - `/Users/tyler/nexus/home/projects/nexus/packages/apps/website-input/app`
  - `/Users/tyler/nexus/home/projects/nexus/packages/apps/attribution-intelligence/app`

Local package validation status:

- `meta-ads`: `nexus package validate` passes
- `google-ads`: `nexus package validate` passes
- `tiktok-business`: `nexus package validate` passes
- `shopify`: `nexus package validate` passes
- `website-input/app`: `nexus package validate` passes after adding the missing
  package-surface files at the installable app root
- `attribution/app`: `nexus package validate` passes

Local release-helper status:

- all four adapters already had working `scripts/package-release.sh`
- `website-input/app` and `attribution/app` previously had placeholder
  release scripts; both now use the same `nexus package validate` plus
  `nexus package release` path as the other app packages
- proof artifacts now exist for the two blocking apps:
  - `/Users/tyler/nexus/home/projects/nexus/packages/apps/website-input/app/dist/website-input-0.1.0.tar.gz`
  - `/Users/tyler/nexus/home/projects/nexus/packages/apps/attribution-intelligence/app/dist/attribution-0.1.0.tar.gz`

## Closeout

This is complete.

The package set now installs through the real Frontdoor-hosted lifecycle on the
dedicated MoonSleep runtime. No extra MoonSleep-only install seam was needed
once the app package roots and release helpers were corrected.
