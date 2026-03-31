# TikTok Business Adapter Testing

This guide covers the package scaffold plus auth/health slice for the shared
TikTok Business adapter.

Backfill, monitor, and MoonSleep validation land in follow-on tickets.

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
