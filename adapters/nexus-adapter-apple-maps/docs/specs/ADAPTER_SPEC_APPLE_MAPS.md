# Adapter Spec: Apple Maps

## Customer Experience

The Apple Maps adapter is manual-first.

The operator experience should be:

1. create one Apple Maps connection through Nex
2. provide manual or uploaded local-presence facts through the canonical Nex
   connection path
3. backfill those facts as canonical inbound records
4. let products such as GlowBot consume the resulting canonical records with
   stable `connection_id`

The target-state adapter does not pretend there is a live Apple Maps API where
there is not one. The adapter is allowed to remain backfill-only/manual as long
as it still follows the canonical record and connection model.

## Adapter Identity

| Field | Value |
|---|---|
| Adapter ID | `apple-maps` |
| Package | `adapters/nexus-adapter-apple-maps/` |
| Binary | `cmd/apple-maps-adapter` |

## Companion Package Spec

- [APPLE_MAPS_ADAPTER_PACKAGE_DISTRIBUTION_AND_INSTALL.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-apple-maps/docs/specs/APPLE_MAPS_ADAPTER_PACKAGE_DISTRIBUTION_AND_INSTALL.md)

## Target-State Rules

1. Inbound data is emitted as canonical `record.ingest`.
2. `connection_id` is the canonical runtime identity.
3. Manual/local data never falls back to `"default"` identity.
4. The adapter may remain backfill-only/manual if that matches the real
   provider surface.

## Operations

The target-state command surface is:

- `adapter.info`
- `adapter.health`
- `adapter.accounts.list`
- `records.backfill`

`adapter.monitor.start` is optional and not required for the manual-first Apple
Maps flow.

## Inbound Record Model

The adapter emits canonical records for manual Apple Maps local-presence facts,
with:

- `connection_id`
- `platform = "apple-maps"`
- stable source metadata for the uploaded/manual facts

## Done Definition

The adapter is at parity only when:

1. it emits canonical `record.ingest`
2. it uses runtime `connection_id`
3. it fails hard on missing connection identity
4. GlowBot can consume the manual records without adapter-local identity hacks
5. the adapter is installable and restart-safe as a shared Nex adapter package
