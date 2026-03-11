# Google Adapter Testing

This guide covers the package/install slice for the shared Google adapter.

Live Google credential validation remains a separate step after package parity is
complete.

## Build

```bash
cd /Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-google

go test ./...
mkdir -p ./bin
go build -o ./bin/google-adapter ./cmd/google-adapter
```

## Validate Local Command Surface

```bash
./bin/google-adapter adapter.info
```

Pass criteria:

- the binary starts
- `adapter.info` returns the canonical operation surface

## Build Package Artifact

```bash
./scripts/package-release.sh
tar -tzf ./dist/nexus-adapter-google-0.1.0.tar.gz
```

Pass criteria:

- tarball exists under `dist/`
- archive contains `adapter.nexus.json`
- archive contains `bin/google-adapter`

## Next Validation Layer

After package/install parity is green:

1. install the package into an isolated Nex runtime
2. verify package health and restart rehydration
3. validate real Google Ads and Business Profile credentials
