# Eve Adapter Workplan

## Goal

Hard-cut Eve into a first-class packaged Nex adapter while preserving the
customer-facing behavior of the latest `home/projects/eve` adapter.

## Phase 1: Package Contract And Layout

Create the canonical package skeleton under `packages/adapters/eve/`:

- manifest
- README
- package docs
- build/release script
- Go module layout

Exit criteria:

- package root matches current shared adapter conventions
- package identity is locked to adapter `eve` and platform `imessage`

## Phase 2: Port The Latest Eve Adapter To The Current Go SDK

Port the latest `home/projects/eve/cmd/eve-adapter/main.go` behavior from the
old `AdapterOperations` authoring model to `DefineAdapter(...)`.

Required preserved behaviors:

- custom setup flow
- accounts
- health
- backfill
- monitor
- send

Exit criteria:

- all required operations are declared through the current package SDK
- no runtime dependency on the old direct binary path remains inside the new
  package

## Phase 3: Preserve Eve Warehouse Semantics

Carry forward the data and sync behavior that made Eve reliable:

- warehouse-first reads
- best-effort `chat.db` sync
- lookback row-id window
- message/reaction/membership coverage
- bounded backfill pagination

Exit criteria:

- monitor and backfill both use the same record model
- sync behavior remains resilient to `chat.db` join timing races

## Phase 4: Package Validation

Validate the package as a real Nex adapter package:

- `go test ./...`
- `go build`
- `./scripts/package-release.sh`
- package validation
- package release artifact generation

Exit criteria:

- build/test/release flow passes from package root
- package can be installed by Nex as a first-class adapter package

## Phase 5: Runtime Sanity

Run basic local runtime sanity checks against the packaged adapter.

Target checks:

- `adapter.info`
- `adapter.health`
- `adapter.connections.list`
- setup lifecycle calls

Stretch checks if local permissions allow:

- backfill sanity
- monitor startup sanity

Exit criteria:

- runtime can execute the packaged adapter surface without contract errors
