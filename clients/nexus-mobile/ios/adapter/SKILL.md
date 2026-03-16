---
name: device-ios
description: Use the Device iOS adapter for iOS companion pairing, health, and served device-control commands inside Nex.
---

# Nexus Device iOS Adapter

## What This Package Is

`device-ios` is the shared Nex adapter for iOS companion pairing and device-control endpoint registration.

Use it when Nex should:

- bind one iOS companion device to a Nex connection
- verify companion install and pairing
- publish a served iOS endpoint through `adapter.serve.start`
- advertise an iOS command surface to Nex consumers

This package is currently a control-surface adapter. It does not yet implement the underlying iOS actions beyond endpoint registration and stubbed invoke responses.

## When To Use It

Use `device-ios` when you need:

- an iOS companion pairing flow
- a served iOS endpoint with declared capabilities and commands
- a health/readiness check for the iOS control surface
- a package boundary for future iOS device-control work

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
cd /Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile/ios/adapter
go test ./...
go build -o ./bin/device-ios-adapter ./cmd/device-ios-adapter
./bin/device-ios-adapter adapter.info
```

Run the setup flow:

```bash
./bin/device-ios-adapter adapter.setup.start
./bin/device-ios-adapter adapter.setup.submit \
  --session-id <session-id> \
  --payload-json '{"confirm_companion_installed":"yes","confirm_paired":"yes"}'
```

Check health:

```bash
./bin/device-ios-adapter adapter.health --connection default
```

## Key Data Models

- `connection_id`
  - current package defaults to one host-like `default` account projection
- setup confirmations
  - `confirm_companion_installed`
  - `confirm_paired`
- served endpoint identity
  - platform `ios`
  - endpoint id
  - caps and commands
- iOS command surface
  - canvas commands
  - camera commands
  - screen record
  - voice wake / talk PTT commands
  - device status/info
  - photos, contacts, calendar, reminders, and motion commands

In the current implementation, allowed commands return a stubbed success payload rather than executing real iOS actions.

## End-To-End Example

1. Install the iOS companion app.
2. Connect the companion app to the runtime and approve pairing.
3. Complete the setup flow with the required confirmations.
4. Run `adapter.health` to confirm the iOS control surface is considered connected.
5. Start `adapter.serve.start` so Nex can upsert an iOS endpoint and invoke allowed commands.

The package contract is defined primarily by [cmd/device-ios-adapter/main.go](/Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile/ios/adapter/cmd/device-ios-adapter/main.go) and [main_test.go](/Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile/ios/adapter/cmd/device-ios-adapter/main_test.go).

## Constraints And Failure Modes

- This package currently returns stubbed invoke payloads for allowed commands.
- Unknown commands should fail with `INVALID_REQUEST`.
- Health is currently driven by simple environment/runtime readiness rather than deep device interrogation.
- Do not document ingest behavior for this package unless the implementation adds it.

## Related Docs

- [README.md](/Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile/ios/adapter/README.md)
- [cmd/device-ios-adapter/main.go](/Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile/ios/adapter/cmd/device-ios-adapter/main.go)
- [main_test.go](/Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile/ios/adapter/cmd/device-ios-adapter/main_test.go)
