# Adapter Protocol Contract (Machine-Readable)

This folder contains the canonical, machine-readable contract for the Nexus adapter protocol.

**Why:** the adapter protocol is shared across:

- NEX (adapter manager)
- Go SDK (`nexus-adapter-sdks/nexus-adapter-sdk-go`)
- TypeScript SDK (`nexus-adapter-sdks/nexus-adapter-sdk-ts`)
- every adapter binary

The contract exists to prevent spec drift across Markdown docs and SDK implementations.

## Versioning

- Canonical contract: `v2` (`$id` = `https://nexus-project.dev/schemas/adapter-protocol/v2`)
- `v2` uses unified delivery taxonomy field names:
  - `platform`, `account_id`, optional `space_id`
  - `container_kind`, `container_id`
  - optional `thread_id`, `reply_to_id`

Legacy (`v1`) field names (example: `channel`, `peer_id`, `peer_kind`) are **not** part of the canonical schema.

## Files

- `adapter-protocol.schema.json`: JSON Schema for all protocol payloads (JSON and JSONL lines).
- `fixtures/`: sample payloads that MUST validate against the schema.

## Transition Behavior (NEX Runtime)

- Inbound adapter parsing:
  - NEX accepts canonical `v2` payloads.
  - NEX also accepts legacy `v1` flat payloads during migration and normalizes them to canonical internal `NexusEvent` shape.
- Outbound adapter invocations:
  - NEX emits canonical `v2` fields for send/stream targeting (`thread_id`, `reply_to_id` included when available).

This preserves backward compatibility while keeping the machine-readable contract authoritative for all new adapters.

## Conformance

SDK repos MUST include conformance tests that:

1. validate fixtures against `adapter-protocol.schema.json`
2. validate that SDK (de)serialization accepts the same fixtures
