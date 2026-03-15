---
name: eve
description: Use the Eve adapter for local macOS iMessage setup, health, backfill, monitor, staged backfill, and outbound send through Nex-managed connections.
---

# Nexus Eve Adapter

## What This Package Is

`eve` is the shared Nex adapter for local macOS iMessage access via Eve’s warehouse.

Use it when Nex should:

- own one local iMessage connection on a macOS host
- guide setup for Full Disk Access and warehouse readiness
- backfill and monitor messages, reactions, and membership events
- send outbound iMessages through the local Messages app

This package is the canonical packaged Eve surface. It should replace older direct binary path assumptions and hide `chat.db` timing quirks from downstream apps.

## When To Use It

Use `eve` when you need:

- local iMessage data in Nex as canonical `record.ingest`
- a guided setup flow for macOS permissions
- continuous sync through Eve warehouse plus best-effort `chat.db` ETL
- outbound local iMessage send through the adapter surface

## Main Operations

- `adapter.info`
- `adapter.accounts.list`
- `adapter.setup.start`
- `adapter.setup.submit`
- `adapter.setup.status`
- `adapter.setup.cancel`
- `adapter.health`
- `records.backfill`
- `adapter.monitor.start`
- `channels.send`
- `records.backfill.stage`

## CLI Examples

Build and inspect the package-local binary:

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/eve
go test ./...
go build -o ./bin/eve-adapter ./cmd/eve-adapter
./bin/eve-adapter adapter.info
```

Run the guided setup flow:

```bash
./bin/eve-adapter adapter.setup.start
./bin/eve-adapter adapter.setup.submit \
  --session-id <session-id> \
  --payload-json '{"confirm_full_disk_access":"yes"}'
```

Check local readiness:

```bash
./bin/eve-adapter adapter.accounts.list
./bin/eve-adapter adapter.health --connection default
```

Backfill or monitor local iMessage data:

```bash
./bin/eve-adapter records.backfill --connection default --since 2026-01-01T00:00:00Z
./bin/eve-adapter adapter.monitor.start --connection default
```

Stage a bulk backfill into JSONL chunks:

```bash
./bin/eve-adapter records.backfill.stage \
  --connection default \
  --payload-json '{"since":"2026-01-01T00:00:00Z","stage_dir":"/tmp/eve-stage"}'
```

Send an iMessage:

```bash
./bin/eve-adapter channels.send \
  --connection default \
  --target-json '{"connection_id":"default","channel":{"platform":"imessage","container_id":"+14155551234"}}' \
  --text 'Hello from Nex'
```

## Key Data Models

- package identity vs platform identity
  - package id is `eve`
  - runtime platform is `imessage`
- current connection model
  - single local default account projection today
  - runtime `connection_id` is still the durable Nex identity surface
- local readiness state
  - `chat.db` readability
  - Eve warehouse readability
  - Full Disk Access confirmation
- canonical inbound record types
  - messages
  - reactions
  - membership events
- staged backfill manifest
  - chunked canonical JSONL files
  - manifest with paths, record counts, and timestamp bounds

## End-To-End Example

1. Install the packaged `eve` adapter on the macOS host.
2. Create the Eve connection in Nex.
3. Complete setup by granting Full Disk Access and confirming warehouse readiness.
4. Run `adapter.health` to verify `chat.db` and warehouse access.
5. Run `records.backfill` to import historical iMessage messages, reactions, and membership events.
6. Start `adapter.monitor.start` so new local iMessage activity continuously lands in Nex.
7. Use `channels.send` to send an outbound iMessage through the local Messages app.

That is the customer experience defined in [ADAPTER_SPEC_EVE.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/specs/ADAPTER_SPEC_EVE.md) and validated in [EVE_ADAPTER_VALIDATION.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/validation/EVE_ADAPTER_VALIDATION.md).

## Constraints And Failure Modes

- Full Disk Access is a real hard dependency for `chat.db` access.
- The adapter can continue warehouse-only in some degraded cases, but local readiness should report that clearly.
- The package is single-account in the current cut, even though `connection_id` remains the canonical Nex identity surface.
- The first packaged cut does not promise edit/delete/react outbound parity.

## Related Docs

- [README.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/README.md)
- [ADAPTER_SPEC_EVE.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/specs/ADAPTER_SPEC_EVE.md)
- [EVE_ADAPTER_VALIDATION.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/validation/EVE_ADAPTER_VALIDATION.md)
- [cmd/eve-adapter/main.go](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/cmd/eve-adapter/main.go)
