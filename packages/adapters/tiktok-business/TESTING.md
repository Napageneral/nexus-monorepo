# TikTok Business Adapter Testing

This guide covers the current TikTok Business first-wave public read surface,
auth/health slice, and retained MoonSleep cleanroom validation.

## Build

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/tiktok-business

go test ./...
mkdir -p ./bin
go build -o ./bin/tiktok-business-adapter ./cmd/tiktok-business-adapter
```

## Validate Local Command Surface

```bash
./bin/tiktok-business-adapter adapter.info
./bin/tiktok-business-adapter adapter.connections.list
./bin/tiktok-business-adapter adapter.health --connection tiktok-business-primary
./bin/tiktok-business-adapter tiktok-business.campaigns.list --connection tiktok-business-primary --payload-json '{}'
./bin/tiktok-business-adapter tiktok-business.reports.campaign_daily.list --connection tiktok-business-primary --payload-json '{"since":"2026-03-01","until":"2026-03-01"}'
```

## Build Package Artifact

```bash
./scripts/package-release.sh
tar -tzf ./dist/tiktok-business-0.1.0.tar.gz
```

Pass criteria:

- tarball exists under `dist/`
- archive contains `adapter.nexus.json`
- archive contains `bin/tiktok-business-adapter`
- `go test ./...` passes
