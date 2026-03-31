# TAP-005 TikTok Display Video Sync And Monitor

## Goal

Implement TikTok Display video enumeration, backfill, and monitor behavior for
the shared `tiktok-display` package.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/tiktok-display-adapter.md`
- `/Users/tyler/nexus/home/projects/moonsleep-v1/analytics/sync.py`

## Current Gap

- the package does not yet enumerate video rows
- cursor-based pagination and recent replay behavior are not implemented
- monitor cannot yet append immutable arrivals for profile/video metric changes

## Acceptance

1. `video_snapshot` rows are emitted with provider-native ids and counters
2. backfill paginates through `video/list` until the requested floor date is
   reached or provider pagination is exhausted
3. monitor replays recent videos and appends immutable arrivals when counters
   change
4. emitted payloads preserve the structured provider row for each video
