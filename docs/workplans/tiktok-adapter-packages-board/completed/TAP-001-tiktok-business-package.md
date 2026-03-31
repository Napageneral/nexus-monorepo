# TAP-001 TikTok Business Package Scaffold And Install Surfaces

## Goal

Create the shared `tiktok-business` package skeleton in Nex so later tickets
can land implementation work on a stable package surface.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/tiktok-business-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/meta-ads/README.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/meta-ads/adapter.nexus.json`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-intelligence-board/in-progress/AIL-002-moonsleep-parity-matrix-for-core-attribution.md`

## Current Gap

- no shared `tiktok-business` package exists today
- there is no installable adapter manifest, package-local docs set, or release
  script for this surface
- later auth, mapping, and validation tickets have nowhere stable to land

## Acceptance

1. a shared `tiktok-business` package exists and is installable
2. the package includes `adapter.nexus.json`, `README.md`, package-local docs,
   and a release script
3. a Go entrypoint exists and exposes the canonical Nex adapter operation
   surface
4. later tickets can add auth, row mapping, and validation without restructuring
