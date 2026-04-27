# OTT-004 Lane Workspace And Chat Shell Transplant

## Goal

Transplant the upstream chat workspace shell and remap it from stock thread
detail to Nex lane detail.

## Why

The main chat workspace is where the current fork looks least like upstream
`t3code`.
That gap must be closed with the real shell, not a local redesign.

## Scope

- transplant the upstream chat workspace shell, timeline, markdown, and
  composer layout
- remap the selected-workspace header to lane identity and run state
- render transcript messages, timeline activity, approvals, and linked public
  conversation context from Nex lane detail
- preserve the upstream provider and model picker and primary send-stop action
  treatment

## Implementation Notes

- keep the upstream structural shells for header, composer, timeline, menus,
  and panels
- replace thread-specific logic with lane-detail logic from Nex
- linked public conversation context should render in a dedicated auxiliary
  panel rather than inline with the execution transcript
- unsupported build-plan, worktree, and runtime-mode chrome should not remain
  as dead placeholders

## Acceptance

- the selected lane workspace visibly feels like real upstream `t3code`
- the transcript, approvals, and composer all render through upstream-derived
  shell primitives
- linked public conversation context is available without collapsing into the
  execution transcript

## Validation

- package-level component and integration tests
- browser proof for lane selection, transcript rendering, approvals, and send

## Current Result

- the selected lane workspace now renders through upstream-derived shell
  primitives for header, provider picker, composer actions, markdown, and the
  preserved lane-action bar
- transcript messages, approvals, runtime state, and linked public
  conversation context all render from Nex lane detail
- linked public conversation context is available in the auxiliary panel
  without collapsing into the execution transcript
- the recorded cleanroom proof at
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260407T195221Z`
  now demonstrates the transplanted lane workspace across action invocation,
  manager send, worker direct chat, approval resolution, delivery switching,
  and replay recovery
