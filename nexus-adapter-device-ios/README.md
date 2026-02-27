# nexus-adapter-device-ios

Dedicated Nexus device adapter project for iOS companion control sessions.

## Scope

This adapter project exposes the current iOS capability/command surface through canonical adapter operations:

- `adapter.info`
- `adapter.health`
- `adapter.accounts.list`
- `adapter.control.start`
- `adapter.setup.start|submit|status|cancel`

## Build

```bash
go build ./cmd/device-ios-adapter
```

## Test

```bash
go test ./...
```

## Run

```bash
go run ./cmd/device-ios-adapter adapter.info
go run ./cmd/device-ios-adapter adapter.health --account default
go run ./cmd/device-ios-adapter adapter.control.start --account default
```

## Notes

`adapter.control.start` currently declares and validates the iOS command surface and returns stubbed invoke payloads. Live companion-bridge wiring remains a separate app/device parity pass.
