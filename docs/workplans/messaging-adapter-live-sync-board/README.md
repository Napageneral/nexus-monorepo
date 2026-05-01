# Messaging Adapter Live Sync Board

This board tracks the OpenClaw-informed hardening pass for Slack and Discord
inside Nex.

Canonical inputs:

- `/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/platform/messaging-adapter-live-sync-and-interactions.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/adapter-full-surface-compliance-standard.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/adapter-validation-proof-ladder.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-fleet-efficiency-audit-board/README.md`
- `/Users/tyler/nexus/home/projects/openclaw/extensions/slack/src/monitor/provider.ts`
- `/Users/tyler/nexus/home/projects/openclaw/extensions/discord/src/monitor/gateway-supervisor.ts`

## Purpose

Keep Nex's durable adapter sync model, then add the strongest OpenClaw-style
live behavior on top:

- Slack live edit and delete records
- Slack native interaction controls
- Discord gateway supervision and clearer monitor health
- Discord native component and modal handling
- provider-aware rate-limit scheduling
- cleanroom, hosted, and agent-use validation

## Status Snapshot

OpenClaw was pulled to `e311ffdcb94e760796a0a8a2c7e58fb8223678bf` on
2026-04-30. The comparison found that Nex is stronger for durable cursor-based
backfill and restart catch-up, while OpenClaw is stronger for live provider
runtime behavior and native interaction surfaces.

The target state is captured in:

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/platform/messaging-adapter-live-sync-and-interactions.md`

## Ticket Order

1. [MAL-001 Canonical Spec And OpenClaw Parity Map](/Users/tyler/nexus/home/projects/nexus/docs/workplans/messaging-adapter-live-sync-board/completed/MAL-001-canonical-spec-and-openclaw-parity-map.md)
2. [MAL-002 Slack Live Edit And Delete Revisions](/Users/tyler/nexus/home/projects/nexus/docs/workplans/messaging-adapter-live-sync-board/completed/MAL-002-slack-live-edit-and-delete-revisions.md)
3. [MAL-003 Slack Native Interactions](/Users/tyler/nexus/home/projects/nexus/docs/workplans/messaging-adapter-live-sync-board/not-started/MAL-003-slack-native-interactions.md)
4. [MAL-004 Discord Gateway Supervision](/Users/tyler/nexus/home/projects/nexus/docs/workplans/messaging-adapter-live-sync-board/completed/MAL-004-discord-gateway-supervision.md)
5. [MAL-005 Discord Components And Modals](/Users/tyler/nexus/home/projects/nexus/docs/workplans/messaging-adapter-live-sync-board/not-started/MAL-005-discord-components-and-modals.md)
6. [MAL-006 Messaging Adapter Validation Ladder](/Users/tyler/nexus/home/projects/nexus/docs/workplans/messaging-adapter-live-sync-board/not-started/MAL-006-messaging-adapter-validation-ladder.md)

## Status

- [Blocked](/Users/tyler/nexus/home/projects/nexus/docs/workplans/messaging-adapter-live-sync-board/blocked/README.md)
- [Completed](/Users/tyler/nexus/home/projects/nexus/docs/workplans/messaging-adapter-live-sync-board/completed/README.md)
- [In Progress](/Users/tyler/nexus/home/projects/nexus/docs/workplans/messaging-adapter-live-sync-board/in-progress/README.md)
- [Not Started](/Users/tyler/nexus/home/projects/nexus/docs/workplans/messaging-adapter-live-sync-board/not-started/README.md)
