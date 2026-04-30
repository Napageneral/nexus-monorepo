---
summary: "Restore selected-lane full-history semantics through the agents session ledger with stable message ids and live-event dedupe."
title: "OPUX-011 - Ledger-Backed History And Live Event Dedupe"
---

# OPUX-011 - Ledger-Backed History And Live Event Dedupe

## Why

The operator has seen partial history, duplicated sent messages, and messages
that do not produce the expected reply. The selected lane transcript must be a
projection of the agents session ledger with stable identity and predictable
live-event reconciliation.

## Required Outcomes

- Selected lane transcript reads from the agents session ledger as the primary
  execution history.
- Human-visible session messages carry stable ids that the UI can use to dedupe
  optimistic sends, replayed events, and refreshed snapshots.
- The UI can load older history by cursor while keeping the latest window
  visible by default.
- Sending a message produces one optimistic row, one durable ledger row, and
  one assistant reply path when the runtime replies.

## Scope

Owned surfaces:

- `/Users/tyler/nexus/home/projects/nexus/nex/src/api/chat-projection.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/api/server-methods/chat.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/api/server-methods/agent-session-send.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/nex/chat-adapter.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/components/ChatView.tsx`

Records remain the durable memory/public substrate for human-visible
utterances. Streaming progress stays in chat events.

## Acceptance

- Echo lane and manager/worker lanes show the expected recent transcript after
  refresh.
- Sending a test message does not duplicate bubbles.
- Assistant replies appear when the underlying lane/session produces them.
- Older history can be loaded without rendering all historical rows at once.

## Validation

- Focused chat server tests for send, snapshot, replay, and dedupe.
- Browser probe scenario that sends through Echo and verifies exactly one user
  row and one assistant row.
- Cleanroom golden journey update after OPUX-016.

## Dependencies

- OPUX-010 for bounded transcript windows.

## Active Notes

- Started after OPUX-010 closed with shallow default snapshots and bounded
  selected-lane message windows.

## Closeout

- Completed on 2026-04-28.
- Selected-lane transcript now reads from the agents session ledger only;
  canonical record rows remain available through linked conversation context,
  not as duplicate transcript messages.
- `chat.snapshot` supports `before_message_cursor` for older ledger pages, and
  the fork can prepend older message pages without replacing the visible latest
  window.
- User messages use stable client ids when present so optimistic sends,
  snapshots, and replayed events dedupe to one visible bubble.
- Browser proof selected Echo, hydrated the ledger transcript, verified no
  `record:` transcript rows, and confirmed the OPUX-011 smoke pair rendered as
  exactly one user row plus one assistant row.
- Browser send proof sent
  `operator chat ui send smoke 2026-04-28T19:59:17.955Z`; a refreshed Echo
  lane showed exactly one user row and one assistant row:
  `Smoke test received: 2026-04-28T19:59:17.955Z`.

## Verification

- `pnpm vitest run src/api/server-methods/chat.test.ts`
- `pnpm vitest run src/nex/chat-adapter.test.ts src/store.test.ts`
- `pnpm build` in `/Users/tyler/nexus/home/projects/nexus/nex`
- `pnpm build` in `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app`
- `pnpm build` in `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app`
- `pnpm exec tsx scripts/sync-operator-console-package.ts`
- `nexus runtime restart`
- `node scripts/operator-chat-perf-probe.mjs`
