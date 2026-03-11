# Nexus Google Adapter

Shared Google Ads and Google Business Profile adapter for Nex.

This repository contains:

- the Google adapter implementation
- package-local spec, workplan, and validation docs
- an installable adapter package manifest in `adapter.nexus.json`
- a release script that emits a Nex operator-install tarball

## Layout

- `cmd/google-adapter/` - adapter entrypoint and Google-specific provider logic
- `docs/specs/` - active target-state adapter specs
- `docs/workplans/` - active gap-closure workplans
- `docs/validation/` - active validation ladders

## Build

```bash
mkdir -p ./bin
go build -o ./bin/google-adapter ./cmd/google-adapter
```

## Package

Build the runnable adapter package artifact for Nex operator install:

```bash
./scripts/package-release.sh
```

This writes a tarball to `./dist/` containing:

- `adapter.nexus.json`
- `bin/google-adapter`

## Test

```bash
go test ./...
```

## Local CLI

```bash
./bin/google-adapter adapter.info
./bin/google-adapter adapter.accounts.list
./bin/google-adapter adapter.health --connection <connection-id>
./bin/google-adapter adapter.monitor.start --connection <connection-id>
./bin/google-adapter records.backfill --connection <connection-id> --since 2026-01-01T00:00:00Z
```

## Active Docs

- [docs/README.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-google/docs/README.md)
- [ADAPTER_SPEC_GOOGLE.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-google/docs/specs/ADAPTER_SPEC_GOOGLE.md)
- [GOOGLE_ADAPTER_PACKAGE_DISTRIBUTION_AND_INSTALL.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-google/docs/specs/GOOGLE_ADAPTER_PACKAGE_DISTRIBUTION_AND_INSTALL.md)
