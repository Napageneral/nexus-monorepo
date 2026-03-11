# Meta Ads Adapter Validation Ladder

**Spec:** [ADAPTER_SPEC_META_ADS.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-meta-ads/docs/specs/ADAPTER_SPEC_META_ADS.md)
**Workplan:** [META_ADS_ADAPTER_WORKPLAN.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-meta-ads/docs/workplans/META_ADS_ADAPTER_WORKPLAN.md)
**Date:** 2026-03-11
**Status:** LOCAL CONTRACT VALIDATION COMPLETE, LIVE VALIDATION PENDING

## Rung 1: Contract Integrity

- `go test ./...`
- `go build ./cmd/meta-ads-adapter`
- `./meta-ads-adapter adapter.info`

Pass criteria:

- the adapter exposes `adapter.monitor.start` and `records.backfill`

Status: complete

## Rung 2: Connection Identity

- `adapter.accounts.list`
- `adapter.health`

Pass criteria:

- runtime identity is `connection_id`
- no `"default"` placeholder is treated as the canonical account surface

Status: complete for local implementation

## Rung 3: Backfill Emits Canonical Records

- run historical backfill against a real connection

Pass criteria:

- output is canonical `record.ingest`
- `connection_id` is present

Status: pending real credentials

## Rung 4: Monitor Emits Canonical Records

- run monitor against a real connection

Pass criteria:

- monitor uses the same canonical record model as backfill

Status: pending real credentials

## Rung 5: Managed Gateway Decoupling

- inspect managed-profile behavior through the runtime/frontdoor gateway

Pass criteria:

- no GlowBot-specific managed credential URL remains in the adapter path

Status: complete for local implementation

## Rung 6: GlowBot First-Clinic Proof

- connect a real non-EMR clinic Meta Ads source
- validate record arrival and metric extraction

Pass criteria:

- GlowBot consumes the records without adapter-local identity hacks

Status: pending first clinic
