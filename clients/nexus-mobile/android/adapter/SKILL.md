---
name: device-android
description: Use the Device Android adapter for Android companion pairing, health, and served device-control commands inside Nex.
---

# Nexus Device Android Adapter

## What This Package Is

`device-android` is the shared Nex adapter for Android companion pairing and device-control endpoint registration.

Use it when Nex should:

- bind one Android companion device to a Nex connection
- verify that the companion app is installed, permissions are granted, and pairing is approved
- publish an Android device-control endpoint through `adapter.serve.start`
- expose a fixed Android command surface to Nex consumers

This package is currently a control-surface adapter. It is not a record-ingest adapter and it does not yet implement the underlying Android commands beyond endpoint registration and stubbed invoke responses.

## When To Use It

Use `device-android` when you need:

- an Android companion pairing flow
- a served Android endpoint with declared capabilities and commands
- a health/readiness check for the Android companion surface
- a stable package boundary for future Android device-control expansion

## Main Operations

- `adapter.info`
- `adapter.connections.list`
- `adapter.health`
- `adapter.setup.start`
- `adapter.setup.submit`
- `adapter.setup.status`
- `adapter.setup.cancel`
- `adapter.serve.start`

There is no current backfill, monitor, or canonical record-ingest contract here.

## CLI Examples

Build and inspect the package-local binary:

```bash
cd /Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile/android/adapter
go test ./...
go build -o ./bin/device-android-adapter ./cmd/device-android-adapter
./bin/device-android-adapter adapter.info
```

Run the setup flow:

```bash
./bin/device-android-adapter adapter.setup.start
./bin/device-android-adapter adapter.setup.submit \
  --session-id <session-id> \
  --payload-json '{"confirm_companion_installed":"yes","confirm_permissions_granted":"yes","confirm_paired":"yes"}'
```

Check health:

```bash
./bin/device-android-adapter adapter.health --connection default
```

## Key Data Models

- `connection_id`
  - current package defaults to one host-like `default` account projection
- setup confirmations
  - `confirm_companion_installed`
  - `confirm_permissions_granted`
  - `confirm_paired`
- served endpoint identity
  - `endpoint_id`
  - platform `android`
  - declared caps and commands
- Android command surface
  - canvas commands
  - camera commands
  - location
  - screen record
  - SMS send

In the current implementation, allowed commands return a stubbed success payload rather than executing real device actions.

## End-To-End Example

1. Install the Android companion app.
2. Grant the required permissions on the device.
3. Approve pairing through the setup flow.
4. Run `adapter.health` to confirm the Android control surface is considered connected.
5. Start `adapter.serve.start` so Nex can upsert an Android endpoint and invoke allowed commands.

The package contract is defined primarily by [cmd/device-android-adapter/main.go](/Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile/android/adapter/cmd/device-android-adapter/main.go) and [main_test.go](/Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile/android/adapter/cmd/device-android-adapter/main_test.go).

## Constraints And Failure Modes

- This package currently returns stubbed invoke payloads for allowed commands.
- Unknown commands should fail with `INVALID_REQUEST`.
- Health is currently driven by simple environment/runtime readiness rather than deep device interrogation.
- Do not document backfill, monitor, or inbound records for this package unless the implementation adds them.

## Related Docs

- [README.md](/Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile/android/adapter/README.md)
- [cmd/device-android-adapter/main.go](/Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile/android/adapter/cmd/device-android-adapter/main.go)
- [main_test.go](/Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile/android/adapter/cmd/device-android-adapter/main_test.go)
