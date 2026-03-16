# Nexus Device iOS Adapter

This package is the shared Device iOS adapter for Nex.

## Build

```bash
mkdir -p ./bin
go build -o ./bin/device-ios-adapter ./cmd/device-ios-adapter
```

## Package

```bash
./scripts/package-release.sh
```

## Consumer SDK

Consumer SDKs for this package are generated centrally from `api/openapi.yaml` into `artifacts/sdk/ts/adapters/device-ios-sdk-ts/`.
This package does not own SDK publication logic.
