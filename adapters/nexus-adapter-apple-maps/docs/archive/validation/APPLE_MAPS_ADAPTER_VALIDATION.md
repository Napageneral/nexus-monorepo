# Apple Maps Adapter Validation Ladder

**Spec:** [ADAPTER_SPEC_APPLE_MAPS.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-apple-maps/docs/specs/ADAPTER_SPEC_APPLE_MAPS.md)
**Workplan:** [APPLE_MAPS_ADAPTER_WORKPLAN.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-apple-maps/docs/workplans/APPLE_MAPS_ADAPTER_WORKPLAN.md)
**Date:** 2026-03-11
**Status:** LOCAL CONTRACT VALIDATION COMPLETE, LIVE VALIDATION PENDING

## Rung 1: Contract Integrity

- `go test ./...`
- `go build ./cmd/apple-maps-adapter`
- `./apple-maps-adapter adapter.info`

Pass criteria:

- the adapter exposes a truthful manual-first command surface

Status: complete

## Rung 2: Connection Identity

- `adapter.accounts.list`
- `adapter.health`

Pass criteria:

- runtime identity is `connection_id`
- no fallback/default account identity remains

Status: complete for local implementation

## Rung 3: Backfill Emits Canonical Records

- run manual/backfill flow against a real or fixture-backed connection

Pass criteria:

- output is canonical `record.ingest`
- `connection_id` is present

Status: pending fixture/manual validation

## Rung 4: GlowBot First-Clinic Proof

- validate record arrival and metric extraction through GlowBot

Pass criteria:

- GlowBot consumes the records without adapter-local identity hacks

Status: pending first clinic
