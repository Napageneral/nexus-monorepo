# Frontdoor Hosted Validation Entrypoint

**Status:** ACTIVE
**Last Updated:** 2026-03-17

---

## Purpose

Frontdoor is one layer of the hosted platform. Its active hosted validation must
follow the current runtime-owned validation packet:

- [/Users/tyler/nexus/home/projects/nexus/nex/docs/validation/canonical-api-validation-ladder.md](/Users/tyler/nexus/home/projects/nexus/nex/docs/validation/canonical-api-validation-ladder.md)
- [/Users/tyler/nexus/home/projects/nexus/nex/docs/validation/server-lifecycle-and-durability-validation-ladder.md](/Users/tyler/nexus/home/projects/nexus/nex/docs/validation/server-lifecycle-and-durability-validation-ladder.md)
- [/Users/tyler/nexus/home/projects/nexus/nex/docs/validation/server-lifecycle-and-durability-signoff-report-2026-03-11.md](/Users/tyler/nexus/home/projects/nexus/nex/docs/validation/server-lifecycle-and-durability-signoff-report-2026-03-11.md)
- [/Users/tyler/nexus/home/projects/nexus/nex/docs/validation/canonical-api-full-system-signoff-report-2026-03-11.md](/Users/tyler/nexus/home/projects/nexus/nex/docs/validation/canonical-api-full-system-signoff-report-2026-03-11.md)

Those documents are the source of truth for:

- account and server access
- shell and tenant-origin routing
- durable hosted server lifecycle, archive, restore, and final destroy behavior
- runtime token minting
- package registry and lifecycle
- shared adapter connection profiles
- upgrade and rollback behavior
- final hosted cutover signoff

For package-level live testing on real hosted servers, use:

- [/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_AWS_STANDARD_AND_COMPLIANT_LIVE_PROOF_2026-03-17.md](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_AWS_STANDARD_AND_COMPLIANT_LIVE_PROOF_2026-03-17.md)
- [/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_HOSTED_PACKAGE_LIVE_TESTING.md](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_HOSTED_PACKAGE_LIVE_TESTING.md)

Those documents are the active operational proof set for:

1. AWS-hosted frontdoor with mixed `standard` / `compliant` provisioning
2. hosted app and adapter package testing through Frontdoor

---

## Frontdoor-Local Support Artifacts

Files in this directory such as shell scripts and ad hoc test helpers are support
artifacts only. They do not define the hosted validation target by themselves.

If a local frontdoor helper conflicts with the canonical hosted ladder, update or
delete the helper. Do not treat the helper as authoritative.

Current package-lifecycle support helpers:

- `/Users/tyler/nexus/home/projects/nexus/frontdoor/scripts/frontdoor-package-lifecycle-smoke.mjs`
  - Public API smoke for login/session, server resolution, install, optional upgrade,
    runtime health, launch, and optional uninstall.
- `/Users/tyler/nexus/home/projects/nexus/frontdoor/scripts/frontdoor-one-server-dual-app-smoke.mjs`
  - Multi-app install and launch smoke against one selected server.
