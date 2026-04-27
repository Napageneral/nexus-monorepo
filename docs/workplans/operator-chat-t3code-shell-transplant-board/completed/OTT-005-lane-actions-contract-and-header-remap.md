# OTT-005 Lane Actions Contract And Header Remap

## Goal

Preserve the upstream action-control pattern and remap it to Nex-native lane
actions.

## Why

The upstream action bar is one of the few high-value header surfaces worth
keeping.
Its semantics need to become truthful for agents and lanes rather than shell
scripts and worktrees.

## Scope

- extend the Nex operator-chat contract to expose lane actions
- remap the upstream project-script control to lane-action creation, editing,
  deletion, and invocation
- support primary and secondary action rendering inside the header
- support action invocation modes that either prefill the composer or invoke
  immediately

## Implementation Notes

- lane actions attach to agent groups and resolve into the selected lane detail
- keep the upstream button, dropdown, and dialog patterns where possible
- lane actions are Nex-native prompt and task launchers, not shell commands

## Acceptance

- the header visibly preserves the upstream action-control pattern
- operators can create, edit, delete, and invoke lane actions
- invoked actions behave truthfully against the selected lane and agent group

## Validation

- runtime contract coverage for lane actions
- UI proof for action creation and invocation

## Current Result

- Nex now exposes `chat.actions.create`, `chat.actions.update`,
  `chat.actions.delete`, and `chat.actions.invoke`
- lane actions are persisted durably, projected into lane detail, and replayed
  through `action.upserted` and `action.removed`
- the preserved header action-control pattern now creates, edits, deletes, and
  invokes lane actions truthfully through the runtime
- the recorded cleanroom proof at
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260407T195221Z`
  now exercises lane-action creation and invocation end to end against the
  transplanted shell
