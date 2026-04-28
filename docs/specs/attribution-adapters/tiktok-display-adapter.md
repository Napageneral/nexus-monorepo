# TikTok Display Adapter

**Status:** CANONICAL
**Last Updated:** 2026-04-27
**Related:** [Attribution Intelligence Layer](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-layer.md), [Adapter Full-Surface Compliance Standard](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/adapter-full-surface-compliance-standard.md), [Adapter Validation Proof Ladder](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/adapter-validation-proof-ladder.md), [TikTok Adapter Packages Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/tiktok-adapter-packages-board/README.md), [Adapter Fleet Efficiency Audit Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-fleet-efficiency-audit-board/README.md)

---

## Purpose

This document defines the target-state shared `tiktok-display` adapter
surface for Nex.

The adapter provides TikTok profile and recent video inventory data from the
TikTok Display API with provider-native identifiers preserved.

The adapter also provides Nex-native ingest projection for observed organic
profile and video snapshots. Its live monitor is not a repeated backfill. It is
a durable polling system that separates new-content discovery from metric
freshness, suppresses unchanged rows before ingest, and uses slower reconcile
work to protect correctness.

This adapter is separate from the paid-media business adapter on purpose.

It does not include:

- TikTok Business or Marketing API reporting
- TikTok ads hierarchy or spend metrics
- TikTok Pixel or Events API
- comment moderation
- creative review workflows
- attribution logic

## MoonSleep Parity Baseline

MoonSleep provides two useful reference patterns:

- display OAuth token exchange
- profile lookup
- recent video enumeration
- host-owned organic content snapshot watermarks
- append-only observed snapshot facts for organic content metrics

Primary MoonSleep references:

- [sync.py](/Users/tyler/nexus/home/projects/moonsleep-v1/analytics/sync.py#L688)
- [sync.py](/Users/tyler/nexus/home/projects/moonsleep-v1/analytics/sync.py#L1480)
- [ops-analytics-organic-snapshot-sync.py](/Users/tyler/nexus/home/projects/moonsleep-v1/infra/ops-analytics/files/bin/ops-analytics-organic-snapshot-sync.py#L631)
- [ops-analytics-organic-snapshot-sync.py](/Users/tyler/nexus/home/projects/moonsleep-v1/infra/ops-analytics/files/bin/ops-analytics-organic-snapshot-sync.py#L771)
- [index.ts](/Users/tyler/nexus/home/projects/moonsleep-v1/workers/ops-refresh/src/index.ts#L2173)

The Nex target state intentionally takes the best parts of MoonSleep without
copying its broad steady-state scan behavior. MoonSleep's strong contribution
is the observed snapshot model and explicit watermarks. Nex keeps that
snapshot semantics while adding adapter-local monitor state and unchanged-row
suppression so live polling remains cheap.

## Customer Experience

The intended operator flow is:

1. create one TikTok Display connection through Nex
2. complete TikTok Display OAuth in Nex
3. confirm the authorized profile is healthy
4. backfill profile and recent video rows
5. enable monitor sync for freshness

## Provider Surface

The minimum current parity target uses these TikTok Display endpoints:

- `POST https://open.tiktokapis.com/v2/oauth/token/`
- `GET https://open.tiktokapis.com/v2/user/info/`
- `POST https://open.tiktokapis.com/v2/video/list/`

The adapter remains provider-backed. When TikTok exposes additional Display API
read operations that can be truthfully represented in Nex, the package method
catalog should expose them as provider-native methods and keep projection logic
additive.

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
6. preserve provider-native read methods alongside Nex projection behavior
7. track monitor state durably enough that restart does not cause a replay storm
8. suppress unchanged profile and video revisions before emitting durable
   records

## Polling Principles

The target-state live polling model follows these rules:

1. Backfill and live monitor are separate lanes.
2. Backfill is exhaustive, resumable, and correctness-first.
3. Live monitor is incremental, bounded, and cheap.
4. Publish-time watermarks solve new-content discovery.
5. Content digests solve metric freshness.
6. A profile snapshot is a current-state observation, not a historical page
   cursor.
7. Video counters can change after publication, so new-video discovery alone
   is not sufficient.
8. Slow reconcile protects correctness without turning every live tick into a
   full account scan.
9. Unchanged provider rows are suppressed before Nex records are emitted.
10. Provider-native raw fields remain available for downstream apps even when
   normalized projection fields are added.

## Source Families

| Family | Grain | Required preserved fields |
|---|---|---|
| `profile_snapshot` | one emitted row per observed profile revision | `open_id`, `union_id` when provided, `display_name`, `avatar_url`, `bio_description`, `profile_deep_link`, `profile_web_link`, `is_verified`, `follower_count`, `following_count`, `likes_count`, `video_count`, provider profile metadata |
| `video_snapshot` | one emitted row per observed video revision | `open_id`, `id`, `title`, `video_description`, `create_time`, `duration`, `height`, `width`, `cover_image_url`, `share_url`, `embed_html`, `embed_link`, `view_count`, `like_count`, `comment_count`, `share_count` |

The adapter may poll a source family and emit no records when every observed row
matches the last durable revision.

## Record Identity And Revision Semantics

Every emitted record must include:

- `connection_id`
- adapter id
- source family
- logical row id
- provider ids
- normalized row
- provider row
- source request metadata
- observed timestamp
- revision hash

Logical row ids are stable per provider object:

- profile logical row id: `profile:{open_id}`
- video logical row id: `video:{video_id}`

Revision hashes include only stable fields whose changes should create a new
observed revision. They exclude poll timing, request ids, transient response
metadata, and adapter execution details.

External record identity includes the revision hash so changed profile or video
facts append as immutable arrivals while unchanged retries dedupe:

```text
tiktok_display:{connection_id}:{family}:{logical_row_id}:{revision_hash}
```

Downstream attribution and operator apps should treat the record stream as an
observed snapshot ledger. They can build latest-state views, growth deltas, and
compare-window metrics from the ledger without requiring the adapter to mutate
old rows.

## Durable Monitor State

The adapter maintains durable monitor state per connection. This state is an
implementation detail of the adapter/runtime boundary, but the observable
behavior is part of the contract.

Profile state tracks:

- last profile revision hash
- last observed timestamp
- last emitted timestamp
- last successful profile poll timestamp

Discovery state tracks:

- newest published timestamp observed
- newest provider video ids observed at that timestamp
- discovery overlap duration
- last successful discovery poll timestamp
- provider page summary for diagnostics

Per-video state tracks:

- provider video id
- published timestamp
- last revision hash
- last observed timestamp
- last emitted timestamp
- last metric-change timestamp
- refresh tier
- consecutive unchanged observations
- last successful refresh timestamp

Reconcile state tracks:

- last slow reconcile timestamp
- reconcile coverage summary
- reconcile error summary

The state model is intentionally per source domain and per video. There is no
single universal cursor for all adapter behavior.

## Backfill Model

Backfill is the explicit exhaustive path. It is allowed to spend more provider
requests than live monitor because the operator or runtime requested historical
coverage.

Required behavior:

1. profile sync fetches the current profile row
2. video sync paginates with cursor-based requests
3. video sync stops once the returned `create_time` falls before the requested
   floor date
4. backfill emits the same row families and payload structure as monitor sync
5. backfill updates monitor state as it observes rows
6. backfill can resume from an interrupted run without duplicating unchanged
   records
7. initial backfill emits every observed current revision that is not already
   represented in Nex records
8. repeated backfill suppresses unchanged rows unless explicitly run in a
   diagnostic replay mode

MoonSleep's current parity target requests up to `20` videos per page and keeps
pulling while `has_more` remains true. Nex preserves the page shape but does
not require live monitor to repeat that full scan every cycle.

## Monitor Model

The monitor keeps display rows fresh through multiple bounded lanes.

Target-state behavior:

- profile poll fetches `user/info`, computes a profile revision hash, and emits
  only when the profile revision changed
- discovery poll reads newest videos first and stops once it crosses the
  publish-time overlap boundary
- active metric refresh revisits known videos whose counters are still likely
  to move
- slow reconcile periodically scans broader history to catch provider ordering
  anomalies, missed live cycles, and older metric drift
- monitor emits the same record contract as backfill
- monitor continues until runtime cancellation
- monitor persists state after successful lane completion

The monitor may run these lanes at different cadences:

- profile poll: frequent and cheap
- discovery poll: frequent enough to catch new videos promptly
- active metric refresh: frequent for hot videos, slower for stable videos
- slow reconcile: infrequent and correctness-oriented

The exact intervals are runtime configuration. The default posture should be
safe for hosted client runtimes: frequent enough for operational freshness, but
bounded enough that a quiet account does not generate repeated broad scans.

## Discovery And Active Refresh

Discovery uses publication time and provider ids:

1. page newest videos first
2. record the newest `create_time` seen and all video ids at that timestamp
3. on later polls, use an overlap window around that timestamp
4. stop once all returned videos are older than the overlap boundary
5. treat unknown video ids inside the overlap as new discoveries

Active metric refresh uses per-video state:

1. newly discovered videos enter the hot refresh tier
2. videos with recent counter changes remain hot
3. unchanged videos graduate to slower tiers
4. cold videos are normally skipped by live refresh and covered by slow
   reconcile
5. any changed metric digest emits a new `video_snapshot` revision

If the upstream provider exposes a safe id-specific video read, active refresh
should prefer it for known videos. If the provider only exposes paged list
reads, active refresh should page only as far as needed to cover the active set
boundary instead of scanning the entire account.

## Slow Reconcile

Slow reconcile exists because provider pagination and organic metric drift are
not perfect incremental streams.

Slow reconcile must:

- run independently from the frequent live monitor path
- be resumable
- have a provider request budget
- record coverage and errors in reconcile state
- emit only changed or newly discovered revisions
- update per-video state when it observes old content

Slow reconcile may be daily, manual, or runtime-scheduled depending on the
connection profile. It is not allowed to be the steady-state live monitor
strategy.

## Emitted Record Model

Each `record.ingest` event must preserve:

- `connection_id`
- provider family
- provider ids for the row
- the structured provider fields for that row
- provider raw response fields for that row
- observed snapshot timestamp
- source request metadata sufficient for diagnostics

The adapter uses revision-aware record identity so unchanged retries dedupe
while updated profile or video rows append as new immutable arrivals. The
adapter should suppress unchanged rows before emit; runtime dedupe is a safety
net, not the primary efficiency mechanism.

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
4. repeated unchanged monitor cycles emit zero duplicate records
5. a profile counter or metadata change emits exactly one new profile revision
6. a new video discovered through newest-page polling emits exactly one new
   video revision
7. an existing active video's metric change emits exactly one new video revision
8. adapter restart resumes from durable monitor state without broad replay
9. slow reconcile catches a missed older row or metric change without making
   live monitor broad
10. sampled rows match TikTok upstream values for profile metadata and video
   counters

Package-local validation must include deterministic fake-provider tests for:

- backfill pagination until the requested floor
- discovery stop conditions
- profile revision suppression
- video revision suppression
- hot/warm/cold refresh tier transitions
- restart from persisted state
- slow reconcile emission behavior

Benchmark validation must report:

- provider request count by lane
- emitted record count by family
- suppressed unchanged row count
- wall-clock duration
- adapter state size
- restart behavior

Hosted proof for MoonSleep must include:

- initial backfill summary
- at least one unchanged live monitor cycle
- at least one changed-row proof when safe
- a bounded soak window with request counts and emitted records
- confirmation that the hosted runtime remains responsive during the soak

## Done Definition

The shared `tiktok-display` package is complete when:

1. the package exists and is installable through Nex
2. setup, health, backfill, and monitor work with a real authorized profile
3. profile and video rows are preserved as provider-native snapshots
4. live monitor uses durable state and unchanged-row suppression
5. backfill, live discovery, active refresh, and slow reconcile are separately
   testable
6. benchmark artifacts prove quiet-account polling stays bounded
7. cleanroom validation with real credentials proves parity against MoonSleep's
   connected display account
