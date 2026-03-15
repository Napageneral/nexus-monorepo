# Nexus Eve Adapter

This package is the shared Eve adapter for local macOS iMessage access in Nex.

## Scope

- local Eve setup and readiness checks
- iMessage backfill from Eve warehouse
- live monitor via Eve warehouse plus best-effort `chat.db` sync
- iMessage send through Messages.app

## Validate

```bash
go test ./...
go build ./cmd/eve-adapter
```

## Package

```bash
./scripts/package-release.sh
```

## Consumer SDK

Consumer SDKs for this package are generated centrally from `api/openapi.yaml` into `artifacts/sdk/ts/adapters/eve-sdk-ts/`.
This package does not own SDK publication logic.
