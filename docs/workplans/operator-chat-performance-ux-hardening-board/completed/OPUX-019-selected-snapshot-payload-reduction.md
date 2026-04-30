---
summary: "Reduce selected manager snapshots by separating projection synchronization from cheap reads and avoiding recursive worker inclusion."
title: "OPUX-019 - Selected Snapshot Payload Reduction"
---

# OPUX-019 - Selected Snapshot Payload Reduction

## Why

Default no-lane Chat snapshots are now shallow and fast, but selecting a
manager lane can still return all recursive worker descendants and run too much
projection synchronization work. The latest Echo snapshot included over one
hundred worker lanes while returning only a small selected transcript window.

## Required Outcomes

- Selecting a top-level manager lane loads manager transcript and lane detail
  without recursively including every worker lane.
- Worker lanes load only on explicit expansion, search, or direct deep link.
- Snapshot reads avoid full projection synchronization when the lane directory
  is already current enough for a cheap selected-lane read.
- Snapshot payload metrics separately report root lanes, selected detail,
  direct worker summaries, and replay sequence.

## Scope

Owned surfaces:

- `/Users/tyler/nexus/home/projects/nexus/nex/src/api/chat-projection.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/api/chat-projection.test.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/api/server-methods/chat.test.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/nex/chat-adapter.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/components/Sidebar.tsx`

Do not hide worker lanes by dropping them from canonical state. This ticket only
changes when and how worker summaries are projected into selected snapshots.

## Acceptance

- A selected manager snapshot returns root manager lanes plus the selected
  manager detail, not the selected manager's full recursive worker set.
- Expanding a manager still loads and renders its worker lanes.
- Direct worker-lane deep links include enough parent context for orientation.
- Selected manager snapshot payload size and latency fall below the OPUX-016
  cleanroom budget.

## Validation

- Runtime projection tests for selected manager, expanded manager, and worker
  deep-link snapshots.
- Chat adapter/sidebar tests for worker expansion after shallow selected
  snapshots.
- OPUX-008 runtime/browser probe metrics.

## Dependencies

- OPUX-018 so selected snapshot recovery does not compensate for replay churn.

## Closeout

Selected snapshots now read cheaply when the requested lane is already present
in the projected lane directory. A selected manager lane includes root agent
lanes, the selected lane, and ancestor context by default instead of the full
recursive worker set. Direct child summaries are fetched through explicit
`include_child_lanes` expansion, and worker-lane deep links still include enough
parent context for orientation.

Live Echo snapshot metrics after rebuild and runtime restart:

- selected lane: `335ms`, `11708` bytes, `3` lanes, `0` worker lanes, `19`
  messages
- lane history selected read: `159ms`, `12434` bytes, `3` lanes, `0` worker
  lanes, `21` messages
- explicit child expansion: `158ms`, `115834` bytes, `115` lanes, `112`
  worker lanes

Validation:

- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/nex test -- --run src/api/server-methods/chat.test.ts src/capabilities/chat/index.test.ts`
- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app test -- --run src/nex/chat-adapter.test.ts src/store.test.ts src/orchestrationRecovery.test.ts`
- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app typecheck`
- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/nex build`
- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app build`
- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app build`
- `NEXUS_OPERATOR_CONSOLE_REUSE_PREBUILT=1 pnpm --dir /Users/tyler/nexus/home/projects/nexus/nex exec tsx scripts/sync-operator-console-package.ts`
- `nexus runtime restart`
