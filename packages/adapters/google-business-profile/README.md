# Nexus Google Business Profile Adapter

Shared Google Business Profile adapter for Nex.

This package owns the Google Business Profile ingest surface only. It is
separate from Google Ads and separate from attribution logic.

Current package scope:

- OAuth-backed Google Business Profile health
- row-shaped `account_snapshot` records
- row-shaped `location_snapshot` records
- row-shaped `location_performance_daily` records
- row-shaped `review_snapshot` records
- replay-safe monitor and backfill behavior

Current status:

- focused package tests pass
- dedicated cleanroom and retained provider parity proof are still pending

## Layout

- `cmd/google-business-profile-adapter/` - adapter entrypoint and provider logic
- `docs/specs/` - package-local adapter specs
- `docs/workplans/` - package-local workplans
- `docs/validation/` - package-local validation docs

## Build

```bash
mkdir -p ./bin
go build -o ./bin/google-business-profile-adapter ./cmd/google-business-profile-adapter
```

## Package

```bash
./scripts/package-release.sh
```

## Test

```bash
go test ./...
```

## Local CLI

```bash
./bin/google-business-profile-adapter adapter.info
./bin/google-business-profile-adapter adapter.connections.list
./bin/google-business-profile-adapter adapter.health --connection <connection-id>
./bin/google-business-profile-adapter adapter.monitor.start --connection <connection-id>
./bin/google-business-profile-adapter records.backfill --connection <connection-id> --since 2026-01-01T00:00:00Z
```

## Active Docs

- [docs/README.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/google-business-profile/docs/README.md)
- [ADAPTER_SPEC_GOOGLE_BUSINESS_PROFILE.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/google-business-profile/docs/specs/ADAPTER_SPEC_GOOGLE_BUSINESS_PROFILE.md)
- [GOOGLE_BUSINESS_PROFILE_ADAPTER_WORKPLAN.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/google-business-profile/docs/workplans/GOOGLE_BUSINESS_PROFILE_ADAPTER_WORKPLAN.md)
- [GOOGLE_BUSINESS_PROFILE_ADAPTER_VALIDATION.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/google-business-profile/docs/validation/GOOGLE_BUSINESS_PROFILE_ADAPTER_VALIDATION.md)
