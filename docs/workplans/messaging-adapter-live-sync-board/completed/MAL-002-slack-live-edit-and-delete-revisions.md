# MAL-002 Slack Live Edit And Delete Revisions

## Goal

Bring the OpenClaw-style Slack live edit and delete event model into the Nex
Slack adapter while preserving Nex's durable cursor and backfill posture.

## Current Gap

The Slack adapter's readable backfill and user-token polling path preserves
edited and deleted metadata when the provider returns it from history. The bot
Socket Mode monitor currently ignores non-empty message subtypes, so live
`message_changed` and `message_deleted` events do not produce explicit revision
records.

Primary files:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/slack/internal/slack/socketmode.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/slack/cmd/slack-adapter/monitor.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/slack/cmd/slack-adapter/monitor_test.go`

## Scope

- parse Slack nested message change/delete payload fields from Socket Mode
- emit live edit revision records with stable revision identities
- emit live delete revision records with stable revision identities
- preserve original Slack message identity in revision metadata
- keep normal message ingest and ack reaction behavior unchanged

## Acceptance

1. normal Slack message live ingest behavior remains unchanged
2. `message_changed` emits a revision record with `revision_type:
   message_edit`
3. `message_deleted` emits a revision record with `revision_type:
   message_delete` and `deleted: true`
4. record ids reference the original Slack message id and event-specific
   revision id
5. unit tests cover live edit and delete event projection

## Validation

- `go test ./...`
- `git diff --check`

## Completed

- Socket Mode now parses Slack `message_changed` and `message_deleted` nested
  payload fields.
- Live `message_changed` emits a revision record with `revision_type:
  message_edit`.
- Live `message_deleted` emits a revision record with `revision_type:
  message_delete` and `deleted: true`.
- Revision records preserve the original Slack external record id and include
  event-specific revision ids.
- Unit tests cover live edit and delete projection.

Validation run:

- `go test ./...` in
  `/Users/tyler/nexus/home/projects/nexus/packages/adapters/slack`
- `git diff --check` in
  `/Users/tyler/nexus/home/projects/nexus`
