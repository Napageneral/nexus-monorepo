# Twilio Adapter Testing

This guide covers the package/install slice for the shared Twilio adapter.

Real credential validation remains the next step after package parity is
complete.

## Build

```bash
cd /Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-twilio

go test ./...
mkdir -p ./bin
go build -o ./bin/twilio-adapter ./cmd/twilio-adapter
```

## Validate Local Command Surface

```bash
./bin/twilio-adapter adapter.info
```

## Build Package Artifact

```bash
./scripts/package-release.sh
tar -tzf ./dist/nexus-adapter-twilio-0.1.0.tar.gz
```

Pass criteria:

- tarball exists under `dist/`
- archive contains `adapter.nexus.json`
- archive contains `bin/twilio-adapter`

## Next Validation Layer

After package/install parity is green:

1. install the package into an isolated Nex runtime
2. verify package health and restart rehydration
3. validate real Twilio credentials
