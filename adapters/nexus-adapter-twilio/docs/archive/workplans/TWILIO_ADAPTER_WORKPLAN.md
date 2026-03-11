# Twilio Adapter Workplan

**Spec:** [ADAPTER_SPEC_TWILIO.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-twilio/docs/specs/ADAPTER_SPEC_TWILIO.md)
**Package:** `adapters/nexus-adapter-twilio/`
**Date:** 2026-03-11
**Status:** LOCAL IMPLEMENTATION COMPLETE, LIVE VALIDATION PENDING

## Customer Outcome

The goal is a Twilio adapter that gives GlowBot real call activity facts
through the canonical Nex connection model.

## Implementation State

Completed locally:

- canonical `record.ingest` output is landed
- runtime identity now uses `connection_id`
- `"default"` identity semantics are removed

Still pending:

- real Twilio credential validation
- first-clinic GlowBot proof against canonical Twilio records

## Gaps To Close

### G1. Canonical Record Emission

- replace legacy flat event output with canonical `record.ingest`

### G2. Connection Identity

- remove `"default"` runtime identity assumptions
- make `adapter.accounts.list` reflect runtime-owned `connection_id`

### G3. Live Validation

- validate backfill against real Twilio credentials
- validate monitor against real Twilio credentials
- validate GlowBot metric extraction against canonical records

## Execution Order

1. Land canonical `record.ingest` builders.
2. Hard-cut runtime identity to `connection_id`.
3. Re-validate the full adapter command surface with real data.

## Remaining Exit Criteria

- no legacy flat events remain
- no `"default"` identity semantics remain
- the adapter validates against the canonical Nex connection model
