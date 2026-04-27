---
summary: "Reconnect the restored upstream shell to Nex through a thin runtime bridge and read-model adapter instead of broad shell rewrites."
title: "OTF-004 - Nex-Native Runtime Bridge And Read-Model Adapter"
---

# OTF-004 - Nex-Native Runtime Bridge And Read-Model Adapter

## Why

Upstream shell preservation only works if Nex integration is localized.

## Required Outcomes

- Nex replaces upstream runtime ownership through a focused bridge seam
- Nex `chat.*` data is adapted into fork-local UI state with minimal shell
  edits
- lane, approval, delivery, and linked public context data are all hydrated
  through the adapter layer

## Completion Evidence

- Nex runtime ownership is localized in the fork bridge and adapter seams under
  `src/nex/`, `src/nativeApi.ts`, `src/wsNativeApi.ts`, and `src/wsRpcClient.ts`
- the bridge feeds upstream-shaped snapshot, replay, send, approval, delivery,
  and lane-action state into the preserved shell
- selected-lane detail hydration now goes lane-specific when a deep link or
  explicit selection needs worker/session detail
- the recorded cleanroom proof boots, sends, approves, switches delivery, and
  recovers replay through Nex `chat.*`

## File Ownership

Primary ownership for this ticket:

- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/nativeApi.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/wsNativeApi.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/store.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/router.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/api/server-methods/chat.ts`

## Planned Changes

- replace upstream backend ownership with Nex `chat.*` bridge ownership
- translate Nex snapshot, replay, and event data into the fork-local state
  model expected by preserved upstream shell surfaces
- keep identifier translation and route translation localized instead of
  spreading Nex-specific state concerns across the shell
- preserve upstream reconnect and recovery expectations as closely as possible

## Exit Criteria

- the restored shell can boot from Nex data without a custom shell rewrite
- replay and reconnect behavior still work
- the state bridge is thin and auditable rather than a second local product
  model

## Validation

- `pnpm vitest run src/api/chat-projection.test.ts src/api/server-methods/chat.test.ts src/storage/agents.chat-projection.test.ts`
- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app typecheck`
- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app build`
- `bash /Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-chat-cleanroom-capture.sh`
