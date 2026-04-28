---
summary: "Make chat.snapshot shallow by default and lazy-load worker lanes, selected transcript windows, approvals, and context detail."
title: "OPUX-010 - Shallow Snapshot And Lazy Lane Detail"
---

# OPUX-010 - Shallow Snapshot And Lazy Lane Detail

## Why

The default Chat tab does not need every worker lane, approval, public-context
record, or historical transcript row before the operator sees manager lanes.
The initial snapshot should be a lightweight read model.

## Required Outcomes

- Default `chat.snapshot` returns manager/agent lane summaries and selected
  lane summary only.
- Worker/subagent lanes are fetched when an agent is expanded or deep-linked.
- Selected lane messages return as a bounded recent window with a cursor for
  older history.
- Approvals, delivery detail, and linked public context are loaded as selected
  lane detail, not global first-paint payload.

## Scope

Owned surfaces:

- `/Users/tyler/nexus/home/projects/nexus/nex/src/api/chat-projection.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/api/server-methods/chat.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/nex/chat-adapter.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/components/Sidebar.tsx`

Do not introduce compatibility shims or duplicate canonical state. Nex remains
the source of truth.

## Acceptance

- Default snapshot payload excludes unexpanded worker detail.
- Expanding an agent loads and renders its worker lanes.
- Deep-linked worker lane still opens with enough parent context for
  orientation.
- Existing replay semantics remain monotonic and gap-aware.

## Validation

- `pnpm vitest run src/api/chat-projection.test.ts src/api/server-methods/chat.test.ts src/storage/agents.chat-projection.test.ts`
- Chat package typecheck/build.
- OPUX-008 browser probe showing first-lane paint before worker detail load.

## Dependencies

- OPUX-008 for payload and timing baseline.
