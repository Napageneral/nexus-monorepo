# OCI-004 Integrations, Channels, and Apps Domain Tests

## Goal

Prove that the integrations (adapter connections), channels, and installed apps
controller paths work against a real runtime.

## Scope

Tests for:

- `adapters.connections.list` — returns adapter connection entries
- `adapters.connections.test` — tests a connection (may return "not connected",
  that's valid)
- `channels.configure` — configures a channel setting
- `channels.enable` / `channels.disable` — toggles channel state
- `apps.list` — returns installed apps (may be empty on fresh boot)
- `apps.methods` — returns app methods for a known app

Note: OAuth flows and real adapter connections require external credentials and
cannot be tested in a Docker cleanroom. These tests validate the RPC surface
exists and returns valid shapes, not that real external connections work.

## Dependencies

- OCI-001 (harness and boot)

## Acceptance

1. Adapter connections list returns a valid array (may be empty)
2. Channel configure/enable/disable calls don't crash
3. Apps list returns valid shape
4. No protocol or type errors from any call

## Validation

- Each endpoint returns a parseable response
- Error responses for missing adapters are structured (not crashes)
