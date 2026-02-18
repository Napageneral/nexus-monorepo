# Adapter Protocol Contract (Machine-Readable)

This folder contains the canonical, machine-readable contract for the Nexus adapter protocol.

**Why:** the adapter protocol is shared across:

- NEX (adapter manager)
- Go SDK (`nexus-adapter-sdks/nexus-adapter-sdk-go`)
- TypeScript SDK (`nexus-adapter-sdks/nexus-adapter-sdk-ts`)
- every adapter binary

The contract exists to prevent spec drift across Markdown docs and SDK implementations.

## Files

- `adapter-protocol.schema.json`: JSON Schema for all protocol payloads (JSON and JSONL lines).
- `fixtures/`: sample payloads that MUST validate against the schema.

## Conformance

SDK repos MUST include conformance tests that:

1. validate fixtures against `adapter-protocol.schema.json`
2. validate that SDK (de)serialization accepts the same fixtures
