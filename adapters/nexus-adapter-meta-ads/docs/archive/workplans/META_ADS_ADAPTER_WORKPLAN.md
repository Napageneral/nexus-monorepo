# Meta Ads Adapter Workplan

**Spec:** [ADAPTER_SPEC_META_ADS.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-meta-ads/docs/specs/ADAPTER_SPEC_META_ADS.md)
**Package:** `adapters/nexus-adapter-meta-ads/`
**Date:** 2026-03-11
**Status:** LOCAL IMPLEMENTATION COMPLETE, LIVE VALIDATION PENDING

## Customer Outcome

The goal is a shared Meta Ads adapter that can be used by GlowBot and other Nex
apps without adapter-local identity hacks or GlowBot-specific managed-profile
assumptions.

## Implementation State

Completed locally:

- canonical `record.ingest` output is landed
- runtime identity now uses `connection_id`
- the shared adapter no longer hardcodes a GlowBot-specific managed credential URL

Still pending:

- real Meta Ads credential validation
- first-clinic GlowBot proof against canonical Meta records

## Gaps To Close

### G1. Canonical Record Emission

- replace legacy flat event output with canonical `record.ingest`
- keep `connection_id` as the canonical runtime identity

### G2. Connection Identity

- remove `"default"` as the canonical account surface
- make `adapter.accounts.list` reflect runtime-owned `connection_id`

### G3. Managed Gateway Decoupling

- remove GlowBot-specific managed credential URL assumptions
- use the canonical managed connection gateway contract

### G4. Live Validation

- validate backfill against real credentials
- validate monitor against real credentials
- validate GlowBot metric extraction against resulting canonical records

## Execution Order

1. Land canonical `record.ingest` builders.
2. Hard-cut runtime identity to `connection_id`.
3. Remove GlowBot-specific managed credential URL usage.
4. Re-validate the full adapter command surface.

## Remaining Exit Criteria

- no legacy flat events remain
- no `"default"` runtime account identity remains
- no GlowBot-specific managed credential URL remains
- the adapter validates against the canonical Nex connection model
