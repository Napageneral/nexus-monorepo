# Adapter Spec: Google Business Profile

This package owns the Google Business Profile ingest surface for Nex.

The target contract is row-shaped and preserves provider-native Google Business
Profile identifiers and payloads for downstream product use.

## Row Families

The package emits one immutable `record.ingest` arrival per Google Business
Profile provider row for these families:

- `account_snapshot`
- `location_snapshot`
- `location_performance_daily`
- `review_snapshot`

Each record preserves:

- Nex `connection_id`
- Google Business Profile provider ids for the family grain
- source request metadata
- normalized provider row data in `payload.metadata.row`
- raw provider payload in `payload.metadata.raw_provider_payload`

## Sync Model

- `records.backfill` and `adapter.monitor.start` emit the same row contract
- account and location snapshots replay safely
- performance daily rows replay a recent date window safely
- review snapshots replay safely without changing the emitted contract
- revision-aware `external_record_id` preserves immutable arrivals while
  deduplicating unchanged retries
