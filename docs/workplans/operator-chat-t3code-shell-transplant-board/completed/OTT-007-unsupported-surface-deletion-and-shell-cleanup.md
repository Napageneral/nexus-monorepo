# OTT-007 Unsupported Surface Deletion And Shell Cleanup

## Goal

Delete unsupported upstream product surfaces from the fork so the preserved
shell only exposes truthful Nex operator chat behavior.

## Why

The fork should not carry dead worktree, git, terminal, diff, or PR chrome
that implies product capabilities we do not support.

## Scope

- remove open-in-editor controls
- remove git action controls and PR surfaces
- remove terminal drawer and terminal-specific helpers
- remove diff, checkpoint, and worktree surfaces
- remove any remaining route, store, test, or utility code that only existed
  for those deleted product concepts

## Implementation Notes

- deletion is the intended end state, not a temporary phase
- if a preserved shell primitive depends on an unsupported feature, fork the
  primitive and remove the unsupported branch rather than leaving dormant code

## Acceptance

- no unsupported controls remain visible in the transplanted shell
- dead unsupported feature code no longer defines the fork architecture
- the shell reads as a focused operator chat product rather than a disabled
  coding IDE

## Validation

- package build and test pass
- browser proof shows no unsupported controls in the active shell

## Current Result

- active thread/worktree/terminal/diff controls have been removed from the
  transplanted shell
- the send-stop control no longer advertises new-thread or worktree behavior
- unsupported CSS residue for terminal, diff, and reasoning-selector surfaces
  has been removed from the active app stylesheet
- the recorded cleanroom proof at
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260407T195221Z`
  now provides browser-proof evidence for the cleaned shell with no unsupported
  controls visible in the active UI
