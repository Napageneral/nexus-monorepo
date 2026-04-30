# GGR-006 Gmail Watch History Event Richness

## Goal

Use Gmail history/watch to ingest not only new messages but also state changes
such as deletion and label updates.

## Current Gap

The monitor currently prefers Gmail watch/history state and fetches changed
message ids. It does not yet project the full upstream history event families
or emit durable state-change records for label additions/removals and message
deletions.

## Scope

- inspect upstream `gog gmail history --json` output for:
  - message added
  - message deleted
  - label added
  - label removed
- extend parser types to preserve event family, message id, label ids, and
  history id
- emit rich message records for added/changed messages
- emit state-change records or updates for deletion and label changes
- track durable cursor advancement only after records are emitted
- handle stale history cursor by falling back to explicit resync behavior with
  degraded health output

## Acceptance

1. tests cover each supported Gmail history event family
2. cursor state advances only after successful emission
3. deleted-message events do not attempt to fetch missing bodies
4. label changes preserve label ids and do not duplicate unchanged full message
   records unnecessarily
5. monitor soak proof shows no broad mailbox scan when history state is healthy

## Completion Notes

- Added adapter-side Gmail history event parsing for:
  - legacy flattened `messages`
  - `messagesAdded`
  - `messagesDeleted`
  - `labelsAdded`
  - `labelsRemoved`
  - generic changed `messages`
- Message-added/message-changed events fetch and emit the full rich Gmail record
  path shared with backfill.
- Deleted-message, labels-added, and labels-removed events emit state-change
  records without fetching message bodies.
- Monitor cursor advancement is gated behind complete per-event processing;
  fetch failures retain the previous cursor for retry.
- Stale history cursor errors fall back to bounded polling and log degraded
  behavior explicitly.
- Validation:
  - `go test ./...`
  - `go build -o ./bin/gog-adapter ./cmd/gog-adapter`
  - fake-CLI proof that the healthy history path calls `gmail history` and does
    not call Gmail search
- Limitation:
  - current pinned upstream `gogcli v0.14.0` `gmail history --json` still emits
    only flattened message-added ids, so label/delete history is adapter-ready
    but not live-exposed until upstream output or a lower-level history API path
    is added.
