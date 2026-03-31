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
- backfill shared TikTok hierarchy and performance rows
- run monitor for freshness

## Main Surfaces

- `adapter.info`
- `adapter.connections.list`
- `adapter.health`

Backfill and monitor land in follow-on package tickets.

## Related Docs

- `adapter.nexus.json`
- `README.md`
- `docs/specs/ADAPTER_SPEC_TIKTOK_BUSINESS.md`
