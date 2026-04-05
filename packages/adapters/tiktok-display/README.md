# Nexus TikTok Display Adapter

Shared TikTok Display adapter for Nex.

This package now provides the shared `tiktok-display` surface through cleanroom-
validated MoonSleep parity.

The package now also includes:

- provider-native `tiktok-display.user.info.get` and `tiktok-display.video.list`
- method catalog and projection metadata in the package manifest
- profile and video snapshot ingest
- backfill and monitor behavior
- retained cleanroom proof with MoonSleep credentials
- stable provider spot-checks against TikTok Display upstream data

## Layout

- `cmd/tiktok-display-adapter/` - adapter entrypoint
- `docs/specs/` - package-local adapter spec
- `docs/workplans/` - package-local workplans
- `docs/validation/` - package-local validation docs

## Build

```bash
mkdir -p ./bin
go build -o ./bin/tiktok-display-adapter ./cmd/tiktok-display-adapter
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
./bin/tiktok-display-adapter adapter.info
./bin/tiktok-display-adapter adapter.connections.list
./bin/tiktok-display-adapter adapter.health --connection tiktok-display-primary
./bin/tiktok-display-adapter tiktok-display.user.info.get --connection tiktok-display-primary
./bin/tiktok-display-adapter tiktok-display.video.list --connection tiktok-display-primary --payload-json '{"page_size": 5}'
```

## Active Docs

- [docs/README.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/tiktok-display/docs/README.md)
- [ADAPTER_SPEC_TIKTOK_DISPLAY.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/tiktok-display/docs/specs/ADAPTER_SPEC_TIKTOK_DISPLAY.md)
- [TIKTOK_DISPLAY_ADAPTER_WORKPLAN.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/tiktok-display/docs/workplans/TIKTOK_DISPLAY_ADAPTER_WORKPLAN.md)
- [TIKTOK_DISPLAY_ADAPTER_VALIDATION.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/tiktok-display/docs/validation/TIKTOK_DISPLAY_ADAPTER_VALIDATION.md)
