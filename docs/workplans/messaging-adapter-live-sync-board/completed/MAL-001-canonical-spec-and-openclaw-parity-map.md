# MAL-001 Canonical Spec And OpenClaw Parity Map

## Goal

Capture the target state for messaging adapter live sync and native
interactions, then anchor the OpenClaw comparison in the durable Nex corpus.

## Current Gap

The OpenClaw comparison exists in chat context, but not in the repo corpus.
The existing adapter fleet board has narrower Slack and Discord tickets and
does not describe the combined durable-sync plus rich-live target state.

## Scope

- add a canonical messaging adapter live-sync and interactions spec
- add this execution board
- record the current OpenClaw comparison outcome
- connect the old fleet ticket to this board

## Acceptance

1. canonical spec exists under `docs/specs/platform/`
2. board exists under `docs/workplans/`
3. ticket order captures Slack live events, Slack interactions, Discord
   gateway supervision, Discord interactions, and validation
4. old fleet ticket points to this board for the messaging-specific execution
   pass

## Validation

- `git diff --check`
- docs links resolve by path

## Completed

- Added `/Users/tyler/nexus/home/projects/nexus/docs/specs/platform/messaging-adapter-live-sync-and-interactions.md`.
- Added `/Users/tyler/nexus/home/projects/nexus/docs/workplans/messaging-adapter-live-sync-board/`.
- Linked the existing fleet messaging ticket to this board.

Validation run:

- `git diff --check`
