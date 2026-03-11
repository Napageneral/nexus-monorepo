# Nexus Meta Ads Adapter

Shared Meta Ads adapter for Nex.

This repository contains:

- the Meta Ads adapter implementation
- package-local spec, workplan, and validation docs
- an installable adapter package manifest in `adapter.nexus.json`
- a release script that emits a Nex operator-install tarball

## Layout

- `cmd/meta-ads-adapter/` - adapter entrypoint and Meta provider logic
- `docs/specs/` - active target-state adapter specs
- `docs/workplans/` - active gap-closure workplans
- `docs/validation/` - active validation ladders

## Build

```bash
mkdir -p ./bin
go build -o ./bin/meta-ads-adapter ./cmd/meta-ads-adapter
```

## Package

```bash
./scripts/package-release.sh
```

This writes a tarball to `./dist/` containing:

- `adapter.nexus.json`
- `bin/meta-ads-adapter`

## Test

```bash
go test ./...
```

## Local CLI

```bash
./bin/meta-ads-adapter adapter.info
./bin/meta-ads-adapter adapter.accounts.list
./bin/meta-ads-adapter adapter.health --connection <connection-id>
./bin/meta-ads-adapter adapter.monitor.start --connection <connection-id>
./bin/meta-ads-adapter records.backfill --connection <connection-id> --since 2026-01-01T00:00:00Z
```

## Active Docs

- [docs/README.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-meta-ads/docs/README.md)
- [ADAPTER_SPEC_META_ADS.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-meta-ads/docs/specs/ADAPTER_SPEC_META_ADS.md)
- [META_ADS_ADAPTER_PACKAGE_DISTRIBUTION_AND_INSTALL.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-meta-ads/docs/specs/META_ADS_ADAPTER_PACKAGE_DISTRIBUTION_AND_INSTALL.md)
