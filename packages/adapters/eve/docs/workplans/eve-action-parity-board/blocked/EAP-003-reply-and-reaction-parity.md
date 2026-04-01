# EAP-003 Reply And Reaction Parity

## Goal

Add provider-native replies and tapback reactions so Eve can match real
iMessage conversational behavior.

## Execution Class

private-API-required

## Blocker

This ticket is blocked until a dedicated private-API parity host is available.

Reply threading to a specific provider message and tapback mutation both sit
outside the AppleScript-reachable Messages surface Eve is willing to treat as
canonical.

## Scope

- reply execution by message id or provider-native reference
- reaction add and reaction remove execution
- durable confirmation through watcher-observed message or reaction events
- capability truth and failure truth for unsupported executor states

## Acceptance

- `imessage.reply` works end to end
- `imessage.reaction.add` and `imessage.reaction.remove` work end to end
- replies and reactions reconcile through the durable ingest path
- unsupported paths fail clearly instead of silently pretending support

## Validation

- real self-loop reply proof
- real self-loop reaction add and remove proof
- cleanroom canonical proof of the resulting events
- `git diff --check`
