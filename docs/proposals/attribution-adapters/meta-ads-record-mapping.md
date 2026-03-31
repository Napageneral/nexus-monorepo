# Meta Ads Record Mapping

**Status:** PROPOSAL
**Last Updated:** 2026-03-30
**Related:** [Meta Ads Adapter](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/meta-ads-adapter.md), [AAP-001 Meta Ads Package Parity](/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-adapter-packages-board/completed/AAP-001-meta-ads-package-parity.md), [Adapter Protocol](/Users/tyler/nexus/home/projects/nexus/nex/src/runtime/domains/adapters/protocol.ts), [Records Ledger Schema](/Users/tyler/nexus/home/projects/nexus/nex/src/storage/migrations/records/helpers.ts)

---

## Purpose

This document defines the exact Meta Ads record mapping proposed for the Nex
shared adapter package.

The goal is to preserve provider-native Meta rows in Nex as immutable source
arrivals while still exposing enough normalized structure for downstream
attribution apps.

## Runtime Constraints

The design is constrained by two Nex runtime facts:

1. adapters emit canonical `record.ingest` envelopes, not provider-specific SQL
   tables
2. `records.db` deduplicates on `UNIQUE(platform, record_id)` and does not
   update rows in place

That means Meta records must be mapped so that:

- exact retries deduplicate cleanly
- changed provider rows append as new arrivals
- downstream apps can reconstruct the latest provider truth from immutable
  arrivals

## Upstream API Surface

The target-state Meta adapter uses these Graph API surfaces.

| Family | Endpoint | Required request shape |
|---|---|---|
| health | `/{ad_account_id}` | `fields=id,name,account_status` |
| `campaign_snapshot` | `/{ad_account_id}/campaigns` | `fields=id,name,status,objective,daily_budget,lifetime_budget,start_time,updated_time` |
| `campaign_daily` | `/{ad_account_id}/insights` | `level=campaign`, `time_increment=1`, `fields=campaign_id,campaign_name,impressions,reach,clicks,spend,cpc,cpm,ctr,actions,action_values` |
| `adset_daily` | `/{ad_account_id}/insights` | `level=adset`, `time_increment=1`, `fields=campaign_id,campaign_name,adset_id,adset_name,impressions,reach,clicks,spend,cpc,cpm,ctr,actions,action_values` |
| `ad_daily` | `/{ad_account_id}/insights` | `level=ad`, `time_increment=1`, `fields=campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,impressions,reach,clicks,spend,cpc,cpm,ctr,actions,action_values` |
| `account_hourly` | `/{ad_account_id}/insights` | `level=account`, `breakdowns=hourly_stats_aggregated_by_advertiser_time_zone`, `fields=impressions,reach,clicks,inline_link_clicks,spend,actions,action_values` |

The adapter must preserve the requested graph base URL and graph version used
for each fetch in emitted metadata.

## Normalization Rules

Required normalization before record emission:

1. `ad_account_id` is normalized to `act_<digits>` form.
2. empty strings are treated as absent values.
3. numeric strings are preserved in the source row and may also be surfaced as
   numeric helper fields.
4. `actions`, `action_values`, and `cost_per_action_type` arrays are sorted by
   `action_type`, then by `value`, before revision hashing so provider reordering
   does not create false new arrivals.

## Helper Measure Rules

The adapter preserves raw Meta arrays and also derives the following helper
measures when possible.

| Helper measure | Rule |
|---|---|
| `link_clicks` | sum of `actions` where `action_type = 'link_click'` |
| `landing_page_views` | sum of `actions` where `action_type IN ('landing_page_view', 'omni_landing_page_view')` |
| `purchases` | sum of `actions` where `action_type = 'purchase'` |
| `purchase_value` | sum of `action_values` where `action_type = 'purchase'` |
| `cost_per_purchase` | `spend / purchases` when `purchases > 0` |

The raw arrays remain source truth even when helper measures are present.

## Logical Row Identity

Each emitted record has a stable logical row identity and a revision hash.

Logical row identities:

- `campaign_snapshot`: `{ad_account_id}:{campaign_id}`
- `campaign_daily`: `{ad_account_id}:{date_start}:{campaign_id}`
- `adset_daily`: `{ad_account_id}:{date_start}:{adset_id}`
- `ad_daily`: `{ad_account_id}:{date_start}:{ad_id}`
- `account_hourly`: `{ad_account_id}:{date_start}:{hour_bucket}`

Revision-hash rule:

1. select the normalized provider row fields for the family
2. serialize to canonical JSON with stable key order
3. hash with SHA-256
4. use the first 16 hex characters as `revision_hash`

For `campaign_snapshot`, `updated_time` is also preserved separately, but the
revision hash still comes from the canonical row payload.

## External Record ID Strategy

Each emitted Meta record uses:

`meta-ads:{connection_id}:{family}:{logical_row_id}:{revision_hash}`

This gives the required behavior:

- repeated fetch of an unchanged row emits the same `external_record_id` and
  deduplicates in `records.db`
- a restated provider row emits a new `revision_hash` and appends as a new
  immutable arrival

`connection_id` is required inside `external_record_id` because `records.db`
deduplicates on `(platform, record_id)` and does not include routing fields in
the uniqueness constraint.

## Canonical Routing Mapping

Every Meta record uses the same routing base.

| Routing field | Value |
|---|---|
| `adapter` | `meta-ads-adapter` |
| `platform` | `meta-ads` |
| `connection_id` | runtime connection id |
| `sender_id` | normalized `ad_account_id` |
| `sender_name` | `Meta Ads` |
| `receiver_id` | runtime connection id |
| `space_id` | normalized `ad_account_id` |
| `space_name` | ad account display name when available |
| `container_kind` | `group` |
| `container_id` | family name such as `campaign_daily` |
| `container_name` | human label such as `Campaign Daily` |

Thread mapping by family:

- `campaign_snapshot` and `campaign_daily`
  - `thread_id = {ad_account_id}:{campaign_id}`
  - `thread_name = campaign_name`
- `adset_daily`
  - `thread_id = {ad_account_id}:{adset_id}`
  - `thread_name = adset_name`
- `ad_daily`
  - `thread_id = {ad_account_id}:{ad_id}`
  - `thread_name = ad_name`
- `account_hourly`
  - `thread_id = {ad_account_id}:account_hourly`
  - `thread_name = ad account display name when available`

Required routing metadata:

- `family`
- `grain`
- `ad_account_id`
- `graph_base_url`
- `graph_path`

## Payload Mapping

`payload.content_type` is always `text`.

`payload.content` is a compact summary string for operator searchability.

Examples:

- `campaign_snapshot act_123 campaign=987 status=ACTIVE objective=OUTCOME_SALES`
- `campaign_daily 2026-03-29 campaign=987 spend=412.33 clicks=812 purchases=9`
- `ad_daily 2026-03-29 ad=555 spend=48.22 clicks=79 purchases=1`

Required payload metadata:

- `family`
- `logical_row_id`
- `revision_hash`
- `provider_ids`
- `source_request`
- `row`
- `derived`

`provider_ids` shape:

```json
{
  "ad_account_id": "act_123456789",
  "campaign_id": "987654321",
  "adset_id": "444444444",
  "ad_id": "555555555"
}
```

`source_request` shape:

```json
{
  "graph_base_url": "https://graph.facebook.com/v25.0",
  "path": "/act_123456789/insights",
  "query": {
    "level": "ad",
    "time_increment": "1"
  }
}
```

`row` contains the normalized provider row for the family.
`derived` contains helper measures only.

## Timestamp Rules

Timestamp mapping must be deterministic.

- `campaign_snapshot`
  - use parsed `updated_time`
  - fallback to parsed `start_time`
  - fallback to current time only if neither source field is present
- `campaign_daily`, `adset_daily`, `ad_daily`
  - use `MetricTimestamp(date_start, time.UTC)`
  - this anchors daily rows at UTC noon
- `account_hourly`
  - parse `date_start` plus the start hour of
    `hourly_stats_aggregated_by_advertiser_time_zone`
  - anchor the timestamp at the midpoint of the hour bucket in UTC
  - if hour parsing fails, fallback to `MetricTimestamp(date_start, time.UTC)`

The raw provider date and hour-bucket fields remain preserved in metadata.

## Family-Specific Mapping

### `campaign_snapshot`

- source: `/{ad_account_id}/campaigns`
- preserved row fields:
  - `campaign_id`
  - `campaign_name`
  - `status`
  - `objective`
  - `daily_budget`
  - `lifetime_budget`
  - `start_time`
  - `updated_time`
- no helper measures are required

### `campaign_daily`

- source: `/{ad_account_id}/insights` with `level=campaign`
- preserved row fields:
  - `date_start`
  - `campaign_id`
  - `campaign_name`
  - `impressions`
  - `reach`
  - `clicks`
  - `spend`
  - `cpc`
  - `cpm`
  - `ctr`
  - `actions`
  - `action_values`
- derived fields:
  - `link_clicks`
  - `landing_page_views`
  - `purchases`
  - `purchase_value`
  - `cost_per_purchase`

### `adset_daily`

- source: `/{ad_account_id}/insights` with `level=adset`
- preserved row fields:
  - all `campaign_daily` fields
  - `adset_id`
  - `adset_name`
- derived fields:
  - same helper measures as `campaign_daily`

### `ad_daily`

- source: `/{ad_account_id}/insights` with `level=ad`
- preserved row fields:
  - all `adset_daily` fields
  - `ad_id`
  - `ad_name`
- derived fields:
  - same helper measures as `campaign_daily`

### `account_hourly`

- source: `/{ad_account_id}/insights` with `level=account`
- preserved row fields:
  - `date_start`
  - `hourly_stats_aggregated_by_advertiser_time_zone`
  - `impressions`
  - `reach`
  - `clicks`
  - `inline_link_clicks`
  - `spend`
  - `actions`
  - `action_values`
- derived fields:
  - `landing_page_views`
  - `purchases`
  - `purchase_value`
  - `cost_per_purchase`

## Backfill Semantics

Backfill emits the same record families and payload mapping as monitor sync.

Required behavior:

1. `campaign_snapshot` is fetched once per backfill run
2. daily families fetch from requested `since` through current date
3. hourly family fetches from requested `since` through current date
4. pagination continues until the requested window is exhausted
5. every emitted row uses the exact `external_record_id` strategy above

## Monitor Semantics

The Meta monitor must not rely on a zero-replay polling cursor.

Target-state monitor behavior:

- `campaign_snapshot`
  - refresh every poll cycle
- daily families
  - replay the trailing 7 days on every cycle
- hourly family
  - replay the trailing 48 hours on every cycle

Because `external_record_id` includes `revision_hash`, replay is safe:

- unchanged rows deduplicate
- changed rows append

## Example Record

```json
{
  "operation": "record.ingest",
  "routing": {
    "adapter": "meta-ads-adapter",
    "platform": "meta-ads",
    "connection_id": "meta-primary",
    "sender_id": "act_123456789",
    "sender_name": "Meta Ads",
    "receiver_id": "meta-primary",
    "space_id": "act_123456789",
    "container_kind": "group",
    "container_id": "campaign_daily",
    "container_name": "Campaign Daily",
    "thread_id": "act_123456789:987654321",
    "thread_name": "MoonSleep Core",
    "metadata": {
      "family": "campaign_daily",
      "grain": "date+campaign",
      "ad_account_id": "act_123456789",
      "graph_base_url": "https://graph.facebook.com/v25.0",
      "graph_path": "/act_123456789/insights"
    }
  },
  "payload": {
    "external_record_id": "meta-ads:meta-primary:campaign_daily:act_123456789:2026-03-29:987654321:8d9a3d9f8f4e4a11",
    "timestamp": 1774785600000,
    "content": "campaign_daily 2026-03-29 campaign=987654321 spend=412.33 clicks=812 purchases=9",
    "content_type": "text",
    "metadata": {
      "family": "campaign_daily",
      "logical_row_id": "act_123456789:2026-03-29:987654321",
      "revision_hash": "8d9a3d9f8f4e4a11",
      "provider_ids": {
        "ad_account_id": "act_123456789",
        "campaign_id": "987654321"
      },
      "source_request": {
        "graph_base_url": "https://graph.facebook.com/v25.0",
        "path": "/act_123456789/insights",
        "query": {
          "level": "campaign",
          "time_increment": "1"
        }
      },
      "row": {
        "date_start": "2026-03-29",
        "campaign_id": "987654321",
        "campaign_name": "MoonSleep Core",
        "impressions": "18234",
        "reach": "14022",
        "clicks": "812",
        "spend": "412.33",
        "cpc": "0.51",
        "cpm": "22.61",
        "ctr": "4.45",
        "actions": [
          { "action_type": "landing_page_view", "value": "523" },
          { "action_type": "purchase", "value": "9" }
        ],
        "action_values": [
          { "action_type": "purchase", "value": "891.00" }
        ]
      },
      "derived": {
        "landing_page_views": 523,
        "purchases": 9,
        "purchase_value": 891,
        "cost_per_purchase": 45.8144444444
      }
    }
  }
}
```

## Implementation Consequences

This proposal changes the current Meta adapter in three material ways:

1. one provider row becomes one Nex record instead of many metric-only records
2. record identity is revision-aware so immutable arrivals can capture
   restatements
3. monitor replay becomes safe and intentional rather than best-effort
