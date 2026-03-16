# Nexus Device macOS Adapter

This package is the shared Device macOS adapter for Nex.

## Build

```bash
mkdir -p ./bin
go build -o ./bin/device-macos-adapter ./cmd/device-macos-adapter
```

## Package

```bash
./scripts/package-release.sh
```

## Consumer SDK

Consumer SDKs for this package are generated centrally from `api/openapi.yaml` into `artifacts/sdk/ts/adapters/device-macos-sdk-ts/`.
This package does not own SDK publication logic.
