# TikTok Display Adapter

**Status:** CANONICAL
**Last Updated:** 2026-03-30
**Related:** [Attribution Intelligence Layer](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-layer.md), [TikTok Adapter Packages Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/tiktok-adapter-packages-board/README.md)

---

## Purpose

This document defines the target-state shared `tiktok-display` adapter
surface for Nex.

The adapter provides TikTok profile and recent video inventory data from the
TikTok Display API with provider-native identifiers preserved.

This adapter is separate from the paid-media business adapter on purpose.

It does not include:

- TikTok Business or Marketing API reporting
- TikTok ads hierarchy or spend metrics
- TikTok Pixel or Events API
- comment moderation
- creative review workflows
- attribution logic

## MoonSleep Parity Baseline

MoonSleep currently uses the TikTok Display surface for:

- display OAuth token exchange
- profile lookup
- recent video enumeration

Primary MoonSleep references:

- [sync.py](/Users/tyler/nexus/home/projects/moonsleep-v1/analytics/sync.py#L688)
- [sync.py](/Users/tyler/nexus/home/projects/moonsleep-v1/analytics/sync.py#L1480)
- [index.ts](/Users/tyler/nexus/home/projects/moonsleep-v1/workers/meta-capi/src/index.ts#L827)

## Customer Experience

The intended operator flow is:

1. create one TikTok Display connection through Nex
2. complete TikTok Display OAuth in Nex
3. confirm the authorized profile is healthy
4. backfill profile and recent video rows
5. enable monitor sync for freshness

## Provider Surface

The parity target uses these TikTok Display endpoints:

- `POST https://open.tiktokapis.com/v2/oauth/token/`
- `GET https://open.tiktokapis.com/v2/user/info/`
- `POST https://open.tiktokapis.com/v2/video/list/`

## Connection Model

One Nex `tiktok-display` connection represents one durable TikTok Display
credential binding for one authorized profile.

Required preserved identifiers include:

- `connection_id`
- `open_id`
- `union_id` when provided
- `video_id`

## Canonical Responsibilities

The adapter must:

1. validate Display OAuth credentials
2. fetch and preserve the current profile row
3. fetch and preserve recent video rows
4. keep those rows fresh through monitor sync
5. emit canonical `record.ingest` envelopes for replay-safe downstream use

## Source Families

| Family | Grain | Required preserved fields |
|---|---|---|
| `profile_snapshot` | one row per authorized profile | `open_id`, `display_name`, `profile_web_link`, `follower_count`, `following_count`, `likes_count`, `video_count`, provider profile metadata |
| `video_snapshot` | one row per video | `open_id`, `id`, `title`, `video_description`, `create_time`, `cover_image_url`, `share_url`, `view_count`, `like_count`, `comment_count`, `share_count` |

## Backfill Model

Required parity behavior:

1. profile sync emits one current singleton row
2. video sync paginates with cursor-based requests
3. video sync stops once the returned `create_time` falls before the requested
   floor date
4. backfill emits the same row families and payload structure as monitor sync

MoonSleep's current parity target requests up to `20` videos per page and keeps
pulling while `has_more` remains true.

## Monitor Model

The monitor keeps display rows fresh by polling on a durable schedule.

Target-state behavior:

- profile snapshot is replayed on every monitor cycle
- recent videos are replayed inside a recent window to pick up new posts and
  updated counters
- monitor emits the same contract as backfill

## Emitted Record Model

Each `record.ingest` event must preserve:

- `connection_id`
- provider family
- provider ids for the row
- the structured provider fields for that row

The adapter should use revision-aware record identity so unchanged retries
dedupe while updated profile or video rows append as new immutable arrivals.

## Exclusions

This adapter does not own:

- TikTok Business reporting
- campaign, ad group, or ad hierarchy
- TikTok comment moderation
- TikTok messaging
- TikTok Pixel or Events API
- attribution decisions

## Validation Expectations

Cleanroom validation for this adapter must prove:

1. credential setup succeeds through Nex
2. `adapter.health` confirms profile visibility
3. backfill emits `profile_snapshot` and `video_snapshot`
4. monitor emits the same contract as backfill
5. sampled rows match TikTok upstream values for profile metadata and video
   counters

## Done Definition

The shared `tiktok-display` package is complete when:

1. the package exists and is installable through Nex
2. setup, health, backfill, and monitor work with a real authorized profile
3. profile and video rows are preserved as provider-native snapshots
4. cleanroom validation with real credentials proves parity against MoonSleep's
   connected display account
