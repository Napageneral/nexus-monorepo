# Adapter Spec: Twilio

## Customer Experience

The Twilio adapter gives Nex a shared provider integration for call activity
facts.

The operator experience should be:

1. create one Twilio connection through Nex
2. validate the credential binding
3. backfill recent call history
4. run monitor for freshness
5. let products such as GlowBot consume canonical Twilio records keyed by
   runtime `connection_id`

## Adapter Identity

| Field | Value |
|---|---|
| Adapter ID | `twilio` |
| Package | `adapters/nexus-adapter-twilio/` |
| Binary | `cmd/twilio-adapter` |

## Companion Package Spec

- [TWILIO_ADAPTER_PACKAGE_DISTRIBUTION_AND_INSTALL.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-twilio/docs/specs/TWILIO_ADAPTER_PACKAGE_DISTRIBUTION_AND_INSTALL.md)

## Target-State Rules

1. Inbound data is emitted as canonical `record.ingest`.
2. `connection_id` is the canonical runtime identity.
3. Account SID, call SID, and phone numbers are provider metadata, not runtime
   connection identity.
4. The adapter must not expose `"default"` as the canonical account surface.
5. Backfill and monitor emit the same canonical record model.

## Operations

- `adapter.info`
- `adapter.health`
- `adapter.accounts.list`
- `adapter.monitor.start`
- `records.backfill`

## Inbound Record Model

The adapter emits canonical records for Twilio call activity facts with stable
provider ids in metadata and runtime `connection_id` as the canonical
connection field.

## Done Definition

The adapter is at parity only when:

1. it emits canonical `record.ingest`
2. it uses runtime `connection_id`
3. it no longer treats `"default"` as the account surface
4. live backfill and monitor validate against real credentials
5. the adapter is installable and restart-safe as a shared Nex adapter package
