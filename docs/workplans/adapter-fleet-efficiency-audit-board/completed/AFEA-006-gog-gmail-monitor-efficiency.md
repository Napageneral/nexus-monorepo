# AFEA-006 GOG Gmail Monitor Efficiency

## Goal

Make the Gmail monitor path in `gog` both efficient and loss-safe.

## Completed

The Gmail monitor efficiency pass is complete through the GOG Gmail richness
board:

- `GGR-007` made degraded search polling page until stable, exhausted, or
  capped, with persisted seen ids, watermarks, request counts, and page-cap
  health details.
- `GGR-010` added the durable Gmail history sync seam and optional Pub/Sub
  wake-up processing through `gmail.pubsub.sync`.
- `GGR-011` made the default path polling-first through Gmail history:
  `records.backfill` stores a Gmail `history_id`, `adapter.monitor.start`
  polls `gmail history` from that cursor, and Pub/Sub setup is optional.

Primary files:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/gog/cmd/gog-adapter/main.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/gog/scripts/gmail-live-cleanroom-proof.sh`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/gog/docs/specs/GMAIL_LIVE_SYNC_ARCHITECTURE.md`

## Validation

- Package cleanroom proof:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/gog-package-cleanroom/20260430T212001Z`
- Polling-first live proof:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/gog-gmail-live/20260430T213445Z`
- Release archive sha256:
  `f0a2dc0d6d3173c84ff263f3b64666533082dd1e1e561c460ded4e6e1bc4454b`

The live proof sent a seed email to `tnapathy@gmail.com`, backfilled that seed
to persist a Gmail history cursor, started monitor without a Pub/Sub/watch
topic, sent a second self-addressed email, and asserted via redacted command
trace that monitor used `gmail history` without `gmail watch` or
`gmail messages search` fallback.

## Remaining Follow-Up

Pub/Sub hosted webhook work remains optional future latency optimization. The
adapter-side method exists; hosted runtime still needs a public route that
verifies Google delivery and invokes `gmail.pubsub.sync`.
