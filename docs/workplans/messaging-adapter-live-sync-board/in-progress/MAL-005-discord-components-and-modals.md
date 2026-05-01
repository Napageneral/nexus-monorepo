# MAL-005 Discord Components And Modals

## Goal

Finish Discord-native components, modals, approvals, and command fallback
controls for Nex agents.

## Current Gap

OpenClaw has richer Discord component and modal support, including command
controls, approval flows, parsed modal/select values, and voice-adjacent
interaction surfaces. Nex Discord has an adapter-owned interaction store and
component send registration, but the interaction runtime still needs a complete
validation-backed pass.

## Scope

- complete reusable controls and TTL handling
- support buttons, selects, and modals
- route component submissions to Nex actions, jobs, or approvals
- validate authorization checks
- support message updates after interaction completion
- add agent-use proof through the production adapter seams

## Acceptance

1. buttons and selects resolve to registered Nex actions
2. modals open, submit, and project structured values
3. approval prompts fail closed when expired or unauthorized
4. component state survives restart where required by the interaction contract
5. cleanroom agent-use proof demonstrates the native Discord interaction path

## Progress

The Discord adapter implementation has landed in
`/Users/tyler/nexus/home/projects/nexus/packages/adapters/discord` with:

- buttons and all supported select families on `discord.send`
- adapter-owned durable interaction store
- allowed-user, expiry, consumed, and reusable lifecycle enforcement
- modal trigger rendering through Discord's modal response path
- modal submission parsing into structured submitted values
- accepted/denied canonical inbound interaction records
- package rebuild and release artifact refresh

Validation completed:

- `pnpm test`
- `PATH="/Users/tyler/.nvm/versions/node/v22.22.0/bin:$PATH" ./scripts/package-release.sh`
- runtime `adapter.health` for local Discord connection
  `02a725fd-910c-494d-a32f-809094b6a6aa`

Remaining gate:

- Discord DIR-009 live cleanroom golden journey with an actual component send,
  monitor ingest, click/select, modal submission, and restart proof
