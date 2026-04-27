# Adapter Spec: Google Ads

This package owns the Google Ads acquisition ingest surface for Nex.

It now also exposes an initial provider-native read slice through:

- `google-ads.customers.accessible.list`
- `google-ads.customers.get`
- `google-ads.reporting.campaign_daily.list`

The target contract is row-shaped and preserves provider-native Google Ads ids
and measures for downstream attribution products.

## Row Families

The package emits one immutable `record.ingest` arrival per Google Ads provider
row for these families:

- `account_access_snapshot`
- `campaign_daily`
- `ad_group_daily`
- `ad_daily`
- `campaign_hourly`

Each record preserves:

- Nex `connection_id`
- Google `customer_id`
- campaign, ad group, and ad ids when present for the family grain
- source request metadata
- normalized provider row data in `payload.metadata.row`
- safe helper measures in `payload.metadata.derived`

## Sync Model

- `records.backfill` and `adapter.monitor.start` emit the same row contract
- daily families replay recent dates safely
- hourly campaign rows replay the recent hourly window safely
- revision-aware `external_record_id` preserves immutable arrivals while
  deduplicating unchanged retries
