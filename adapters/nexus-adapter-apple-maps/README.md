# Nexus Apple Maps Adapter

Shared Apple Maps adapter for Nex.

This repository contains:

- the Apple Maps adapter implementation
- package-local spec, workplan, and validation docs
- an installable adapter package manifest in `adapter.nexus.json`
- a release script that emits a Nex operator-install tarball

## Layout

- `cmd/apple-maps-adapter/` - adapter entrypoint and manual Apple Maps logic
- `docs/specs/` - active target-state adapter specs
- `docs/workplans/` - active gap-closure workplans
- `docs/validation/` - active validation ladders

## Build

```bash
mkdir -p ./bin
go build -o ./bin/apple-maps-adapter ./cmd/apple-maps-adapter
```

## Package

```bash
./scripts/package-release.sh
```

This writes a tarball to `./dist/` containing:

- `adapter.nexus.json`
- `bin/apple-maps-adapter`

## Test

```bash
go test ./...
```

## Local CLI

```bash
./bin/apple-maps-adapter adapter.info
./bin/apple-maps-adapter adapter.accounts.list
./bin/apple-maps-adapter adapter.health --connection <connection-id>
./bin/apple-maps-adapter records.backfill --connection <connection-id> --since 2026-01-01T00:00:00Z
```

## Active Docs

- [docs/README.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-apple-maps/docs/README.md)
- [ADAPTER_SPEC_APPLE_MAPS.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-apple-maps/docs/specs/ADAPTER_SPEC_APPLE_MAPS.md)
- [APPLE_MAPS_ADAPTER_PACKAGE_DISTRIBUTION_AND_INSTALL.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-apple-maps/docs/specs/APPLE_MAPS_ADAPTER_PACKAGE_DISTRIBUTION_AND_INSTALL.md)
