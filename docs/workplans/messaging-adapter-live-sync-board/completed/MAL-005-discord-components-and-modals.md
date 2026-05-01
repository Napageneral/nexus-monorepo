# MAL-005 Discord Components And Modals

Status: completed on 2026-05-01.

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
- live Discord UI proof in Brandtty `#general` with button, select, modal
  trigger, and modal submission records linked to source message
  `1499812941581783232`
- Frontdoor catalog publication of `discord@0.1.3`
- hosted MoonSleep runtime install of `discord@0.1.3` with package health
  `active` and `healthy: true`
- hosted archive/restore restart proof with `discord@0.1.3` rehydrated
- local durable live-sync proof using `adapters.connections.livesync.enable`
  followed by runtime restart and Discord monitor auto-start

Closeout notes:

- Adapter closeout commit: `4aad96a`
- Adapter release commit: `8f54323`
- Umbrella/package-helper commit: `0ac7ab6c`
- Umbrella validation commit: `0139259d`
- Artifact:
  `/Users/tyler/nexus/home/projects/nexus/packages/adapters/discord/dist/discord-0.1.3.tar.gz`
- SHA-256:
  `fca3448fcf51c1f70fcefb26725c4783ad532b58de1186d1a1ec730ae8ad641c`
- The production package path now preserves manifest entrypoints and excludes
  generated release tarballs from staged `dist/`.
- Frontdoor install ledger reports hosted server `srv-1c4b077a-1f2` installed
  at active version `0.1.3`.
