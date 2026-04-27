# Google Ads Adapter

**Status:** CANONICAL
**Last Updated:** 2026-03-30
**Related:** [Attribution Intelligence Layer](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-layer.md), [Attribution Intelligence Taxonomy](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-taxonomy.md), [Acquisition Adapter Package Alignment](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/acquisition-adapter-package-alignment.md), [Acquisition Adapter Alignment Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/acquisition-adapter-alignment-board/README.md), [Attribution Adapter Packages Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-adapter-packages-board/README.md)

---

## Purpose

This document defines the target-state Google Ads adapter surface required by
shared attribution products in Nex.

This spec is intentionally limited to Google Ads acquisition facts.

It does not include:

- Google Business Profile
- first-party click-id capture on customer websites
- outbound conversion uploads
- attribution decisions

Those surfaces may exist elsewhere in Nex, but they are not part of the
adapter contract the attribution intelligence app depends on.

## Customer Experience

The intended operator experience is:

1. create one Google Ads connection through Nex
2. complete shared credential setup through the runtime connection model
3. confirm visible customer-account scope
4. backfill historical Google Ads facts
5. enable monitor sync for freshness
6. let downstream apps consume one shared Google Ads contract without carrying
   unrelated Google surfaces

## Connection Model

One Nex Google Ads connection represents one durable Google credential binding.

That connection may expose one or more Google Ads customer accounts.

The runtime `connection_id` is the sole operational identity surface.
Google Ads provider identifiers remain preserved as metadata.

Required preserved identifiers include:

- `connection_id`
- `customer_id`
- `campaign_id`
- `ad_group_id`
- `ad_id`

## Canonical Responsibilities

The adapter must:

1. validate credential health and visible customer-account scope
2. expose a provider-native read slice for customer discovery and customer or
   campaign inspection
3. backfill Google Ads performance rows at the required grains
4. keep those rows fresh through monitor-based sync
5. preserve provider-native ids and measures without forcing downstream apps to
   reconstruct them from exploded metric-only events
6. keep non-Ads Google surfaces outside the attribution app contract

The first public provider-native method slice is:

- `google-ads.customers.accessible.list`
- `google-ads.customers.get`
- `google-ads.reporting.campaign_daily.list`

## Source Families

The target-state adapter emits these provider row families.

| Family | Grain | Required preserved fields |
|---|---|---|
| `account_access_snapshot` | one row per visible customer account | `customer_id`, `account_name`, provider account-status fields returned during account discovery |
| `campaign_daily` | one row per date and campaign | `date`, `customer_id`, `campaign_id`, `campaign_name`, `impressions`, `clicks`, `cost_micros`, `cost`, `conversions` |
| `ad_group_daily` | one row per date and ad group | `date`, `customer_id`, `campaign_id`, `campaign_name`, `ad_group_id`, `ad_group_name`, `impressions`, `clicks`, `cost_micros`, `cost`, `conversions` |
| `ad_daily` | one row per date and ad | `date`, `customer_id`, `campaign_id`, `campaign_name`, `ad_group_id`, `ad_group_name`, `ad_id`, `ad_name`, `impressions`, `clicks`, `cost_micros`, `cost`, `conversions` |

The adapter should also surface helper measures when the provider row contains
enough evidence to derive them safely.

Examples include:

- `ctr`
- `average_cpc`
- `cost_per_conversion`
- `conversions_value`
- `landing_page_views` when available from the selected Google Ads query shape

## Backfill Model

The adapter supports:

- full backfill from a configured floor date
- incremental backfill from the most recent stored day per family plus a
  replay window for restated provider data

Required behavior:

1. account discovery is available before or alongside performance sync
2. campaign, ad-group, and ad families are independently resumable
3. incremental replay can reread recent days to absorb provider restatements
4. backfill emits the same row families as monitor sync

## Monitor Model

The adapter monitor keeps Google Ads facts current by polling on a durable
schedule.

Target-state behavior:

- recent dates are replayed on each cycle
- monitor emits the same row families and payload structure as backfill
- unrelated Google surfaces do not block the Google Ads contract

## Emitted Record Model

The adapter emits canonical `record.ingest` envelopes.

Each emitted record represents one Google Ads provider row, not one exploded
metric only.

Each record must preserve:

- `connection_id`
- provider surface family
- granularity
- provider ids for the row grain
- the row date
- the structured provider fields for that row

## Boundary Rules

The Google Ads adapter contract for attribution products does not own:

- `gclid`, `gbraid`, `wbraid`, or `msclkid` capture on customer websites
- Google Business Profile reviews or local-business metrics
- outbound Google Ads conversion-upload jobs

Website click-id capture belongs to the website input package family.
Outbound conversion upload belongs to app-owned or product-owned job logic.

## Validation Expectations

Cleanroom validation for this adapter must prove:

1. credential setup succeeds through Nex
2. `adapter.health` confirms visible Google Ads accounts
3. backfill emits the required daily row families
4. monitor emits the same contract as backfill
5. sampled rows match Google Ads upstream values for ids, dates, impressions,
   clicks, cost, and conversions
6. the attribution app can depend on the Ads surface without depending on
   Business Profile behavior

## Done Definition

The Google Ads adapter surface is complete for attribution products when:

1. the shared contract is Google Ads-specific and cleanly reusable
2. provider-native ids and measures are preserved without lossy flattening
3. setup, health, backfill, and monitor all work against real credentials
4. non-Ads Google surfaces are not required by attribution apps
