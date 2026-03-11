# Adapter Spec: CallRail

## Customer Experience

The CallRail adapter gives Nex a shared provider integration for call-tracking
and attribution facts.

The operator experience should be:

1. create one CallRail connection through Nex
2. validate the credential binding
3. backfill historical call and attribution facts
4. run monitor for freshness
5. let products such as GlowBot consume canonical CallRail records keyed by
   runtime `connection_id`

## Adapter Identity

| Field | Value |
|---|---|
| Adapter ID | `callrail` |
| Package | `adapters/nexus-adapter-callrail/` |
| Binary | `cmd/callrail-adapter` |

## Companion Package Spec

- [CALLRAIL_ADAPTER_PACKAGE_DISTRIBUTION_AND_INSTALL.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-callrail/docs/specs/CALLRAIL_ADAPTER_PACKAGE_DISTRIBUTION_AND_INSTALL.md)

## Target-State Rules

1. Inbound data is emitted as canonical `record.ingest`.
2. `connection_id` is the canonical runtime identity.
3. Company ids, call ids, and attribution ids remain provider metadata.
4. The adapter must fail on missing runtime connection identity rather than
   synthesizing `"default"`.
5. Backfill and monitor emit the same canonical record model.

## Operations

- `adapter.info`
- `adapter.health`
- `adapter.accounts.list`
- `adapter.monitor.start`
- `records.backfill`

## Connection Model

One CallRail connection represents one durable CallRail credential binding
covering one or more companies tracked by the runtime-owned connection.

## Inbound Record Model

The adapter emits canonical records for:

- call activity facts
- attribution/source facts

Each record must preserve `connection_id` and stable provider ids in metadata.

## Done Definition

The adapter is at parity only when:

1. it emits canonical `record.ingest`
2. it uses runtime `connection_id`
3. it fails hard on missing connection identity
4. CallRail backfill and monitor validate against real credentials
5. the adapter is installable and restart-safe as a shared Nex adapter package
