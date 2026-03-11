# Google Adapter Validation Ladder

**Spec:** [ADAPTER_SPEC_GOOGLE.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-google/docs/specs/ADAPTER_SPEC_GOOGLE.md)
**Workplan:** [GOOGLE_ADAPTER_WORKPLAN.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-google/docs/workplans/GOOGLE_ADAPTER_WORKPLAN.md)
**Date:** 2026-03-11
**Status:** LOCAL CONTRACT VALIDATION COMPLETE, LIVE VALIDATION PENDING

## Rung 1: Contract Integrity

- `go test ./...`
- `go build ./cmd/google-adapter`
- `./google-adapter adapter.info`

Pass criteria:

- the operations list includes `adapter.monitor.start` and `records.backfill`
- target-state docs remain the package-local source of truth

Status: complete

## Rung 2: Connection Identity

- `adapter.accounts.list`
- `adapter.health`

Pass criteria:

- runtime identity is `connection_id`
- no provider email or `"default"` placeholder is used as the canonical
  account surface

Status: complete for local implementation

## Rung 3: Ads Backfill

- run historical Google Ads backfill against a real connection
- inspect emitted records

Pass criteria:

- output is canonical `record.ingest`
- `connection_id` is present
- provider customer ids remain metadata only

Status: pending real credentials

## Rung 4: Business Profile Backfill And Monitor

- run Business Profile backfill
- run monitor against a real connection

Pass criteria:

- both paths emit the same canonical record model
- location ids remain metadata, not canonical connection identity

Status: pending real credentials

## Rung 5: Managed Gateway Decoupling

- inspect managed-profile behavior through the runtime/frontdoor gateway

Pass criteria:

- no GlowBot-specific managed credential URL remains in the shared adapter path
- shared adapter behavior remains product-agnostic

Status: complete for local implementation

## Rung 6: GlowBot First-Clinic Proof

- connect the adapter through real non-EMR clinic credentials
- validate raw record arrival
- validate GlowBot metric extraction and dashboard sanity

Pass criteria:

- GlowBot can consume the canonical Google records without adapter-local
  identity hacks

Status: pending first clinic
