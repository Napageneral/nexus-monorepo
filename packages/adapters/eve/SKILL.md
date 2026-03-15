---
name: eve
description: Use the Eve adapter for local macOS iMessage access, backfill, monitor, and delivery through Nex-managed connections.
---

# Nexus Eve Adapter

Use the shared Eve adapter when Nex should own local iMessage access on macOS
through a durable adapter connection.

## Use The Eve Adapter For

- local iMessage history backfill through Eve's warehouse
- live iMessage monitor flows routed through the adapter runtime
- iMessage delivery through the local Messages app
- setup and health checks for Full Disk Access dependent local messaging access

## Core Rules

1. the eve adapter owns local iMessage integration behavior for Nex
2. callers should bind through Nex-managed connections instead of reaching into
   `chat.db` directly
3. package-specific workflows should go through the adapter surface instead of
   ad hoc local scripts
4. emitted records and adapter responses should stay secret-free

## Main Nex Surfaces

- `adapters.connections.create`, `adapters.connections.update`,
  `adapters.connections.test`, and `adapters.connections.status`
- `adapters.connections.backfill` and monitor flows for inbound iMessage
  records
- `channels.send` for outbound iMessage delivery

## Do Not Do This

- do not bypass the adapter with direct `chat.db` reads from unrelated product
  code
- do not treat local file paths or row ids as canonical Nex identity
- do not assume package-local implementation details are the public API

## Recommended Workflow

1. create or update the durable Eve connection
2. complete the setup flow and verify health
3. backfill historical data
4. start or verify monitor
5. send through the adapter surface instead of ad hoc AppleScript calls
