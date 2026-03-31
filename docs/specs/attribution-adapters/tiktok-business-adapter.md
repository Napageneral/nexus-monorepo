# TikTok Business Adapter

**Status:** CANONICAL
**Last Updated:** 2026-03-30
**Related:** [Attribution Intelligence Layer](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-layer.md), [Attribution Intelligence Taxonomy](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-taxonomy.md), [TikTok Adapter Packages Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/tiktok-adapter-packages-board/README.md)

---

## Purpose

This document defines the target-state shared `tiktok-business` adapter
surface for Nex.

The adapter provides TikTok paid-media hierarchy and performance facts with
provider-native identifiers preserved.

This spec covers the TikTok Business and Marketing API surface only.

It does not include:

- TikTok display or organic profile surfaces
- TikTok video library outside the Business API hierarchy
- website click capture
- TikTok Pixel or Events API
- attribution decisions

## MoonSleep Parity Baseline

MoonSleep currently uses the TikTok Business surface for:

- OAuth token exchange
- advertiser discovery
- campaign catalog sync
- ad group catalog sync
- ad catalog sync
- integrated report pulls for daily and hourly performance

Primary MoonSleep references:

- [sync.py](/Users/tyler/nexus/home/projects/moonsleep-v1/analytics/sync.py#L638)
- [sync.py](/Users/tyler/nexus/home/projects/moonsleep-v1/analytics/sync.py#L1422)
- [index.ts](/Users/tyler/nexus/home/projects/moonsleep-v1/workers/meta-capi/src/index.ts#L802)

## Customer Experience

The intended operator flow is:

1. create one TikTok Business connection through Nex
2. complete TikTok Business OAuth in Nex
3. enumerate visible advertiser ids
4. bind one advertiser scope to the connection
5. confirm health against that advertiser
6. run backfill
7. enable monitor sync for freshness

## Provider Surface

The parity target uses these TikTok Business endpoints:

- `POST https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/`
- `GET https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/`
- `GET https://business-api.tiktok.com/open_api/v1.3/campaign/get/`
- `GET https://business-api.tiktok.com/open_api/v1.3/adgroup/get/`
- `GET https://business-api.tiktok.com/open_api/v1.3/ad/get/`
- `GET https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/`

## Connection And Binding Model

One Nex `tiktok-business` connection represents:

- one durable TikTok Business OAuth credential set
- one selected `advertiser_id`

The setup flow may reveal multiple advertisers, but the connection itself
should bind one advertiser for deterministic backfill and monitor behavior.

Required preserved identifiers include:

- `connection_id`
- `advertiser_id`
- `campaign_id`
- `adgroup_id`
- `ad_id`

## Canonical Responsibilities

The adapter must:

1. validate credential health and advertiser visibility
2. discover and bind advertiser scope during setup
3. backfill provider-native hierarchy and performance rows
4. keep those rows fresh through monitor-based sync
5. preserve provider row fidelity and ids
6. emit canonical `record.ingest` envelopes for replay-safe downstream use

## Source Families

Each emitted record represents one provider row, not one exploded metric.

| Family | Grain | Required preserved fields |
|---|---|---|
| `campaign_snapshot` | one row per campaign | `advertiser_id`, `campaign_id`, `campaign_name`, provider campaign metadata returned by TikTok |
| `adgroup_snapshot` | one row per ad group | `advertiser_id`, `campaign_id`, `adgroup_id`, `adgroup_name`, provider ad-group metadata returned by TikTok |
| `ad_snapshot` | one row per ad | `advertiser_id`, `campaign_id`, `adgroup_id`, `ad_id`, `ad_name`, provider ad metadata returned by TikTok |
| `campaign_daily` | one row per day and campaign | `stat_time_day`, `advertiser_id`, `campaign_id`, `spend`, `impressions`, `clicks`, `ctr`, `cpc`, `cpm`, `complete_payment`, `complete_payment_roas`, `value_per_complete_payment` |
| `adgroup_daily` | one row per day and ad group | `stat_time_day`, `advertiser_id`, `adgroup_id`, `spend`, `impressions`, `clicks`, `ctr`, `cpc`, `cpm`, `complete_payment`, `complete_payment_roas`, `value_per_complete_payment` |
| `ad_daily` | one row per day and ad | `stat_time_day`, `advertiser_id`, `ad_id`, `spend`, `impressions`, `clicks`, `ctr`, `cpc`, `cpm`, `complete_payment`, `complete_payment_roas`, `value_per_complete_payment` |
| `advertiser_hourly` | one row per hour bucket and advertiser | `stat_time_hour`, `advertiser_id`, `spend`, `impressions`, `clicks`, `complete_payment`, `complete_payment_roas`, `value_per_complete_payment` |

Normalized helper measures such as `purchases` and `purchase_value` may be
surfaced when they are direct rewrites of TikTok provider fields.

## Report Mapping Rules

MoonSleep's current parity target uses:

- daily report dimensions:
  - `["stat_time_day", "campaign_id"]`
  - `["stat_time_day", "adgroup_id"]`
  - `["stat_time_day", "ad_id"]`
- hourly report dimensions:
  - `["stat_time_hour"]`
- report metrics:
  - `spend`
  - `impressions`
  - `clicks`
  - `ctr`
  - `cpc`
  - `cpm`
  - `complete_payment`
  - `complete_payment_roas`
  - `value_per_complete_payment`

The adapter should preserve the raw returned row and also flatten
`dimensions` plus `metrics` into one structured provider row for ingest.

## Backfill Model

Required parity behavior:

1. hierarchy snapshot families are independently resumable
2. daily report requests are chunked into windows of at most 30 days
3. hourly report requests are chunked into windows of at most one day
4. paginated requests continue until `total_page` is exhausted
5. backfill emits the same row families and payload structure as monitor sync

## Monitor Model

The monitor keeps the advertiser scope current by polling on a durable
schedule.

Target-state behavior:

- hierarchy families replay on a recent cadence so renamed or paused entities
  are refreshed
- daily families replay recent dates to absorb late provider restatements
- hourly families replay recent hours to absorb restated provider data
- monitor emits the same contract as backfill

## Emitted Record Model

Each `record.ingest` event must preserve:

- `connection_id`
- provider family
- row grain
- provider ids for the row
- the row date or hour bucket
- the structured provider fields for that row

The adapter should use revision-aware record identity so unchanged retries
dedupe while restated provider rows append as new immutable arrivals.

## Exclusions

This adapter does not own:

- TikTok display or creator profile surfaces
- TikTok comment moderation
- TikTok creative library workflows
- TikTok Pixel or Events API delivery
- website click-id persistence
- attribution logic

## Validation Expectations

Cleanroom validation for this adapter must prove:

1. credential setup succeeds through Nex
2. `adapter.health` confirms advertiser visibility
3. backfill emits the required hierarchy and performance row families
4. 30-day daily chunking and 1-day hourly chunking complete without data loss
5. monitor emits the same contract as backfill
6. sampled rows match TikTok upstream values for ids, windows, spend,
   impressions, clicks, and payment metrics

## Done Definition

The shared `tiktok-business` package is complete when:

1. the package exists and is installable through Nex
2. setup, health, backfill, and monitor work against one bound advertiser
3. hierarchy and performance row families are emitted at the required grains
4. provider-native ids and performance rows are preserved without lossy
   flattening
5. cleanroom validation with real credentials proves parity against MoonSleep's
   active advertiser
