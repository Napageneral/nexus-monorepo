# Google Business Profile Adapter

**Status:** CANONICAL
**Last Updated:** 2026-03-31
**Related:** [Adapter Spec: Google](/Users/tyler/nexus/home/projects/nexus/packages/adapters/google/docs/specs/ADAPTER_SPEC_GOOGLE.md)

---

## Purpose

This document defines the target-state shared `google-business-profile`
adapter surface for Nex.

This adapter is intentionally separate from Google Ads.

It owns Google Business Profile account, location, performance, and review
ingest. It does not own Google Ads, website click capture, or attribution
logic.

## Customer Experience

The intended operator experience is:

1. create one Google Business Profile connection through Nex
2. complete OAuth credential setup for a Google account that has GBP API
   access and business/profile permissions
3. confirm visible account and location scope
4. backfill historical location snapshots, performance, and reviews
5. enable monitor sync for freshness
6. let downstream products consume one shared GBP contract without carrying
   Google-specific API details

## Provider Surface

The adapter should use the official Google Business Profile APIs rather than
just Google Places snapshots.

Primary provider surfaces:

- Account Management API for visible account scope
- Business Information API for location inventory and location profile fields
- Business Profile Performance API for daily insights and monthly search
  keyword impressions
- Google My Business Reviews API for review snapshots

Required OAuth scope:

- `https://www.googleapis.com/auth/business.manage`

Important access constraint:

- GBP APIs are not open to the public and require approved Google Business
  Profile API access on the Google Cloud project

## Connection Model

One Nex `google-business-profile` connection represents one durable Google
OAuth credential binding.

That connection may expose:

- one or more Business Profile accounts
- one or more locations across those accounts

The runtime `connection_id` is the sole operational identity surface.
Provider account ids, location ids, and review ids remain preserved as
metadata.

Optional narrowing fields may be supported for operational control:

- `account_id`
- `location_id`

## Canonical Responsibilities

The adapter must:

1. validate credential health and visible account scope
2. discover accessible accounts
3. discover accessible locations
4. backfill account, location, performance, and review rows
5. keep those rows fresh through replay-safe monitor sync
6. preserve provider-native ids and source payloads without flattening the
   surface into lossy metric fragments

## Source Families

The target-state adapter emits these provider row families.

| Family | Grain | Required preserved fields |
|---|---|---|
| `account_snapshot` | one row per visible GBP account | `account_name`, `account_id`, `account_type`, role or account metadata returned by Account Management API |
| `location_snapshot` | one row per location | `account_id`, `location_name`, `location_id`, `title`, `store_code`, `website_uri`, `phone_numbers`, `categories`, `address`, `latlng`, lifecycle/status metadata |
| `location_performance_daily` | one row per location and date | `location_name`, `location_id`, `date`, requested daily metrics and values such as impressions, website clicks, call clicks, direction requests, bookings, food orders |
| `review_snapshot` | one row per review | `account_id`, `location_name`, `location_id`, `review_id`, `star_rating`, `comment`, `create_time`, `update_time`, reviewer metadata, reply metadata |
| `search_keyword_monthly` | one row per location, month, and query | `location_name`, `location_id`, `year`, `month`, `search_keyword`, `impressions_count` |

The first implementation may defer `search_keyword_monthly` if the package
needs to land the core account, location, performance, and review surfaces
first, but the canonical contract should reserve that family now.

## Backfill Model

The adapter supports:

- full backfill from a configured floor date
- incremental replay for recent days and recent review/location changes

Required behavior:

1. account and location discovery run before dependent review or performance
   pulls
2. account and location snapshot families are replay-safe and emit the same
   contract during backfill and monitor
3. performance daily rows are independently resumable and reread recent days
   to absorb provider restatements
4. review snapshots reread a recent window or full recent pages so reply/edit
   changes append safely

## Monitor Model

The adapter monitor keeps GBP facts current by polling on a durable schedule.

Target-state behavior:

- account and location snapshots are replayed on each cycle
- daily performance rows replay a recent date window
- reviews replay recent pages or a recent change window
- backfill and monitor emit the same row families and payload shape

## Emitted Record Model

The adapter emits canonical `record.ingest` envelopes.

Each emitted record represents one GBP provider row, not one exploded metric.

Each record must preserve:

- `connection_id`
- provider surface family
- the structured provider row for that family
- provider ids for the row grain
- raw provider payload
- source request metadata

## Boundary Rules

The Google Business Profile adapter does not own:

- Google Ads acquisition facts
- website click-id capture
- outbound review replies or profile mutation workflows
- attribution logic or business-intelligence rollups

Those surfaces may exist elsewhere in Nex, but they are not part of the
shared GBP ingest contract.

## Validation Expectations

Cleanroom validation for this adapter should prove:

1. credential setup succeeds through Nex
2. `adapter.health` confirms visible GBP accounts
3. backfill emits `account_snapshot`, `location_snapshot`,
   `location_performance_daily`, and `review_snapshot`
4. monitor emits the same row contract as backfill
5. sampled rows match GBP upstream values for ids, location metadata,
   performance values, and review details
6. no secrets are written into active docs or committed artifacts

## Done Definition

The Google Business Profile adapter is complete when:

1. the shared contract is GBP-specific and separate from Google Ads
2. setup, health, backfill, and monitor work against real credentials
3. provider-native ids and source payloads are preserved without lossy metric
   flattening
4. downstream products can depend on local-business profile data without
   depending on the mixed legacy `google` package
