# Reliability Incidents Adapter Validation

Validated 2026-08-10 against a disposable Nex runtime built from
`origin/main@011ef4af211904d4f49ae439d6bfa4e87cb2cc12`.

## Package contract

- tests, TypeScript checking, build, package validation, and release packaging pass
- `adapter.info` exposes serve, health, and connection operations
- no remote-mutation method is exposed

## Ingest contract

- detected and recovered transitions produce two records in one source channel and one incident thread
- stable event replay produces no duplicate record
- corrected event content produces a record revision with the same external identity
- event identity drift fails closed
- batch validation fails before any record emission

## Search contract

- detection title/summary/components and recovery remediation/validation are searchable
- structured incident metadata remains retrievable
- one incident thread routes every lifecycle record to the same stable thread id
- same-event corrected bytes are retained as a second durable record revision
- independently searchable corrections use a new `updated` lifecycle event and event id

## Disposable cleanroom result

- package version: `0.1.0`
- release archive SHA-256 is emitted beside the artifact by `scripts/package-release.sh`
- package validation: pass, zero warnings
- unit tests: 10 passed, zero failed/skipped
- Nex records: 2 canonical event identities
- Nex revisions: detected=2, recovered=1
- exact replay: suppressed without a new record or revision
- channel route: `incidents:moonsleep-cleanroom`
- incident thread: `inc-checkout-001`
- runtime health: healthy, no foreground queue or backpressure

The first cleanroom exposed and prevented an inbound-integrity defect: the
adapter had prefixed the receiver id instead of using the exact configured Nex
connection id. The corrected package binds `receiver_id` to the connection and
the current-runtime proof ingested without an integrity violation.

## Safety contract

- another source cannot write through the bound connection
- credential-like metadata keys are rejected
- oversized, malformed, unsupported, or deeply nested payloads fail closed
- adapter failure does not erase the source-owned event

## MoonSleep shadow proof

- every email open/recovery maps to one incident transition
- repeated reminder emails do not create new incidents
- existing checkout, quota, timer, API, Nex, and host health behavior is unchanged
- the seven-day imported timeline reconciles against reviewed Gmail and journal evidence
