# nexus-adapter-zenoti-emr

Shared Nex adapter for Zenoti EMR metrics.

## Package Lifecycle

This adapter is packaged and installed through the canonical Nex adapter package
flow.

- package manifest: `adapter.nexus.json`
- release script: `scripts/package-release.sh`
- package docs: `docs/`

## Build

```bash
go build ./cmd/zenoti-emr-adapter
```

## Run

```bash
go run ./cmd/zenoti-emr-adapter adapter.info
go run ./cmd/zenoti-emr-adapter adapter.health --account default
go run ./cmd/zenoti-emr-adapter event.backfill --account default --since 2026-01-01
```
