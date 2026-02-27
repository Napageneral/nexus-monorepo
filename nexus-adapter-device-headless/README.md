# nexus-adapter-device-headless

Dedicated Nexus device adapter project for headless host control sessions.

## Scope

This adapter project exposes the current headless command surface through canonical adapter operations:

- `adapter.info`
- `adapter.health`
- `adapter.accounts.list`
- `adapter.control.start`
- `adapter.setup.start|submit|status|cancel`

Command surface:

- `system.run`
- `system.which`
- `browser.proxy` (when enabled)

## Build

```bash
go build ./cmd/device-headless-adapter
```

## Test

```bash
go test ./...
```

## Run

```bash
go run ./cmd/device-headless-adapter adapter.info
go run ./cmd/device-headless-adapter adapter.health --account default
go run ./cmd/device-headless-adapter adapter.control.start --account default
```

## Notes

`system.run` and `system.which` are implemented in this adapter. `browser.proxy` is surfaced as a stub response for control-path validation and can be toggled with `NEXUS_DEVICE_HEADLESS_BROWSER_PROXY_ENABLED=false`.
