# TikTok Display Adapter Testing

This guide covers the package scaffold slice for the shared TikTok Display
adapter.

Real TikTok Display auth, profile sync, video sync, provider-native reads, and
MoonSleep validation are implemented in this package.

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
./bin/tiktok-display-adapter tiktok-display.user.info.get --connection tiktok-display-primary
./bin/tiktok-display-adapter tiktok-display.video.list --connection tiktok-display-primary --payload-json '{"page_size": 5}'
```

## Build Package Artifact

```bash
./scripts/package-release.sh
tar -tzf ./dist/tiktok-display-0.1.0.tar.gz
```
