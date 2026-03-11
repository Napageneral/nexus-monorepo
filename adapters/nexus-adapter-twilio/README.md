# Nexus Twilio Adapter

Shared Twilio adapter for Nex.

This repository contains:

- the Twilio adapter implementation
- package-local spec, workplan, and validation docs
- an installable adapter package manifest in `adapter.nexus.json`
- a release script that emits a Nex operator-install tarball

## Layout

- `cmd/twilio-adapter/` - adapter entrypoint and Twilio provider logic
- `docs/specs/` - active target-state adapter specs
- `docs/workplans/` - active gap-closure workplans
- `docs/validation/` - active validation ladders

## Build

```bash
mkdir -p ./bin
go build -o ./bin/twilio-adapter ./cmd/twilio-adapter
```

## Package

```bash
./scripts/package-release.sh
```

This writes a tarball to `./dist/` containing:

- `adapter.nexus.json`
- `bin/twilio-adapter`

## Test

```bash
go test ./...
```

## Local CLI

```bash
./bin/twilio-adapter adapter.info
./bin/twilio-adapter adapter.accounts.list
./bin/twilio-adapter adapter.health --connection <connection-id>
./bin/twilio-adapter adapter.monitor.start --connection <connection-id>
./bin/twilio-adapter records.backfill --connection <connection-id> --since 2026-01-01T00:00:00Z
```

## Active Docs

- [docs/README.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-twilio/docs/README.md)
- [ADAPTER_SPEC_TWILIO.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-twilio/docs/specs/ADAPTER_SPEC_TWILIO.md)
- [TWILIO_ADAPTER_PACKAGE_DISTRIBUTION_AND_INSTALL.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-twilio/docs/specs/TWILIO_ADAPTER_PACKAGE_DISTRIBUTION_AND_INSTALL.md)
