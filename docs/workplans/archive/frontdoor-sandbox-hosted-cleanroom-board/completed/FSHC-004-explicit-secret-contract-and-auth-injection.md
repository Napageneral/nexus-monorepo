# FSHC-004 Explicit Secret Contract And Auth Injection

## Goal

Define one explicit secret and auth contract for hosted cleanroom jobs.

## Acceptance

1. control-plane, adapter, model, and infrastructure secrets are separated
2. the cleanroom executor consumes only declared inputs
3. active hosted runbooks stop depending on ambient host auth

## Status

Completed for the current hosted cleanroom lanes.

The explicit contract is now enforced in the Docker executor wrapper and called
out in canon:

1. control-plane auth is `FRONTDOOR_SMOKE_API_TOKEN`
2. Frontdoor reachability is `FRONTDOOR_SMOKE_ORIGIN`
3. lane inputs are passed through a narrow env allowlist
4. current adapter credentials are lane-specific and explicit
5. proof output is mounted explicitly through `NEXUS_CLEANROOM_PROOF_BUNDLE_DIR`
6. browser-session and ambient-host-auth fallback are no longer part of the
   canonical cleanroom runbook

## Validation

1. Docker executor wrapper allowlist inspection
2. Docker dry run proving only explicit env injection and proof-bundle mount
3. canon/runbook alignment in:
   - `FRONTDOOR_SANDBOX_HOSTED_CLEANROOM_VALIDATION_MODEL.md`
   - `FRONTDOOR_HOSTED_VALIDATION_ENTRYPOINT.md`
   - `FRONTDOOR_HOSTED_PACKAGE_LIVE_TESTING.md`
