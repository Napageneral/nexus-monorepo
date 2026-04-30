---
summary: "Add lane-global paged history while preserving the active session as the send and continuation target."
title: "OPUX-020 - Lane-Global History Timeline"
---

# OPUX-020 - Lane-Global History Timeline

## Why

The selected Echo lane currently shows the active operator-chat session window.
Older Echo history exists across prior sessions and chat events, but selecting
Echo does not expose a lane-global paged timeline. Operators need lane-level
continuity without losing the active session target used by `chat.send`.

## Required Outcomes

- A selected lane can expose lane-global history across prior lane sessions.
- The active session remains the send and continuation target for new operator
  input.
- Older history is paged by a stable cursor rather than loaded as one unbounded
  transcript.
- Message rows keep stable links to canonical records when those records exist.

## Scope

Owned surfaces:

- `/Users/tyler/nexus/home/projects/nexus/nex/src/api/chat-projection.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/api/server-methods/chat.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/capabilities/chat/index.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/nex/chat-types.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/nex/chat-adapter.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/store.ts`

Do not overload active-session transcript reads until they become ambiguous.
Add an explicit lane timeline/read side for lane-global history.

## Acceptance

- Selecting Echo shows a recent lane-global history page when requested by the
  UI contract.
- `chat.send` still resolves and continues the active Echo session.
- Older lane history can be fetched without rendering every historical row.
- Existing active-session transcript behavior remains available for worker
  lanes where session-scoped inspection is the right product shape.

## Validation

- Runtime tests covering active-session transcript reads and lane-global history
  reads separately.
- Chat adapter/store tests for paged older lane history.
- Browser proof that Echo selection can show older lane history without
  duplicating the active session tail.

## Dependencies

- OPUX-018 for replay recovery during history paging.
- OPUX-019 for selected snapshot cost reduction before larger history proof.

## Closeout

Agent-lane selected reads can now request lane-global history explicitly while
keeping active-session reads available. The UI adapter requests lane-global
history for agent lanes and still leaves the active session as the `chat.send`
continuation target. Runtime reads page across top-level operator-chat sessions
for the lane's agent, dedupe turn ids, preserve record links from message
metadata, and keep the existing cursor contract for older history.

Validation:

- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/nex test -- --run src/api/server-methods/chat.test.ts src/capabilities/chat/index.test.ts`
- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app test -- --run src/nex/chat-adapter.test.ts src/store.test.ts src/orchestrationRecovery.test.ts`
- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app typecheck`
- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/nex build`
- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app build`
- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app build`
- runtime-served `/app/console/chat?lane=lane%3Aagent%3Aentity-assistant`
  now serves a rebuilt bundle containing `include_child_lanes`,
  `message_history_scope`, `initialLaneId`, and `onLaneSelectionChange`
