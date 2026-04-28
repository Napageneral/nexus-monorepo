# AFEA-012 Messaging Adapter Idempotency And Revisions

## Goal

Make messaging adapters explicit about idempotency, restart behavior, edits,
deletes, and media claims.

## Current Gap

Telegram offsets are process-local. Discord live ingest handles message
creation but not edits/deletes as revisions. WhatsApp avoids full-history live
sync, but its media capability is overstated relative to send behavior.

Primary files:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/telegram/src/adapter.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/discord/src/adapter.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/whatsapp/src/adapter.ts`

## Scope

- persist Telegram `update_id + 1` per connection
- define and implement duplicate suppression for Telegram restart replay
- define revision semantics for Discord edits and deletes
- align WhatsApp declared capabilities with implemented send/media behavior
- add monitor restart and duplicate proof bundles

## Acceptance

1. Telegram monitor restart is durable and duplicate-safe
2. Discord edits/deletes are either emitted as revisions or truthfully declared
   out of scope
3. WhatsApp capability metadata matches implemented behavior
4. validation docs cover restart, duplicate, and media/attachment behavior

