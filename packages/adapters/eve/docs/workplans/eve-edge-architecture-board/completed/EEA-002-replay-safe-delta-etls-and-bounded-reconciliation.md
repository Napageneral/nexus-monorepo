# EEA-002 Replay-Safe Delta ETLs And Bounded Reconciliation

## Goal

Port Eve's live ingest from broad sync passes to replay-safe delta ETLs that
preserve correctness under late joins, attachment linkage races, and restart.

## Scope

- delta ETLs for messages
- delta ETLs for reactions
- delta ETLs for membership events
- delta ETLs for attachments
- delta ETLs for message updates such as edit or unsend when observable
- bounded reconciliation windows for late-linked rows

## Acceptance

- each live ingest domain advances from its own durable watermark or equivalent
  progress marker
- replay after restart is idempotent
- late join or attachment linkage races are repaired by bounded reconciliation
  instead of broad full-table work
- live ingest and backfill still converge on the same canonical record shape

## Validation

- fixture-backed ETL tests per domain
- replay and restart tests
- `go test ./...`
- `git diff --check`
