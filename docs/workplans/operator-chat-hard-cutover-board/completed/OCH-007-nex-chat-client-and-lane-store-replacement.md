# OCH-007 Nex Chat Client And Lane Store Replacement

## Goal

Replace upstream orchestration assumptions in the fork with a Nex-native chat
client and lane-oriented client store.

## Why

The surviving microfrontend should consume the Nex `chat.*` contract directly.
It should not preserve stock `t3code` orchestration semantics as the client
authority.

## Scope

- bootstrap the client from `chat.snapshot`
- consume live `chat` websocket events
- implement replay recovery through `chat.replay`
- replace project and thread store shapes with lane-oriented store shapes
- keep UI-only discriminants inside the fork without leaking them into Nex
  canonical schemas

## Implementation Notes

- the stock orchestration seam lives in:
  - `src/nativeApi.ts`
  - `src/wsNativeApi.ts`
  - `src/wsRpcClient.ts`
  - `src/routes/__root.tsx`
  - `src/orchestrationRecovery.ts`
  - `src/orchestrationEventEffects.ts`
- these should be replaced end-to-end with a Nex-native client that:
  - loads `chat.snapshot`
  - subscribes to the `chat` event stream
  - performs replay recovery through `chat.replay`
- the core read-model rewrite seam is:
  - `src/store.ts`
  - `src/types.ts`
  - `src/session-logic.ts`
  - `src/threadSelectionStore.ts`
  - `src/hooks/useHandleNewThread.ts`
  - `src/hooks/useThreadActions.ts`
- the long-term state model is `lane + selected lane + lane detail +
  conversation context`, not project/thread/orchestration

## Acceptance

- the forked client can fully bootstrap from Nex chat runtime data
- the client can recover from sequence gaps through replay
- sidebar and transcript state are lane-oriented rather than project-oriented
  or thread-oriented

## Completion Notes

- the new microfrontend package now owns Nex-native chat types in
  `packages/apps/nex-operator-chat/app/src/types.ts`
- lane-oriented client state lives in
  `packages/apps/nex-operator-chat/app/src/store.ts`
- snapshot bootstrap and replay recovery now live in
  `packages/apps/nex-operator-chat/app/src/client.ts`
- the package exports a mountable microfrontend seam from
  `packages/apps/nex-operator-chat/app/src/mount.tsx` and
  `packages/apps/nex-operator-chat/app/src/index.ts`
- the mount seam is shadow-root safe, allowing the operator console host to
  isolate microfrontend styles without opening a second runtime connection
- a demo bridge remains in place in `src/demo.ts` and `src/main.tsx` for local
  package development alongside the real console host

## Validation

- `pnpm build`
- `pnpm test`

## Notes

- replay recovery is covered by targeted controller tests in
  `packages/apps/nex-operator-chat/app/src/client.test.ts`
- lane-oriented store hydration and event application are covered in
  `packages/apps/nex-operator-chat/app/src/store.test.ts`
