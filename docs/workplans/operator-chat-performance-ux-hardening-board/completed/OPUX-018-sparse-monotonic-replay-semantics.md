---
summary: "Make chat replay tolerate sparse monotonic chat event sequences without forcing unnecessary snapshot reset."
title: "OPUX-018 - Sparse Monotonic Replay Semantics"
---

# OPUX-018 - Sparse Monotonic Replay Semantics

## Why

The durable `chat_events.sequence` value is monotonic, but it is not gapless.
SQLite sequence allocation and ignored duplicate projections can skip row ids.
The runtime and client recovery paths currently treat legitimate sequence jumps
as missing replay data, which can force slow snapshot recovery and make replies
appear late or only after reload.

## Required Outcomes

- `chat.replay` returns events ordered by sequence without requiring gapless row
  ids.
- Replay reset is reserved for real retention/window loss, not skipped sequence
  values.
- The forked client treats sequence gaps as a reason to call `chat.replay`, but
  accepts replay responses that advance across sparse sequence values.
- Echo send/reply reconciliation does not depend on a full snapshot when replay
  can return all stored events after the last applied sequence.

## Scope

Owned surfaces:

- `/Users/tyler/nexus/home/projects/nexus/nex/src/api/chat-projection.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/api/server-methods/chat.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/nex/chat-adapter.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/store.ts`

Do not renumber persisted events or introduce a compatibility replay bridge.
The chat event sequence remains the durable monotonic ordering value.

## Acceptance

- A replay request after a known sparse sequence returns later events with
  `reset_required = false` when the rows are still retained.
- The client can recover from a live event sequence jump by replaying later
  events rather than discarding chat state.
- Existing duplicate-message dedupe continues to work for optimistic sends,
  replayed events, and refreshed snapshots.

## Validation

- Focused runtime tests for sparse replay sequences.
- Focused client/store tests for gap-triggered replay recovery.
- One controlled Echo send/reply proof after replay recovery is fixed.

## Dependencies

- OPUX-014 for deterministic selected-lane URL state during browser proof.

## Closeout

Replay recovery now treats `chat_events.sequence` as durable monotonic order,
not a gapless counter. `chat.replay` only requires a reset when no retained
events exist after the requested sequence while the server has advanced beyond
that sequence. Sparse replay batches now count as progress.

Validation:

- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/nex test -- --run src/api/server-methods/chat.test.ts src/capabilities/chat/index.test.ts`
- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app test -- --run src/nex/chat-adapter.test.ts src/store.test.ts src/orchestrationRecovery.test.ts`
- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app typecheck`
