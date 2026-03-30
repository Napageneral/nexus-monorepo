# Frontdoor Sandbox Hosted Cleanroom Board

This archived board records the substrate work that made hosted validation run from
Docker-backed cleanroom executors against Frontdoor-provisioned sandbox-backed
Nex server targets.

Historical purpose:

- own the work that is truly Frontdoor-owned in the hosted-extension path
- lock the hosted cleanroom canon around Docker executor plus sandbox target
- close the gap between current host-run frontdoor smoke helpers and the new
  hosted-extension cleanroom model
- provide hosted parity and hosted-lifecycle proof when the control plane
  itself is what needs validation

This board is not active anymore and it is not the canonical center of the
broader testing philosophy.

The primary validation model remains:

- local Nex runtime as supervisor
- Dispatch DAGs and jobs as orchestration
- fresh Nex boot inside a sandbox per test
- artifacts and recordings attached to the owning run

Frontdoor matters here only as the hosted extension or reference seam.

Canonical inputs:

- `docs/spec-driven-development-workflow.md`
- `docs/spec-standards.md`
- `frontdoor/docs/specs/FRONTDOOR_SANDBOX_HOSTED_CLEANROOM_VALIDATION_MODEL.md`
- `frontdoor/docs/specs/CLOUD_PROVISIONING_ARCHITECTURE_2026-03-04.md`
- `frontdoor/docs/specs/FRONTDOOR_AWS_HOSTING_AND_SERVER_CLASS_MODEL.md`
- `frontdoor/docs/validation/FRONTDOOR_HOSTED_VALIDATION_ENTRYPOINT.md`
- `packages/apps/dispatch/docs/workplans/DISPATCH_PINNED_CLEANROOM_RUNTIME_LANE_2026-03-16.md`
- `docs/workplans/hosted-cleanroom-integration-board/README.md`

Historical board scope:

- Frontdoor sandbox provider semantics
- Docker executor wrappers for hosted validation
- explicit secret and auth injection contracts
- Frontdoor-specific hosted lifecycle parity
- one or two hosted reference pilots that prove the substrate is usable

Higher-level suites, generic orchestration, and generic review overlays now
live on:

- `docs/workplans/hosted-cleanroom-integration-board/`
- `nex/docs/workplans/sandbox-managed-validation-and-fresh-server-board/`

Historical closure snapshot:

1. the default hosted proof lanes now run through a Docker executor with an
   explicit env allowlist, and the first live local hosted sandbox pilot is now
   proven on top of that substrate
2. the sandbox-backed validation provider backend is now landed, and live
   runtime-token, runtime-health, and package/operator proof now pass on that
   target from a Docker executor
3. some inner hosted helpers can still be run directly from the host shell even
   though that is no longer the canonical proof path
4. the unfinished suite-specific and overlay follow-on work was intentionally
   folded into other boards instead of keeping this board active

Historical status lanes retained for searchability:

- `not-started/`
- `in-progress/`
- `completed/`

## Archive Status

Completed:

- `FSHC-002`
- `FSHC-001`
- `FSHC-003`
- `FSHC-004`

Folded into other lanes instead of continuing here:

- `FSHC-005`
- `FSHC-006`
- `FSHC-007`
- `FSHC-008`

Those tickets are preserved only as historical notes.
They are not active priorities.
