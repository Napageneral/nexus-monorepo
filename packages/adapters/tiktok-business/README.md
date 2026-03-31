# Nexus TikTok Business Adapter

Shared TikTok Business adapter for Nex.

This package now provides the shared `tiktok-business` surface through cleanroom-
validated MoonSleep parity.

Current behavior:

- SDK-wired adapter entrypoint
- `adapter.connections.list`
- `adapter.health`
- runtime credential parsing for TikTok Business access tokens and advertiser
  identity
- provider-row mapping for hierarchy and report rows
- replay-safe backfill and monitor behavior built on the shared fetch path
- retained cleanroom proof with MoonSleep credentials
- stable provider spot-checks against TikTok Business upstream data

## Layout

- `cmd/tiktok-business-adapter/` - adapter entrypoint
- `docs/specs/` - package-local adapter spec
- `docs/workplans/` - package-local workplans
- `docs/validation/` - package-local validation docs

## Build

```bash
mkdir -p ./bin
go build -o ./bin/tiktok-business-adapter ./cmd/tiktok-business-adapter
```

## Package

```bash
./scripts/package-release.sh
```

This writes a tarball to `./dist/` containing:

- `adapter.nexus.json`
- `bin/tiktok-business-adapter`

## Test

```bash
go test ./...
```

## Local CLI

```bash
./bin/tiktok-business-adapter adapter.info
./bin/tiktok-business-adapter adapter.connections.list
./bin/tiktok-business-adapter adapter.health --connection tiktok-business-primary
```

## Active Docs

- [docs/README.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/tiktok-business/docs/README.md)
- [ADAPTER_SPEC_TIKTOK_BUSINESS.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/tiktok-business/docs/specs/ADAPTER_SPEC_TIKTOK_BUSINESS.md)
- [TIKTOK_BUSINESS_ADAPTER_WORKPLAN.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/tiktok-business/docs/workplans/TIKTOK_BUSINESS_ADAPTER_WORKPLAN.md)
- [TIKTOK_BUSINESS_ADAPTER_VALIDATION.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/tiktok-business/docs/validation/TIKTOK_BUSINESS_ADAPTER_VALIDATION.md)
