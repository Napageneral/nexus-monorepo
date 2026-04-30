# GGR-011 Gmail Polling-First History Live Sync

## Goal

Make Gmail live sync tight without requiring Google Pub/Sub setup. The adapter
should use a durable Gmail history cursor from backfill, poll `gmail history`
from that cursor, and reserve Pub/Sub as an optional wake-up optimization.

## Scope

- derive a monitor `history_id` from fetched backfill messages
- start history polling from a persisted cursor without calling Gmail watch APIs
- keep Gmail watch/Pub/Sub support optional when a topic is configured
- expose health details for history polling separately from optional watch
  metadata
- package-test the polling-only path in cleanroom
- live-test the polling-first path against `tnapathy@gmail.com` without
  Pub/Sub or Gmail watch

## Completed

- `records.backfill` now records the highest fetched Gmail `history_id` in
  `*.monitor.json` when no Pub/Sub topic is configured.
- `adapter.monitor.start` now uses an existing monitor `history_id` directly
  and only touches Gmail watch APIs when `NEXUS_GOG_WATCH_TOPIC` or
  `NEXUS_GOG_PUBSUB_TOPIC` is set.
- The history monitor still polls `gmail history` on `NEXUS_GOG_POLL_INTERVAL`
  and advances the cursor only after complete event processing.
- Adapter health now reports `history_polling` state separately from optional
  `history_watch` metadata.
- Package cleanroom smoke now includes a fake-Gmail `records.backfill` proof
  that emits two records, writes `{"history_id":"200"}`, and makes no
  `gmail watch` call.
- Live cleanroom proof now sends a seed email, backfills that seed to establish
  a recent history cursor, starts the monitor, sends a second self-addressed
  email, and asserts the monitor command trace uses `gmail history` without
  `gmail watch` or `gmail messages search`.

## Validation

- `go test ./...`
- `bash -n scripts/package-cleanroom-smoke.sh scripts/gmail-live-cleanroom-proof.sh scripts/package-release.sh`
- `git diff --check`
- `NEXUS_GOG_SKIP_BUNDLE=1 ./scripts/package-release.sh`
- `./scripts/package-cleanroom-smoke.sh`
- `NEXUS_GOG_HISTORY_POLL_PROOF=1 NEXUS_GOG_LIVE_SELF_SEND=1
  NEXUS_GOG_REQUIRE_MONITOR_RECORDS=1
  ./scripts/gmail-live-cleanroom-proof.sh dist/gog-0.1.0.tar.gz`

Latest package cleanroom proof:

- `/Users/tyler/nexus/state/artifacts/validation/cleanroom/gog-package-cleanroom/20260430T212001Z`
- archive sha256:
  `f0a2dc0d6d3173c84ff263f3b64666533082dd1e1e561c460ded4e6e1bc4454b`

Latest polling-first live proof:

- `/Users/tyler/nexus/state/artifacts/validation/cleanroom/gog-gmail-live/20260430T213445Z`
- archive sha256:
  `f0a2dc0d6d3173c84ff263f3b64666533082dd1e1e561c460ded4e6e1bc4454b`
- seed send succeeded, bounded backfill emitted one rich Gmail record, and
  monitor state recorded a history cursor
- 90-second monitor soak emitted one rich self-send record with body, headers,
  history event metadata, and the expected proof subject
- redacted command trace shows monitor calls to `gmail history` and no
  `gmail watch` or `gmail messages search` fallback

## Notes

This does not remove Pub/Sub support. It changes the near-term reliable default:
backfill establishes the durable cursor, history polling keeps the account
current, and Pub/Sub can later reduce latency by waking the same history sync
path.
