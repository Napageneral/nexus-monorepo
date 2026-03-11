# Twilio Adapter Validation Ladder

**Spec:** [ADAPTER_SPEC_TWILIO.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-twilio/docs/specs/ADAPTER_SPEC_TWILIO.md)
**Workplan:** [TWILIO_ADAPTER_WORKPLAN.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-twilio/docs/workplans/TWILIO_ADAPTER_WORKPLAN.md)
**Date:** 2026-03-11
**Status:** LOCAL CONTRACT VALIDATION COMPLETE, LIVE VALIDATION PENDING

## Rung 1: Contract Integrity

- `go test ./...`
- `go build ./cmd/twilio-adapter`
- `./twilio-adapter adapter.info`

Status: complete

## Rung 2: Connection Identity

- `adapter.accounts.list`
- `adapter.health`

Pass criteria:

- runtime identity is `connection_id`
- `"default"` is not treated as canonical account identity

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

## Rung 5: GlowBot First-Clinic Proof

- validate record arrival and metric extraction through GlowBot

Pass criteria:

- GlowBot consumes the records without adapter-local identity hacks

Status: pending first clinic
