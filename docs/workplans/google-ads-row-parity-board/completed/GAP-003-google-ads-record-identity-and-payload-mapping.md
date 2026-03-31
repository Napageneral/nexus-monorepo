# GAP-003 Google Ads Record Identity And Payload Mapping

## Goal

Implement the revision-aware Google Ads record identity and canonical routing
or payload mapping needed for immutable-arrival ingest.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/google-ads-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-intelligence-board/in-progress/AIL-002-moonsleep-parity-matrix-for-core-attribution.md`

## Current Gap

- `external_record_id` is currently metric-shaped rather than row-shaped
- unchanged retries and changed provider restatements are not modeled
  explicitly
- routing and payload metadata do not preserve enough Google Ads row-level
  structure for replayable attribution use

## Acceptance

1. each emitted Google Ads row uses a logical-row identity plus revision-hash
   strategy
2. unchanged retries deduplicate in `records.db`
3. changed provider rows append as new immutable arrivals
4. routing and payload metadata preserve provider ids, request context, raw
   normalized row data, and safe derived helper measures such as cost,
   `conversions_value`, and landing-page views when available
