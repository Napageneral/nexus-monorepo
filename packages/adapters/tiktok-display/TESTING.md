# TikTok Display Adapter Testing

This guide covers the package scaffold slice for the shared TikTok Display
adapter.

Real TikTok Display auth, profile sync, video sync, and MoonSleep validation
land in follow-on tickets.

## Build

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/tiktok-display

go test ./...
mkdir -p ./bin
go build -o ./bin/tiktok-display-adapter ./cmd/tiktok-display-adapter
```

## Validate Local Command Surface

```bash
./bin/tiktok-display-adapter adapter.info
./bin/tiktok-display-adapter adapter.connections.list
```

## Build Package Artifact

```bash
./scripts/package-release.sh
tar -tzf ./dist/tiktok-display-0.1.0.tar.gz
```
