# Google Adapter Workplan

**Spec:** [ADAPTER_SPEC_GOOGLE.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-google/docs/specs/ADAPTER_SPEC_GOOGLE.md)
**Package:** `adapters/nexus-adapter-google/`
**Date:** 2026-03-11
**Status:** LOCAL IMPLEMENTATION COMPLETE, LIVE VALIDATION PENDING

## Customer Outcome

The goal is not "the Google adapter binary still works."

The goal is:

- Google is a shared provider adapter that any Nex app can use
- the adapter emits canonical Google records with stable `connection_id`
- GlowBot can safely use Google Ads and Business Profile on a first live clinic
  without product-coupled credential plumbing

## Implementation State

Completed locally:

- canonical `record.ingest` builders now exist for Ads and Business Profile
- runtime `connection_id` is the canonical identity surface
- the shared adapter no longer hardcodes a GlowBot-specific managed credential URL
- runtime OAuth credentials can be bridged into `gog` under `connection_id`

Still pending:

- real Google Ads credential validation
- real Google Business Profile credential validation
- first-clinic GlowBot proof against canonical Google records

## Gaps To Close

### G1. Canonical Inbound Contract

- replace legacy flat event output with canonical `record.ingest`
- preserve Google Ads and Business Profile facts as canonical provider records
- keep `connection_id` as the durable connection field

### G2. Connection Identity

- stop exposing provider email or `"default"` as the operational account
  identity
- make `adapter.accounts.list` reflect runtime-owned `connection_id`

### G3. Managed Gateway Decoupling

- remove the hardcoded GlowBot-managed credential URL
- use the canonical managed connection gateway path instead

### G4. Live Validation

- verify Ads backfill/monitor against real credentials
- verify Business Profile backfill/monitor against real credentials
- verify GlowBot can consume the resulting canonical records

## Execution Order

1. Land canonical `record.ingest` builders for Ads and Business Profile.
2. Hard-cut account/connection semantics to runtime `connection_id`.
3. Remove GlowBot-specific managed credential URL usage.
4. Re-validate `adapter.info`, `adapter.health`, `adapter.accounts.list`,
   `records.backfill`, and `adapter.monitor.start`.
5. Run first-clinic GlowBot validation with real non-EMR data.

## Remaining Exit Criteria

- the adapter no longer emits legacy flat events
- the adapter no longer depends on GlowBot-managed credential URLs
- the adapter uses `connection_id` as its runtime identity surface
- both Google Ads and Business Profile validate through the same shared
  adapter contract
