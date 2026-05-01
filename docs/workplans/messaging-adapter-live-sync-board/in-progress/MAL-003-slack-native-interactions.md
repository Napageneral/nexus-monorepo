# MAL-003 Slack Native Interactions

## Goal

Add Slack-native buttons, selects, modals, approval prompts, ephemeral replies,
and message updates to the Nex Slack adapter.

## Current Gap

OpenClaw has a mature Slack interaction runtime for block actions, selects,
modals, approvals, authorization checks, plugin dispatch, and ephemeral
responses. Nex Slack currently focuses on send/read/backfill/monitor behavior
and does not expose comparable native interaction controls.

## Scope

- define the adapter-owned interaction registry
- register outgoing Slack controls with TTL and authorization metadata
- parse Socket Mode interactive payloads
- route submitted interactions to Nex commands, agent actions, jobs, or
  approvals
- support ephemeral replies and message updates
- add unit and cleanroom proof coverage

## Acceptance

1. buttons and selects can be sent and later resolved to the registered Nex
   action
2. modals can be opened and submitted
3. approval prompts can be accepted or rejected from Slack
4. expired or unauthorized interactions fail closed
5. validation demonstrates an agent-use path through native Slack controls

## Progress

The Slack adapter implementation has landed in
`/Users/tyler/nexus/home/projects/nexus/packages/adapters/slack` with:

- component payload support on `slack.send`
- adapter-owned interaction registrations
- Socket Mode interactive payload ingest
- button/select accepted and denied records
- modal open/submission/closed records
- package rebuild and method catalog projection

Validation completed:

- `go test ./...`
- `./scripts/package-release.sh`
- `nexus adapters packages methods slack --json` confirmed the published method
  catalog includes `payload.components`

Remaining gate:

- live cleanroom or agent-use proof for one native Slack control flow
