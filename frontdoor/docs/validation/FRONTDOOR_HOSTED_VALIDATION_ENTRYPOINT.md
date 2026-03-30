# Frontdoor Hosted Validation Entrypoint

**Status:** ACTIVE
**Last Updated:** 2026-03-28

---

## Purpose

Frontdoor is one layer of the hosted platform. Its active hosted validation must
follow the current runtime-owned validation packet:

Frontdoor is not the owner of the broader local testing philosophy.

The primary local model is:

1. local Nex runtime as supervisor
2. Dispatch DAGs and jobs as orchestration
3. fresh Nex boot inside a sandbox per test
4. artifacts and recordings attached to the owning run

This Frontdoor validation entrypoint covers only the hosted-extension case.

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

For package-level hosted validation, use:

- [/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_AWS_STANDARD_AND_COMPLIANT_LIVE_PROOF_2026-03-17.md](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_AWS_STANDARD_AND_COMPLIANT_LIVE_PROOF_2026-03-17.md)
- [/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_HOSTED_PACKAGE_LIVE_TESTING.md](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_HOSTED_PACKAGE_LIVE_TESTING.md)

Those documents are the active hosted validation set for:

1. sandbox-backed hosted cleanroom validation through Frontdoor semantics
2. separate AWS signoff and provider-specific validation where infrastructure
   differences still matter

Hosted validation must start from disposable Docker-backed environments by
default.
The default proof posture is:

1. Docker-backed cleanroom executor first
2. Frontdoor-provisioned sandbox-backed hosted server target first
3. explicit exception to real cloud only when the behavior is genuinely
   provider-specific or compliance-bound
4. reuse the same auth, provisioning, bootstrap, runtime-token, install, and
   launch seams Frontdoor uses in production
5. treat already-lived-in hosted servers as secondary operator confirmation,
   not the primary proof harness for a new change

---

## Frontdoor-Local Support Artifacts

Files in this directory such as shell scripts and ad hoc test helpers are support
artifacts only. They do not define the hosted validation target by themselves.

If a local frontdoor helper conflicts with the canonical hosted ladder, update or
delete the helper. Do not treat the helper as authoritative.

These helpers are inner proof logic only.

The canonical hosted cleanroom executor model is defined in:

- [/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/specs/FRONTDOOR_SANDBOX_HOSTED_CLEANROOM_VALIDATION_MODEL.md](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/specs/FRONTDOOR_SANDBOX_HOSTED_CLEANROOM_VALIDATION_MODEL.md)

The default hosted executor wrapper is now:

- `/Users/tyler/nexus/home/projects/nexus/frontdoor/scripts/frontdoor-cleanroom-docker-executor.sh`

It runs the inner hosted proof command from a dedicated Frontdoor Docker image,
mounts only the proof bundle root, rewrites localhost Frontdoor origins for the
container boundary, and requires explicit `FRONTDOOR_SMOKE_API_TOKEN` input.

The local hosted cleanroom substrate is now proven end to end:

1. local Frontdoor host instance
2. Docker-backed hosted proof executor
3. sandbox-backed hosted target created and destroyed through the public API
4. runtime token and runtime health proof
5. package purchase, install, launch, uninstall, and destroy proof for a real
   published Spike package

Current package-lifecycle support helpers:

- `/Users/tyler/nexus/home/projects/nexus/frontdoor/scripts/frontdoor-package-lifecycle-smoke.mjs`
  - Public API smoke for login/session, server resolution, install, optional upgrade,
    runtime health, launch, and optional uninstall.
- `/Users/tyler/nexus/home/projects/nexus/frontdoor/scripts/frontdoor-one-server-multi-app-smoke.mjs`
  - Multi-app install and launch smoke against one selected server, with
    runtime-token-authenticated health and runtime catalog proof for every
    requested app.
- `/Users/tyler/nexus/home/projects/nexus/frontdoor/scripts/frontdoor-runtime-rpc.mjs`
  - Reusable runtime WebSocket RPC helper for fresh-server proof commands that
    inherit `FRONTDOOR_SMOKE_RUNTIME_*` env vars.
- `/Users/tyler/nexus/home/projects/nexus/frontdoor/scripts/frontdoor-jira-adapter-proof.mjs`
  - Reusable Jira-first hosted adapter proof that exercises connection create,
    health, issue creation, backfill, and runtime record reappearance on a
    disposable fresh server.
- `/Users/tyler/nexus/home/projects/nexus/frontdoor/scripts/frontdoor-fresh-server-runtime-health-proof.mjs`
  - Minimal hosted substrate proof for fresh server create, callback, runtime
    token mint, direct runtime health, and destroy.
- `/Users/tyler/nexus/home/projects/nexus/frontdoor/scripts/frontdoor-local-sandbox-runtime-health-pilot.ts`
  - Local host-side pilot that starts Frontdoor with the real sandbox provider
    and hands the proof run off to the Docker executor.
- `/Users/tyler/nexus/home/projects/nexus/frontdoor/scripts/frontdoor-local-sandbox-package-lifecycle-pilot.ts`
  - Local host-side pilot that publishes a real app release into the local
    Frontdoor store and proves purchase, install, launch, uninstall, and
    cleanup against a sandbox-backed hosted target from the Docker executor.
- `/Users/tyler/nexus/home/projects/nexus/frontdoor/scripts/capture-frontdoor-fresh-server-multi-app-smoke.sh`
  - Durable Docker-backed cleanroom capture wrapper. Default bundle root:
    `/Users/tyler/nexus/state/artifacts/validation/cleanroom/frontdoor-fresh-server-multi-app/latest/`
- `/Users/tyler/nexus/home/projects/nexus/frontdoor/scripts/capture-frontdoor-fresh-server-adapter-cleanroom.sh`
  - Durable Docker-backed cleanroom capture wrapper for the hosted adapter
    lane.
