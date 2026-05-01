# MAL-005 Discord Components And Modals

## Goal

Finish Discord-native components, modals, approvals, and command fallback
controls for Nex agents.

## Current Gap

OpenClaw has richer Discord component and modal support, including command
controls, approval flows, parsed modal/select values, and voice-adjacent
interaction surfaces. Nex Discord has an adapter-owned interaction store and
component send registration, but the interaction runtime still needs a complete
validation-backed pass.

## Scope

- complete reusable controls and TTL handling
- support buttons, selects, and modals
- route component submissions to Nex actions, jobs, or approvals
- validate authorization checks
- support message updates after interaction completion
- add agent-use proof through the production adapter seams

## Acceptance

1. buttons and selects resolve to registered Nex actions
2. modals open, submit, and project structured values
3. approval prompts fail closed when expired or unauthorized
4. component state survives restart where required by the interaction contract
5. cleanroom agent-use proof demonstrates the native Discord interaction path
