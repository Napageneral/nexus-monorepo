# Nexus CallRail Adapter

Shared CallRail adapter for Nex.

This repository contains:

- the CallRail adapter implementation
- package-local spec, workplan, and validation docs
- an installable adapter package manifest in `adapter.nexus.json`
- a release script that emits a Nex operator-install tarball

## Layout

- `cmd/callrail-adapter/` - adapter entrypoint and CallRail provider logic
- `docs/specs/` - active target-state adapter specs
- `docs/workplans/` - active gap-closure workplans
- `docs/validation/` - active validation ladders

## Build

```bash
mkdir -p ./bin
go build -o ./bin/callrail-adapter ./cmd/callrail-adapter
```

## Package

```bash
./scripts/package-release.sh
```

This writes a tarball to `./dist/` containing:

- `adapter.nexus.json`
- `bin/callrail-adapter`

## Test

```bash
go test ./...
```

## Local CLI

```bash
./bin/callrail-adapter adapter.info
./bin/callrail-adapter adapter.accounts.list
./bin/callrail-adapter adapter.health --connection <connection-id>
./bin/callrail-adapter adapter.monitor.start --connection <connection-id>
./bin/callrail-adapter records.backfill --connection <connection-id> --since 2026-01-01T00:00:00Z
```

## Active Docs

- [docs/README.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-callrail/docs/README.md)
- [ADAPTER_SPEC_CALLRAIL.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-callrail/docs/specs/ADAPTER_SPEC_CALLRAIL.md)
- [CALLRAIL_ADAPTER_PACKAGE_DISTRIBUTION_AND_INSTALL.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-callrail/docs/specs/CALLRAIL_ADAPTER_PACKAGE_DISTRIBUTION_AND_INSTALL.md)
