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
- compile simple interactive reply authoring into Slack buttons or selects
- parse Socket Mode interactive payloads
- route submitted interactions to Nex commands, agent actions, jobs, or
  approvals
- support ephemeral replies, positive confirmations, and message updates
- preserve richer Slack input metadata for users, channels, conversations,
  dates, times, numbers, emails, URLs, and rich text
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
- 2026-05-01 live agent-use proof:
  - sent a real `components.choices` Slack prompt through `slack.send` on
    connection `vrtly-slack`
  - clicked `Approve` in the Spike DM through Slack Desktop
  - Slack updated the source message to `Recorded Approve from @Tyler Brandt:
    approved`
  - Slack posted ephemeral `Recorded.`
  - Nex ingested accepted record
    `slack:interaction:TVD7H762K:D0AKLUMT5NF:nxs:c:df5e9c3cef4ba5235a68feaf716a179b:1777659422.491276`
    with `approval_id=slack-validation-20260501`,
    `approval_decision=approve`, and `callback_data=approved`

OpenClaw carryovers completed:

- interactive reply authoring through compact `components.choices`
- positive ephemeral feedback and source-message cleanup
- approval action metadata on button controls and interaction records
- richer input parsing for Slack users, channels, conversations, date/time, and
  rich text
- slash commands left as a future Nex command-gateway decision, not a
  Slack-only adapter runtime
