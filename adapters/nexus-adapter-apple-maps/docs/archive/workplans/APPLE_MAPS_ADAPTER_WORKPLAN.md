# Apple Maps Adapter Workplan

**Spec:** [ADAPTER_SPEC_APPLE_MAPS.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-apple-maps/docs/specs/ADAPTER_SPEC_APPLE_MAPS.md)
**Package:** `adapters/nexus-adapter-apple-maps/`
**Date:** 2026-03-11
**Status:** LOCAL IMPLEMENTATION COMPLETE, LIVE VALIDATION PENDING

## Customer Outcome

The goal is an honest manual-first Apple Maps adapter that still speaks the
canonical Nex adapter contract.

## Implementation State

Completed locally:

- canonical `record.ingest` output is landed
- fallback/default identity semantics are removed
- runtime identity now uses `connection_id`

Still pending:

- manual fixture validation through GlowBot
- first-clinic manual proof if Apple Maps is part of rollout

## Gaps To Close

### G1. Canonical Record Emission

- replace legacy flat event output with canonical `record.ingest`

### G2. Connection Identity Hardening

- remove fallback/default identity synthesis
- make `adapter.accounts.list` reflect runtime-owned `connection_id`

### G3. Manual-First Validation

- validate manual/backfill-only ingest against the canonical Nex contract
- validate GlowBot metric extraction against canonical records

## Execution Order

1. Land canonical `record.ingest` builders for manual Apple Maps facts.
2. Remove fallback/default identity behavior.
3. Re-validate the manual/backfill path.

## Remaining Exit Criteria

- no legacy flat events remain
- no fallback/default identity semantics remain
- the adapter remains honest about being manual-first while matching the
  canonical Nex contract
