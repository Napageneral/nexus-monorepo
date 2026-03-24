# Nex Operator Console Package Validation Ladder

## Customer Experience

The operator should be able to treat the console like any other Nex app package:

1. validate it
2. release it
3. publish it through Frontdoor
4. install it onto a runtime
5. open it under `/app/console/...`

## Shared Hosted Lifecycle Gate

This ladder includes the shared hosted lifecycle proof for the console package.

Use
[Frontdoor Hosted Package Live Testing](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_HOSTED_PACKAGE_LIVE_TESTING.md)
as the canonical operator flow for publish, install, runtime token mint, and
runtime health.

Treat the Frontdoor publish and install rungs in this ladder as the required
shared hosted lifecycle layer before any app-specific signoff.

## Validation Rungs

1. package validation passes for `app/`
2. package release produces a tarball for `console`
3. Frontdoor publish records one package, release, and variant row
4. Frontdoor install converges on a target server
5. runtime reports the `console` app healthy and discoverable


## Current Run Result (2026-03-16)

### Passed

1. `nexus package validate packages/apps/nex-operator-console/app`
2. `nexus package release packages/apps/nex-operator-console/app`
3. controlled Frontdoor publish via `packages/scripts/publish-package.sh`
4. production Frontdoor publish to `frontdoor.nexushub.sh`
   - one `frontdoor_packages` row for `console`
   - one `frontdoor_package_releases` row for `1.0.0`
   - one `frontdoor_release_variants` row for `linux/arm64`
   - product sync created `Operator Console`

### Blocked On Hosted Install

The published app did not complete installation on the production hosted server.

Observed production failures:

1. fresh signup returns `UNIQUE constraint failed: frontdoor_servers.tenant_id`
   - login still succeeds afterward for the created account
2. app purchase/install returns `server_runtime_platform_unavailable`
3. install status converges to:
   - `entitlement_status = active`
   - `install_status = failed`
   - `last_error = server_runtime_platform_unavailable`

Conclusion:

1. the operator console app package is valid
2. the operator console app package can be released and published to production Frontdoor
3. the remaining failure is in hosted Frontdoor/runtime install execution, not in the console package shape
