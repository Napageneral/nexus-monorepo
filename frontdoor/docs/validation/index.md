# Frontdoor Validation

This subtree contains Frontdoor-specific active proof material.

Use it for current hosted proof contracts, validation entrypoints, and
Frontdoor support scripts. Do not use it as a running ledger of every dated
proof packet.

## What Lives Here

The active `validation/` tree currently includes:

- hosted validation entrypoints and reusable proof drivers
- provider- or compliance-specific active proof docs when they still define the
  current proof path
- validation support scripts kept beside the owning proof docs

## Reading Posture

Use this index to orient, then read the active proof doc or support script you
actually need.

The filesystem is the source of leaf discovery.

Useful anchor entrypoints:

- [FRONTDOOR_HOSTED_VALIDATION_ENTRYPOINT.md](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_HOSTED_VALIDATION_ENTRYPOINT.md)
- [FRONTDOOR_HOSTED_PACKAGE_LIVE_TESTING.md](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_HOSTED_PACKAGE_LIVE_TESTING.md)

## Archive Boundary

Frontdoor currently has two archival validation roots:

- [validation/archive](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/archive)
- [validation/_archive](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/_archive)

Treat both as historical context, not active proof posture, until the archive
layout is normalized.
