---
name: tiktok-business
description: Use the TikTok Business adapter for shared TikTok advertiser access, hierarchy ingest, and report sync through canonical Nex connections.
---

# Nexus TikTok Business Adapter

Use the shared TikTok Business adapter when Nex should own TikTok paid-media
access through a durable shared connection.

## When To Use It

- connect TikTok Business once through Nex
- bind one advertiser to one Nex connection
- use provider-native read methods for hierarchy and daily/hourly reporting
- backfill shared TikTok hierarchy and performance rows
- run monitor for freshness

## Main Surfaces

- `adapter.info`
- `adapter.connections.list`
- `adapter.health`
- `tiktok-business.campaigns.list`
- `tiktok-business.adgroups.list`
- `tiktok-business.ads.list`
- `tiktok-business.reports.campaign_daily.list`
- `tiktok-business.reports.adgroup_daily.list`
- `tiktok-business.reports.ad_daily.list`
- `tiktok-business.reports.advertiser_hourly.list`

Backfill, monitor, and the first-wave public method surface are implemented in
this package. Use the package manifest and cleanroom proof for the authoritative
contract state.

## Related Docs

- `adapter.nexus.json`
- `README.md`
- `docs/specs/ADAPTER_SPEC_TIKTOK_BUSINESS.md`
