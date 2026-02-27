# nexus-adapter-device-macos

Dedicated Nexus device adapter project for macOS companion control sessions.

## Scope

This adapter project exposes the current macOS capability/command surface through canonical adapter operations:

- `adapter.info`
- `adapter.health`
- `adapter.accounts.list`
- `adapter.control.start`
- `adapter.setup.start|submit|status|cancel`

## Build

```bash
go build ./cmd/device-macos-adapter
```

## Test

```bash
go test ./...
```

## Run

```bash
go run ./cmd/device-macos-adapter adapter.info
go run ./cmd/device-macos-adapter adapter.health --account default
go run ./cmd/device-macos-adapter adapter.control.start --account default
```

## Notes

`adapter.control.start` currently declares and validates the macOS command surface and returns stubbed invoke payloads. Live companion-bridge wiring remains a separate app/device parity pass.
