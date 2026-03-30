# Hosted Cleanroom Integration Board

This board tracks the cross-repo cleanroom integration lanes that prove Nexus
behavior through Frontdoor-provisioned hosted lifecycle seams on disposable
sandbox-backed targets rather than ad hoc local operator state.

The purpose of this board is to keep the heavy end-to-end work atomic and
dispatchable.

Canonical inputs:

- `docs/spec-driven-development-workflow.md`
- `docs/spec-standards.md`
- `nex/docs/specs/environment/standalone-clean-room-docker-boot.md`
- `frontdoor/docs/validation/FRONTDOOR_HOSTED_PACKAGE_LIVE_TESTING.md`
- `packages/docs/validation/PACKAGE_RELEASE_AND_PUBLISH_SMOKE_TEST_LADDER.md`

Scope:

- shared hosted cleanroom proof paths
- fresh server provisioning and cleanup validation
- app and adapter install/runtime/operator integration suites
- larger cross-package product proof on disposable infrastructure

The sandbox-backed hosted substrate is already landed as historical baseline
work recorded in:

- `docs/workplans/archive/frontdoor-sandbox-hosted-cleanroom-board/`

Status lanes:

- `not-started/`
- `in-progress/`
- `completed/`

## Current Status Snapshot

Completed:

- `HCI-001`

In Progress:

- `HCI-002`
- `HCI-003`
  - both lanes now sit on top of the already-landed sandbox-backed hosted
    cleanroom substrate
  - provider registry, sandbox lifecycle, Docker executor wrapping, and
    explicit secret-contract work are already historical baseline, not a
    separate active board dependency
  - the remaining work is suite-specific live proof: real app or adapter
    credentials, proof commands, assertions, evidence capture, and closeout

Not Started:

1. `HCI-004A`
2. `HCI-004B`
3. `HCI-004C`
4. `HCI-004D`
5. `HCI-004E`
6. `HCI-004F`
7. `HCI-004G`

## Ownership Split

- the landed historical substrate baseline covers:
  - sandbox-backed disposable hosted targets
  - Docker-backed executor wrapping
  - runtime-token, package install, archive, and destroy lifecycle
  - explicit cleanroom secret contract
- this board owns the suites that run on that substrate:
  - multi-app runtime proof
  - adapter connection and ingest proof
  - Dispatch/operator behavior proof
  - optional browser-review overlays on top of the shared bundle model
