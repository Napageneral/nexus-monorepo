# Device macOS Adapter Testing

## Build

```bash
cd /Users/tyler/nexus/home/projects/nexus/clients/nexus-desktop/macos/adapter
go test ./...
./scripts/package-release.sh
```

## Consumer SDK

```bash
```

Consumer SDKs are generated centrally from `api/openapi.yaml`; there is no package-local SDK generation step.
