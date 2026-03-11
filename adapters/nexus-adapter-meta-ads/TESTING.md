# Meta Ads Adapter Testing

This guide covers the package/install slice for the shared Meta Ads adapter.

Live Meta credential validation remains the next step after package parity is
complete.

## Build

```bash
cd /Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-meta-ads

go test ./...
mkdir -p ./bin
go build -o ./bin/meta-ads-adapter ./cmd/meta-ads-adapter
```

## Validate Local Command Surface

```bash
./bin/meta-ads-adapter adapter.info
```

## Build Package Artifact

```bash
./scripts/package-release.sh
tar -tzf ./dist/nexus-adapter-meta-ads-0.1.0.tar.gz
```

Pass criteria:

- tarball exists under `dist/`
- archive contains `adapter.nexus.json`
- archive contains `bin/meta-ads-adapter`

## Next Validation Layer

After package/install parity is green:

1. install the package into an isolated Nex runtime
2. verify package health and restart rehydration
3. validate real Meta Ads credentials
