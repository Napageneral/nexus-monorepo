# Reliability Incidents Adapter

**Status:** DRAFT CANONICAL  
**Last Updated:** 2026-08-10

## Purpose

The adapter provides a portable evidence boundary between operational health detectors and Nex records. It preserves incident lifecycle truth without making Nex the only durable copy and without granting the adapter remediation authority.

## Ownership boundary

The source system owns:

- deterministic detection
- incident correlation and stable incident/event identities
- append-only source persistence
- source timestamps and evidence receipts
- remediation authority and validation

The adapter owns:

- source-contract validation
- connection/source binding
- exact-replay safety (store-side identity dedupe; no adapter ledger since 0.1.2)
- correction-to-record-revision behavior
- canonical record routing and searchable content
- freshness and connection health

Nex owns durable records, revisions, channel/thread identity, indexing, search, downstream events, jobs, and approval-gated orchestration.

## Record model

- platform: `reliability-incidents`
- space: `source_id`
- channel container: `incidents:<source_id>`
- thread: `incident_id`
- external record id: `<source_id>:<event_id>`
- sender: `detector:<detector_id>`
- timestamp: source `occurred_at`

Every lifecycle transition is independently searchable and audit-preserving. Email delivery, acknowledgements, diagnosis, remediation, and recovery are transitions or evidence attached to the same incident thread, not separate incidents.

## Idempotency and corrections

An exact replay of the same source event is emitted again and absorbed by the runtime's immutable Record store, whose identity covers the payload digest (a no-op replay, one receipt). Reusing an event id with changed content emits the same external record id so Nex retains a record revision. Since 0.1.2 the adapter keeps no state of its own (the 0.1.x SQLite ledger under the adapter state directory is gone), so an event id reused for another incident or source is no longer rejected adapter-side: the producer's outbox owns event-id uniqueness.

Record revisions preserve corrected source bytes, but an operational correction that must appear independently in full-text search should normally be published as a new `updated` transition with a new event id. This keeps the incident timeline append-only and makes both the original observation and the correction directly searchable.

## Safety

The adapter rejects oversized payloads, unsupported states, source mismatch, identity drift, and credential-like metadata keys. It exposes no external mutation methods. Model diagnoses may be recorded as attributed evidence, but cannot replace detector or provider truth.

## Availability boundary

The adapter being unavailable must not prevent source detectors from recording incidents. Producers therefore persist the source transition before attempting Nex delivery and retry until an adapter receipt is available.
