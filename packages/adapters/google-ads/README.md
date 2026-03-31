# Nexus Google Ads Adapter

Shared Google Ads adapter for Nex.

This package owns the Google Ads acquisition ingest surface only. Google
Business Profile remains a separate lane.

Current target behavior:

- direct Google Ads API auth and health
- row-shaped provider facts for Google Ads account, campaign, ad-group, ad,
  and hourly reporting
- replay-safe backfill and monitor behavior
- retained cleanroom proof against MoonSleep Google Ads credentials
- stable provider parity spot-checks against sampled upstream Google Ads rows

## Layout

- `cmd/google-ads-adapter/` - adapter entrypoint and Google Ads provider logic
- `docs/specs/` - package-local adapter specs
- `docs/workplans/` - package-local workplans
- `docs/validation/` - package-local validation docs

## Build

```bash
mkdir -p ./bin
go build -o ./bin/google-ads-adapter ./cmd/google-ads-adapter
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
./bin/google-ads-adapter adapter.info
./bin/google-ads-adapter adapter.connections.list
./bin/google-ads-adapter adapter.health --connection <connection-id>
./bin/google-ads-adapter adapter.monitor.start --connection <connection-id>
./bin/google-ads-adapter records.backfill --connection <connection-id> --since 2026-01-01T00:00:00Z
```

## Active Docs

- [docs/README.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/google-ads/docs/README.md)
- [ADAPTER_SPEC_GOOGLE_ADS.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/google-ads/docs/specs/ADAPTER_SPEC_GOOGLE_ADS.md)
- [GOOGLE_ADS_ADAPTER_WORKPLAN.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/google-ads/docs/workplans/GOOGLE_ADS_ADAPTER_WORKPLAN.md)
- [GOOGLE_ADS_ADAPTER_VALIDATION.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/google-ads/docs/validation/GOOGLE_ADS_ADAPTER_VALIDATION.md)

## Cleanroom Proof

The retained MoonSleep proof and provider spot-check are linked from
[GOOGLE_ADS_ADAPTER_VALIDATION.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/google-ads/docs/validation/GOOGLE_ADS_ADAPTER_VALIDATION.md).
