# Nexus Device Android Adapter

This package is the shared Device Android adapter for Nex.

## Build

```bash
mkdir -p ./bin
go build -o ./bin/device-android-adapter ./cmd/device-android-adapter
```

## Package

```bash
./scripts/package-release.sh
```

## Consumer SDK

Consumer SDKs for this package are generated centrally from `api/openapi.yaml` into `artifacts/sdk/ts/adapters/device-android-sdk-ts/`.
This package does not own SDK publication logic.
