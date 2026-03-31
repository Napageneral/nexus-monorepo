# MAP-002 Record Identity And Payload Mapping

## Goal

Implement the revision-aware Meta record identity and canonical routing or
payload mapping defined in the Meta record-mapping proposal.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/proposals/attribution-adapters/meta-ads-record-mapping.md`

## Current Gap

- `external_record_id` is metric-shaped rather than row-shaped
- unchanged retries and changed restatements are not modeled explicitly
- routing and payload metadata do not preserve enough row-level structure for
  replayable attribution use

## Acceptance

1. each emitted Meta row uses a logical row id plus revision-hash strategy
2. unchanged retries deduplicate in `records.db`
3. changed provider rows append as new immutable arrivals
4. routing and payload metadata preserve provider ids, source request context,
   raw normalized row data, and derived helper measures
