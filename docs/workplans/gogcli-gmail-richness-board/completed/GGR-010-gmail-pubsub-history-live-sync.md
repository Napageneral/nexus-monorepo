# GGR-010 Gmail Pub/Sub History Live Sync

## Goal

Move Gmail live sync toward the long-term reliable shape: Pub/Sub as the
wake-up signal, Gmail history as the correctness cursor, and bounded polling as
fallback.

## Scope

- specify the Gmail live-sync architecture
- preserve durable watch/history monitor metadata
- start or renew Gmail watch when a Pub/Sub topic is configured
- prime watch/history state before long backfills when no cursor exists
- expose a hosted-webhook-friendly Pub/Sub notification sync method
- prove the path with fake-CLI tests and package cleanroom smoke

## Completed

- Added
  `/Users/tyler/nexus/home/projects/nexus/packages/adapters/gog/docs/specs/GMAIL_LIVE_SYNC_ARCHITECTURE.md`.
- Added `gmail.pubsub.sync` to parse Gmail Pub/Sub push envelopes or decoded
  Gmail notifications.
- `gmail.pubsub.sync` validates the Gmail account, reads the persisted
  `history_id`, calls `gmail history`, fetches rich message records for
  message-bearing history events, returns canonical records, and advances the
  cursor only after complete processing.
- `adapter.monitor.start` now starts or renews Gmail watch state when
  `NEXUS_GOG_WATCH_TOPIC` or `NEXUS_GOG_PUBSUB_TOPIC` is set.
- `records.backfill` primes watch/history state before mailbox scanning when a
  topic is configured and no durable cursor exists.
- Monitor state now records watch topic, expiration, check/renew timestamps,
  last history sync timing, event count, record count, and last error.
- Package cleanroom smoke now requires `gmail.pubsub.sync` and verifies a clean
  notification fast-forwards an empty cursor.

## Validation

- `go test ./...`
- `bash -n scripts/gmail-live-cleanroom-proof.sh scripts/package-cleanroom-smoke.sh scripts/package-release.sh`
- `NEXUS_GOG_SKIP_BUNDLE=1 ./scripts/package-release.sh`
- `./scripts/package-cleanroom-smoke.sh dist/gog-0.1.0.tar.gz`

Latest package cleanroom proof:

- `/Users/tyler/nexus/state/artifacts/validation/cleanroom/gog-package-cleanroom/20260430T182104Z`
- archive sha256:
  `2306db5b757ca4696702e32c5f6c9c6149561116b7820a29355e2f8b7651c6e1`
- `adapter.info` exposed `14` Gmail methods, including `gmail.pubsub.sync`

## Remaining Runtime Work

The adapter side is ready for hosted Pub/Sub wake-ups. The remaining runtime
piece is a public webhook route that verifies Google delivery, maps the Gmail
email address to a connection, calls `gmail.pubsub.sync`, and writes returned
records through canonical Nex record ingest.
