# Adapter API Contracts

This directory holds canonical generated OpenAPI artifacts for adapter-owned package contracts.

Important boundary:

1. Nex runtime `adapter.*` and `adapters.connections.*` methods belong to the Nex API and are published in `contracts/nex/openapi.yaml`.
2. Per-adapter artifacts here publish the adapter package contract itself.

First-wave per-adapter OpenAPI covers ordinary JSON request/response package operations such as:

1. `adapter.info`
2. `adapter.accounts.list`
3. `adapter.health`
4. `adapter.setup.*`
5. `channels.send`
6. adapter-specific declared methods

Long-lived stream/session protocol operations such as `adapter.monitor.start`, `records.backfill`, `adapter.control.start`, and `channels.stream` remain documented by the shared adapter protocol contract and are intentionally omitted from first-wave per-adapter OpenAPI.

Per-adapter consumer SDK packages belong in the owning adapter repos under:

- `adapters/<adapterId>/sdk/`

Not every adapter will publish an artifact immediately. Manifest-only packages may be deferred until a richer package contract source is available.
