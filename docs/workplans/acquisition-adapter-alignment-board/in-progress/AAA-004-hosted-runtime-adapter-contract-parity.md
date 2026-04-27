# AAA-004 Hosted Runtime Adapter Contract Parity

## Goal

Close the hosted runtime/package contract skew so hosted adapter install proof
for `google-ads` and `meta-ads` matches current package canon again.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/acquisition-adapter-package-alignment.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/adapters/contract/ADAPTER_PROTOCOL_SCHEMA.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/adapter-package-distribution-and-install.md`
- `/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/specs/FRONTDOOR_PACKAGE_REGISTRY_AND_LIFECYCLE.md`

## Current Gap

- the live hosted install path is still rejecting adapter reflection with a
  legacy operation set that mentions `adapter.accounts.list`
- active source canon across Nex, the Go SDK, and the adapter packages uses
  `adapter.connections.list`
- hosted install proof cannot be trusted until runtime/package parity is
  restored

## Investigation Notes

- Current source canon is internally consistent:
  - Nex runtime reflection uses `adapter.connections.list`
  - the Go adapter SDK emits `adapter.connections.list`
  - `google-ads` and `meta-ads` OpenAPI manifests emit
    `adapter.connections.list`
- local runtime regression coverage now makes that canon explicit:
  - `nex/src/runtime/domains/adapters/protocol.test.ts` rejects
    `adapter.accounts.list`
  - `nex/src/runtime/domains/apps/management-api.package-operator.test.ts`
    rejects adapter package install when reflected operations include
    `adapter.accounts.list`
- Frontdoor package install is below the adapter contract boundary; it stages
  packages and invokes runtime operator install, but it does not redefine
  adapter reflection semantics.
- Compliant hosted servers bootstrap from a baked ARM64 runtime image that
  already contains `/opt/nex/runtime`.
- Frontdoor selects that compliant image through `AWS_FRONTDOOR_AMI_ID` in
  `frontdoor/src/server.ts`, and the bake/install path materializes the
  runtime bundle into `/opt/nex/runtime` through:
  - `frontdoor/scripts/aws/build-compliant-runtime-bundle.sh`
  - `frontdoor/scripts/aws/install-compliant-runtime-image.sh`
  - `frontdoor/scripts/aws/bake-compliant-runtime-ami.sh`
- local runtime evidence already shows the legacy allow-list shape in historic
  logs under `/Users/tyler/nexus/state/logs/runtime.log`, which is consistent
  with a stale runtime binary/image rather than current package source.
- The AWS hosting canon explicitly says that if a baked compliant AMI lags the
  current hosted runtime contract, the fix is to rebake the AMI from the
  current Nex runtime tree rather than weakening Frontdoor or adapter package
  contract checks.

## Evidence

- Frontdoor's compliant provider is wired directly from
  `AWS_FRONTDOOR_AMI_ID` in
  `/Users/tyler/nexus/home/projects/nexus/frontdoor/src/server.ts`.
- The compliant AMI bake path packages the current Nex runtime tree from
  `/Users/tyler/nexus/home/projects/nexus/nex` in
  `/Users/tyler/nexus/home/projects/nexus/frontdoor/scripts/aws/build-compliant-runtime-bundle.sh`.
- The compliant image installer expands that bundle into `/opt/nex/runtime`
  and installs production dependencies in
  `/Users/tyler/nexus/home/projects/nexus/frontdoor/scripts/aws/install-compliant-runtime-image.sh`.
- The AMI bake script creates the AWS image from that prepared runtime bundle
  in
  `/Users/tyler/nexus/home/projects/nexus/frontdoor/scripts/aws/bake-compliant-runtime-ami.sh`.
- Frontdoor's AWS hosting canon explicitly says the compliant AMI is not
  allowed to lag the hosted runtime contract and must be rebaked when it does
  in
  `/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/specs/FRONTDOOR_AWS_HOSTING_AND_SERVER_CLASS_MODEL.md`.
- The observed legacy operation set is captured in
  `/Users/tyler/nexus/state/logs/runtime.log`, where `adapter.info` validation
  still lists `adapter.accounts.list` as an allowed value on 2026-03-11.

## Likely Root Cause

- The hosted compliant runtime image is lagging the current adapter contract
  and still validating against an older allowed-operation set that includes
  `adapter.accounts.list`.

## External Blocker Boundary

Local package and source-tree alignment work is complete for this ticket.

What remains cannot be proven purely from the local workspace:

1. inspect the live value behind `AWS_FRONTDOOR_AMI_ID`
2. verify the runtime bundle actually baked into the active compliant AMI
3. rebake or repoint the compliant AMI if it still carries the stale contract
4. rerun fresh hosted install proof against the new AMI lineage

That means `AAA-004` remains in progress, but its remaining closure path is an
external Frontdoor/AWS operator action rather than another local adapter-code
change.

## Planned Closure Path

1. prove the skew on a fresh hosted cleanroom target
2. refresh the compliant runtime image from the current Nex runtime tree
3. rerun hosted install proof for `google-ads` and `meta-ads`
4. capture closure notes with the exact hosted proof artifact

## Acceptance

1. a disposable hosted runtime validates adapter reflection against the current
   `adapter.connections.list` contract
2. `google-ads` installs successfully through the canonical hosted path
3. `meta-ads` installs successfully through the canonical hosted path
4. the root cause is documented in active validation or closure notes attached
   to this ticket
