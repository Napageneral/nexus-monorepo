---
name: device-macos
description: Use the Device macOS adapter for macOS companion pairing, health, and served device-control commands inside Nex.
---

# Nexus Device macOS Adapter

## What This Package Is

`device-macos` is the shared Nex adapter for macOS companion pairing and device-control endpoint registration.

Use it when Nex should:

- bind one macOS companion host to a Nex connection
- verify companion install, permissions, and pairing
- publish a served macOS endpoint through `adapter.serve.start`
- advertise a macOS command surface to Nex consumers

This package is currently a control-surface adapter. It does not yet implement the underlying device actions beyond endpoint registration and stubbed invoke responses.

## When To Use It

Use `device-macos` when you need:

- a macOS companion pairing flow
- a served macOS endpoint with declared capabilities and commands
- a health/readiness check for the macOS control surface
- a package boundary for future macOS device-control work

## Main Operations

- `adapter.info`
- `adapter.accounts.list`
- `adapter.health`
- `adapter.setup.start`
- `adapter.setup.submit`
- `adapter.setup.status`
- `adapter.setup.cancel`
- `adapter.serve.start`

There is no current backfill, monitor, or record-ingest contract here.

## CLI Examples

Build and inspect the package-local binary:

```bash
cd /Users/tyler/nexus/home/projects/nexus/clients/nexus-desktop/macos/adapter
go test ./...
go build -o ./bin/device-macos-adapter ./cmd/device-macos-adapter
./bin/device-macos-adapter adapter.info
```

Run the setup flow:

```bash
./bin/device-macos-adapter adapter.setup.start
./bin/device-macos-adapter adapter.setup.submit \
  --session-id <session-id> \
  --payload-json '{"confirm_companion_installed":"yes","confirm_permissions_granted":"yes","confirm_paired":"yes"}'
```

Check health:

```bash
./bin/device-macos-adapter adapter.health --connection default
```

## Key Data Models

- `connection_id`
  - current package defaults to one host-like `default` account projection
- setup confirmations
  - `confirm_companion_installed`
  - `confirm_permissions_granted`
  - `confirm_paired`
- served endpoint identity
  - platform `macos`
  - endpoint id
  - caps and commands
- macOS command surface
  - canvas commands
  - camera commands
  - location
  - screen record
  - system notify
  - system.which
  - system.run

In the current implementation, allowed commands return a stubbed success payload rather than executing real macOS actions.

## End-To-End Example

1. Install the macOS companion app.
2. Grant the required system permissions.
3. Approve pairing through the setup flow.
4. Run `adapter.health` to confirm the macOS control surface is considered connected.
5. Start `adapter.serve.start` so Nex can upsert a macOS endpoint and invoke allowed commands.

The package contract is defined primarily by [cmd/device-macos-adapter/main.go](/Users/tyler/nexus/home/projects/nexus/clients/nexus-desktop/macos/adapter/cmd/device-macos-adapter/main.go) and [main_test.go](/Users/tyler/nexus/home/projects/nexus/clients/nexus-desktop/macos/adapter/cmd/device-macos-adapter/main_test.go).

## Constraints And Failure Modes

- This package currently returns stubbed invoke payloads for allowed commands.
- Unknown commands should fail with `INVALID_REQUEST`.
- Health is currently driven by simple environment/runtime readiness rather than deep local inspection.
- Do not document ingest behavior for this package unless the implementation adds it.

## Related Docs

- [README.md](/Users/tyler/nexus/home/projects/nexus/clients/nexus-desktop/macos/adapter/README.md)
- [cmd/device-macos-adapter/main.go](/Users/tyler/nexus/home/projects/nexus/clients/nexus-desktop/macos/adapter/cmd/device-macos-adapter/main.go)
- [main_test.go](/Users/tyler/nexus/home/projects/nexus/clients/nexus-desktop/macos/adapter/cmd/device-macos-adapter/main_test.go)
