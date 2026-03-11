# CallRail Adapter Workplan

**Spec:** [ADAPTER_SPEC_CALLRAIL.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-callrail/docs/specs/ADAPTER_SPEC_CALLRAIL.md)
**Package:** `adapters/nexus-adapter-callrail/`
**Date:** 2026-03-11
**Status:** LOCAL IMPLEMENTATION COMPLETE, LIVE VALIDATION PENDING

## Customer Outcome

The goal is a CallRail adapter that gives GlowBot reliable non-EMR call and
attribution facts without silent misattribution.

## Implementation State

Completed locally:

- canonical `record.ingest` output is landed
- fallback/default identity synthesis is removed
- runtime identity now uses `connection_id`

Still pending:

- real CallRail credential validation
- real multi-company validation
- first-clinic GlowBot proof against canonical CallRail records

## Gaps To Close

### G1. Canonical Record Emission

- replace legacy flat event output with canonical `record.ingest`

### G2. Connection Identity Hardening

- remove fallback/default identity synthesis
- make `adapter.accounts.list` reflect runtime-owned `connection_id`

### G3. Live Validation

- validate backfill against real CallRail credentials
- validate monitor against real CallRail credentials
- validate GlowBot metric extraction against canonical records

## Execution Order

1. Land canonical `record.ingest` builders.
2. Remove fallback/default identity behavior.
3. Re-validate `adapter.accounts.list`, backfill, and monitor with real data.

## Remaining Exit Criteria

- no legacy flat events remain
- no synthetic fallback identity remains
- the adapter validates against the canonical Nex connection model
