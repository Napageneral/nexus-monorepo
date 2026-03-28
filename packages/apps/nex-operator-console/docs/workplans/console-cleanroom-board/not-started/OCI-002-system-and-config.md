# OCI-002 System and Config Domain Tests

## Goal

Prove that the system, config, sessions, logs, debug, usage, and presence
controller paths work against a real runtime.

## Scope

Tests for:

- `runtime.hello` — returns version, snapshot, session info
- `status` — returns runtime status
- `health` — returns health snapshot
- `presence.list` — returns presence entries (may be empty)
- `sessions.list` — returns sessions (at least one: our own)
- `config.get` — returns current config snapshot
- `config.set` + `config.get` — round-trip a config value
- `config.apply` — applies config without error
- `logs.recent` — returns log entries array
- `debug.snapshot` — returns debug snapshot object
- `usage.sessions` — returns usage data (may be empty)

## Dependencies

- OCI-001 (harness and boot)

## Acceptance

1. All listed RPC methods return valid responses
2. Config round-trip proves write-read consistency
3. Sessions list includes at least one session (our WebSocket connection)
4. No runtime errors or crashes during the test

## Validation

- Each test asserts response shape matches expected type
- Config set + get proves the value persists
