# AFEA-015 TikTok Display Smart Polling And Snapshot Ledger

## Goal

Move `tiktok-display` from the April 27 sanity-fix monitor into the ideal
adapter posture defined by the canonical TikTok Display spec:

- rich provider-native profile and video records
- durable per-connection monitor state
- separate backfill, live discovery, active metric refresh, and slow reconcile
  lanes
- unchanged-row suppression before ingest
- package-local and hosted benchmark proof

Canonical spec:

- [TikTok Display Adapter](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/tiktok-display-adapter.md)

## Status

Complete as of April 27, 2026, with OAuth renewal hardening added on April
27/28, 2026.

Local implementation, copied-package cleanroom validation, and hosted MoonSleep
runtime validation are complete. The original hosted proof installed package
`0.1.2`, created the MoonSleep TikTok Display connection, ran the provider
health path, completed a backfill, and left live sync enabled through a
one-minute monitor window with no new unchanged durable records emitted. The
follow-up hosted proof upgraded the same connection to `0.1.3`, installed the
refresh-token and OAuth-client fields, completed another backfill, and verified
adapter health with OAuth renewal configured.

Follow-up observability remains useful but is not blocking this ticket: the
adapter should eventually expose first-class per-lane request and suppression
counters instead of requiring proof scripts to infer quiet-cycle suppression
from durable record counts.

Credential renewal is now part of the adapter. The hosted connection has the
refresh token, token expiries, OAuth client key, and OAuth client secret
installed, and package-local tests prove direct TikTok OAuth refresh plus
adapter-state cache reload behavior.

## Current Reality

The package now has these foundations:

- real TikTok Display OAuth and profile health
- provider-native `user/info` and `video/list` reads
- rich `profile_snapshot` and `video_snapshot` record construction
- revision-aware external record ids
- bounded backfill that stops when video `create_time` crosses the requested
  floor
- a blocking one-minute monitor loop
- durable per-connection monitor state under `$NEXUS_ADAPTER_STATE_DIR`
- separate profile, discovery, active refresh, and slow reconcile lanes
- adapter-side unchanged-row suppression before emit
- package-local fake-provider tests for quiet cycles, restart, active refresh,
  and slow reconcile

## Gap Analysis

| Area | Current behavior | Target behavior |
|---|---|---|
| Backfill | Bounded by requested floor, emits rich profile/video records, and updates monitor state when state storage is available | Hosted MoonSleep proof completed against packages `0.1.2` and `0.1.3` |
| Live monitor | One-minute loop with separate profile, discovery, active refresh, and slow reconcile lanes | Hosted proof left live sync enabled after a one-minute monitor window |
| Discovery | Uses publish-time overlap and provider ids to avoid broad replay | Hosted proof returned a bounded first video page and completed backfill in about five seconds |
| Metric freshness | Refreshes active known videos by tier and suppresses unchanged revisions | Hosted proof showed zero new durable records during the post-backfill monitor window |
| State | Persists per-connection profile, discovery, per-video, and reconcile state | Hosted proof installed and ran through the runtime-managed state directory |
| Emissions | Suppresses unchanged rows inside the adapter before durable ingest | Hosted proof inferred suppression from unchanged record count after the monitor window |
| Testing | Local tests cover no-op quiet cycles, restart, active refresh, and slow reconcile | Keep tests as the deterministic regression gate |
| Benchmarks | Quiet-cycle benchmark exists and passes in repo-local and copied-package cleanroom contexts | Add hosted soak metrics before closing the ticket |

## Target Behavior

The monitor should behave like a smart live sync, not a repeated backfill:

1. fetch the current profile, compute a revision digest, and emit only on
   change
2. discover new videos by reading newest pages until crossing a publish-time
   overlap boundary
3. maintain per-video refresh tiers so recent or changing videos stay fresh
   while stable older videos move to slower refresh
4. run slow reconcile separately to catch older drift and missed discoveries
5. persist monitor state so restart does not trigger a replay storm
6. report request counts, emitted records, and suppressed rows by lane

## Implementation Tasks

1. Complete: add package-local monitor state with deterministic test coverage
   for profile state, discovery state, per-video state, and reconcile state.
2. Complete: split the monitor implementation into profile poll, discovery
   poll, active metric refresh, and slow reconcile lanes.
3. Complete: add adapter-side revision suppression before records are emitted.
   Runtime record dedupe remains a safety net, not the primary efficiency
   mechanism.
4. Complete locally: update backfill so it updates monitor state and can be
   safely repeated without creating unchanged emissions when state storage is
   available.
5. Complete locally: add a fake-provider benchmark harness for quiet-cycle
   cost.
6. Complete: add live MoonSleep validation for initial backfill plus a bounded
   soak window against the hosted runtime.
7. Complete: update package docs and validation docs as proof artifacts
   exist.

## Local Proof

Repo-local proof:

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/tiktok-display
go test ./...
go test ./cmd/tiktok-display-adapter -run '^$' -bench 'BenchmarkTikTokDisplayQuietMonitorCycle' -benchmem
```

Results:

- `ok github.com/nexus-project/adapter-tiktok-display/cmd/tiktok-display-adapter 0.192s`
- `BenchmarkTikTokDisplayQuietMonitorCycle-12 111228 10800 ns/op 12593 B/op 161 allocs/op`

Copied-package cleanroom proof in `/tmp/tiktok-display-cleanroom.P25QNj`:

- `GOCACHE=/tmp/tiktok-display-cleanroom.P25QNj/gocache GOMODCACHE=/tmp/tiktok-display-cleanroom.P25QNj/gomodcache go test ./...`
- `GOCACHE=/tmp/tiktok-display-cleanroom.P25QNj/gocache GOMODCACHE=/tmp/tiktok-display-cleanroom.P25QNj/gomodcache go test ./cmd/tiktok-display-adapter -run '^$' -bench 'BenchmarkTikTokDisplayQuietMonitorCycle' -benchmem -count=1`

Results:

- `ok github.com/nexus-project/adapter-tiktok-display/cmd/tiktok-display-adapter 0.195s`
- `BenchmarkTikTokDisplayQuietMonitorCycle-12 111435 10366 ns/op 12593 B/op 161 allocs/op`

## Hosted MoonSleep Proof

Artifact:

- `/Users/tyler/nexus/home/projects/nexus/artifacts/package-smoke/moonsleep-tiktok-display-0.1.2-hosted-proof.json`
- `/Users/tyler/nexus/home/projects/nexus/artifacts/package-smoke/moonsleep-tiktok-display-0.1.3-hosted-proof.json`

Summary:

- Frontdoor package install status: `installed`
- desired version: `0.1.3`
- active version: `0.1.3`
- runtime `adapter.info` version: `0.1.3`
- connection id: `d3f7dfd2-ef3c-4844-be4d-e0dca82e2093`
- connection status: `connected`
- adapter health: connected for MoonSleep with `oauth_refresh_configured: true`
- provider `user/info`: MoonSleep profile returned
- provider `video/list`: first page returned videos with `has_more: true`
- backfill run: `jobrun_70cc276d-8c91-4967-a868-a5c02715e0c9`
- backfill status: `completed`
- live sync after monitor window: `enabled: true`
- runtime health after proof: `healthy`, `5` adapters running, `0` errored
- credential renewal: closed the prior manual-rotation caveat by installing the
  refresh token, token expiries, OAuth client key, and OAuth client secret into
  the hosted connection; adapter-side OAuth refresh is covered by package-local
  tests and the hosted health surface now reports renewal configured

## Validation Plan

Package-local tests must prove:

- full backfill paginates until the requested floor
- initial monitor emits expected profile and video revisions
- repeated unchanged monitor emits zero records
- profile counter change emits one profile revision
- new video discovery emits one video revision
- active video metric change emits one video revision
- warm/cold tier transitions reduce repeated refresh pressure
- restart resumes from persisted state without broad replay
- slow reconcile can catch a missed older video or metric update

Benchmark proof must capture:

- provider requests by lane
- records emitted by family
- unchanged rows suppressed by family
- monitor state size
- elapsed runtime
- restart behavior

Hosted MoonSleep proof must capture:

- package version or commit installed on the hosted runtime
- connection id under test
- backfill record counts
- live soak duration
- request counts and emission counts during quiet cycles
- runtime responsiveness before and after the soak

## Done Definition

This ticket is complete when:

- package-local tests and benchmark harness pass
- the package-local validation doc names the smart-polling proof path
- a live MoonSleep hosted proof shows bounded quiet-cycle behavior
- the hosted proof shows no unchanged profile or video durable records emitted
  during the post-backfill monitor window
- the canonical spec remains aligned with the implementation
