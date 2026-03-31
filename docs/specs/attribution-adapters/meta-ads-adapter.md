# Meta Ads Adapter

**Status:** CANONICAL
**Last Updated:** 2026-03-30
**Related:** [Attribution Intelligence Layer](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-layer.md), [Attribution Intelligence Taxonomy](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-taxonomy.md), [Adapter Spec: Meta Ads](/Users/tyler/nexus/home/projects/nexus/packages/adapters/meta-ads/docs/specs/ADAPTER_SPEC_META_ADS.md), [Attribution Adapter Packages Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-adapter-packages-board/README.md)

---

## Purpose

This document defines the target-state Meta Ads adapter surface required for
shared attribution products in Nex.

The adapter provides durable Meta paid-media facts with provider-native
identity preserved.

It does not own:

- browser-side click capture
- website attribution decisions
- checkout or backend outcome reconciliation
- product-specific dashboards

Those behaviors belong to the website input package family and the attribution
intelligence app.

## Customer Experience

The intended operator experience is:

1. create one Meta Ads connection through Nex
2. complete shared Meta credential setup through the runtime connection model
3. confirm account health and visible ad-account scope
4. backfill historical Meta Ads hierarchy and performance facts
5. enable monitoring so the connection stays current
6. let downstream apps consume one shared Meta Ads contract without
   product-specific credential hacks

The operator should not need to understand:

- hardcoded default accounts
- GlowBot or MoonSleep-specific URLs
- provider pagination behavior
- provider action arrays before the data is usable downstream

## Connection Model

One Nex Meta Ads connection represents one durable Meta credential binding.

That connection may expose one or more ad accounts.

The runtime-supplied `connection_id` is the sole operational identity surface.
Meta provider identifiers remain preserved as provider metadata.

Required preserved identifiers include:

- `connection_id`
- `ad_account_id`
- `campaign_id`
- `adset_id`
- `ad_id`

## Canonical Responsibilities

The adapter must:

1. validate Meta connection health and accessible ad-account scope
2. backfill provider-native Meta Ads hierarchy and performance rows
3. keep those rows fresh through monitor-based sync
4. preserve provider-native ids and row fidelity
5. emit canonical Nex `record.ingest` envelopes that downstream jobs can
   replay without lossy per-metric reconstruction

## Source Families

The target-state adapter emits these provider row families.

| Family | Grain | Required preserved fields |
|---|---|---|
| `campaign_snapshot` | one row per campaign | `ad_account_id`, `campaign_id`, `campaign_name`, `status`, `objective`, `daily_budget`, `lifetime_budget`, `start_time`, `updated_time` |
| `campaign_daily` | one row per date and campaign | `date_start`, `ad_account_id`, `campaign_id`, `campaign_name`, `impressions`, `reach`, `clicks`, `spend`, `cpc`, `cpm`, `ctr`, `actions`, `action_values` |
| `adset_daily` | one row per date and ad set | `date_start`, `campaign_id`, `campaign_name`, `adset_id`, `adset_name`, `impressions`, `reach`, `clicks`, `spend`, `cpc`, `cpm`, `ctr`, `actions`, `action_values` |
| `ad_daily` | one row per date and ad | `date_start`, `campaign_id`, `campaign_name`, `adset_id`, `adset_name`, `ad_id`, `ad_name`, `impressions`, `reach`, `clicks`, `spend`, `cpc`, `cpm`, `ctr`, `actions`, `action_values` |
| `account_hourly` | one row per date and advertiser-time-zone hour bucket | `date_start`, `hourly_stats_aggregated_by_advertiser_time_zone`, `impressions`, `reach`, `clicks`, `inline_link_clicks`, `spend`, `actions`, `action_values` |

The adapter must also surface normalized helper measures when the provider row
contains enough evidence to derive them safely.

Examples include:

- `landing_page_views`
- `purchases`
- `purchase_value`

The raw `actions` and `action_values` payloads remain part of the preserved
provider row even when helper measures are emitted.

## Backfill Model

The adapter supports two backfill modes:

- full backfill from a configured floor date
- incremental backfill from the most recent stored row per family plus a
  replay window for restated provider data

Required backfill behavior:

1. daily and hourly families are independently resumable
2. pagination continues until the requested window is exhausted
3. incremental replay can reread recent dates to absorb Meta restatements
4. backfill emits the same row families and payload structure as monitor sync

## Monitor Model

The adapter monitor keeps Meta Ads facts current by polling on a durable
schedule.

Target-state behavior:

- default poll interval is six hours
- recent dates are replayed on each cycle to absorb restated provider rows
- monitor emits the same row families as backfill
- repeated monitor runs are idempotent at the provider row level

## Emitted Record Model

The adapter emits canonical `record.ingest` envelopes.

Each emitted record represents one provider row, not one exploded metric.

Each record must preserve:

- `connection_id`
- provider surface family
- granularity
- provider ids for the row grain
- the row date or time window
- the structured provider fields for that row

The adapter may still emit helper metric records for compatibility, but those
helper records are secondary. The row-level provider contract is the required
source of truth for shared attribution products.

## Exclusions

This adapter does not own:

- Meta browser pixel install
- Meta Conversions API browser or server event capture
- click-id persistence on customer websites
- attribution rules or channel decisions
- campaign naming governance

## Validation Expectations

Cleanroom validation for this adapter must prove:

1. credential setup succeeds through the shared Nex connection surface
2. `adapter.health` confirms account visibility and ad-account scope
3. full backfill emits all required row families
4. incremental backfill resumes correctly from stored dates
5. monitor emits the same contract as backfill
6. sampled emitted rows match Meta upstream values for ids, dates, spend,
   impressions, clicks, and selected action-derived measures

## Done Definition

The Meta Ads adapter is complete for attribution products when:

1. the shared package emits the full target-state row families
2. provider-native ids and action payloads are preserved without lossy
   per-metric flattening
3. setup, health, backfill, and monitor all work against real credentials
4. the contract is reusable by attribution apps without MoonSleep-specific
   assumptions
