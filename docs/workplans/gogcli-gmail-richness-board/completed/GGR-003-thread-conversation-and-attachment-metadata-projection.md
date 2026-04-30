# GGR-003 Thread Conversation And Attachment Metadata Projection

## Goal

Preserve Gmail thread context and attachment metadata without aggressively
downloading every attachment by default.

## Current Gap

The adapter records `thread_id` as metadata, but it does not fetch thread
membership, message ordering inside a thread, or attachment metadata for message
parts.

## Scope

- inspect upstream `gog gmail thread get --full --json`
- inspect upstream `gog gmail thread attachments --json`
- add thread-level projection helpers that preserve:
  - thread id
  - ordered message ids
  - per-message senders/recipients/subjects/dates
  - attachment filename, MIME type, size, attachment id, message id, and thread
    id
- avoid repeated full-thread fetches during steady-state monitor unless a
  changed message requires thread context
- expose a read method for thread inspection if upstream output is stable

## Acceptance

1. tests cover single-message threads, multi-message threads, and attachments
2. a bounded live proof shows attachment metadata without downloading content
3. monitor does not fetch full thread data for every no-change poll
4. operator can inspect a thread through a Gmail-native adapter method

## Completion Notes

- Message record projection now traverses the full Gmail payload tree and
  captures attachment metadata for parts with filenames or attachment ids.
- Canonical records now include `payload.attachments` entries with stable Gmail
  attachment ids, filename, MIME type, size, and message/thread metadata.
- Message metadata now includes `attachments` and `attachment_count`.
- Added read-only `gmail.thread.get`.
- Added read-only `gmail.thread.attachments`.
- Monitor/backfill still fetch changed messages only; full thread fetch is an
  explicit operator method.
- `go test ./...` passes.
- Bounded live proof emitted one attachment-bearing Gmail record with:
  - `attachment_count=1`
  - `metadata_attachment_count=1`
  - first attachment MIME type `image/png`
  - first attachment size `590500`
- `gmail.thread.attachments` returned a thread attachment summary with 15
  attachments.
- `gmail.thread.get` returned a thread summary with 16 messages.

The live proof omitted private message body and attachment contents.
