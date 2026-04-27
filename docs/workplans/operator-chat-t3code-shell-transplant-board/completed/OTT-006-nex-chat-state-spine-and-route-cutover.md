# OTT-006 Nex Chat State Spine And Route Cutover

## Goal

Replace the current custom `nex-operator-chat` state spine with an
upstream-derived shell backed directly by Nex `chat.*`.

## Why

Keeping the upstream shell while leaving the custom local state spine in place
would recreate the same partial-fork problem at a different layer.

## Scope

- replace the current custom controller and store with a fork-local state layer
  aligned to the upstream app structure
- bind route selection to lanes rather than stock threads
- map Nex snapshot, replay, live events, approvals, conversation context, and
  lane actions into the fork-local presentation model
- remove the remaining stock native-API and orchestration assumptions from the
  preserved shell

## Implementation Notes

- Nex remains the authority; the fork owns only presentation state
- do not reintroduce a second orchestration model under the shell
- the new state spine should preserve upstream shell ergonomics without
  preserving upstream product nouns

## Acceptance

- the shell boots and operates from Nex `chat.*`
- lane selection, transcript rendering, approvals, and conversation context all
  flow through the new state spine
- the old custom chat controller and store are retired

## Validation

- focused state-layer tests
- browser proof showing route selection, replay continuity, and lane actions

## Current Result

- the shell boots and operates directly from Nex `chat.snapshot`,
  `chat.replay`, `chat.send`, `chat.abort`, approval, delivery, and lane-action
  methods through the runtime bridge
- lane selection now round-trips through the `lane` query parameter rather than
  only bootstrapping from it once
- the active state spine is now the fork-local React runtime provider and
  Nex-backed state reducer in `chat-runtime.tsx` and `chat-state.ts`, not the
  retired custom controller/store stack described earlier in the board
- the upstream-style router and root-route shell are now the center of gravity
  for the active app structure
