# Nex OpenAPI Channels Data Hardening

## Customer Experience

A Nex API consumer should be able to inspect and manage channel state directly from
`contracts/nex/openapi.yaml` without reading handler source.

This pass hard-cuts the implemented channel data slice:

- `channels.list`
- `channels.get`
- `channels.search`
- `channels.create`
- `channels.update`
- `channels.resolve`
- `channels.history`
- `channels.participants.list`
- `channels.participants.get`
- `channels.participants.history`
- `channels.status`

## Research

Source: `nex/src/nex/runtime-api/server-methods/channels-data.ts`

Observations:
- all targeted methods live in one handler file
- channel rows and participant rows are normalized through explicit mapper functions
- `channels.resolve` has three stable outcomes:
  - `resolved`
  - `materialized`
  - `unresolved`
- `channels.status` already has protocol-level schemas; the rest require local schemas
- `channels.send`, `channels.stream`, `channels.react`, `channels.edit`, and
  `channels.delete` are adapter-capability operations and are intentionally not part of
  this channels-data pass

## Validation

```bash
cd /Users/tyler/nexus/home/projects/nexus/nex && pnpm contracts:generate:nex
cd /Users/tyler/nexus/home/projects/nexus/nex && pnpm exec vitest run src/nex/runtime-api/openapi/nex-contract.test.ts
```
