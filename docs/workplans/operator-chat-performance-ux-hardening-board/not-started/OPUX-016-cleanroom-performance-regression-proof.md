---
summary: "Close the next performance pass with a cleanroom golden journey and regression metrics."
title: "OPUX-016 - Cleanroom Performance Regression Proof"
---

# OPUX-016 - Cleanroom Performance Regression Proof

## Why

This pass is complete only when the fixed behavior is proven in a cleanroom
with reviewable video and structured metrics, not only live dogfood.

## Required Outcomes

- Cleanroom proof includes the OPUX-008 metrics JSON.
- Golden journey covers neutral Chat entry, lane selection, Echo send/reply,
  manager-first sidebar expansion, context sheet, and large-history scroll.
- Proof records bundle size, first usable state, snapshot payload size,
  selected transcript paint, and scroll responsiveness.
- Board and validation ladder point to the latest proof bundle.

## Scope

Owned surfaces:

- `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-chat-cleanroom-capture.sh`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/e2e/07-operator-chat.spec.ts`
- `/Users/tyler/nexus/home/projects/nexus/docs/validation/operator-chat-performance-ux-validation-ladder.md`
- This board.

## Acceptance

- Cleanroom proof passes from a fresh substrate.
- Primary recording and metrics are linked from the validation ladder.
- Any remaining live-dogfood-only issue is captured as a new ticket rather than
  hidden in closeout prose.

## Validation

- `bash /Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-chat-cleanroom-capture.sh`

## Dependencies

- OPUX-008 through OPUX-015.
