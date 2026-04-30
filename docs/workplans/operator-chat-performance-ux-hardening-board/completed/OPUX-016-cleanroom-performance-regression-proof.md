---
summary: "Close the next performance pass with a cleanroom golden journey and regression metrics."
title: "OPUX-016 - Cleanroom Performance Regression Proof"
---

# OPUX-016 - Cleanroom Performance Regression Proof

## Closeout

Status: completed on 2026-04-29.

Docker was restarted and the cleanroom capture passed from a fresh substrate.
The proof bundle is:

- `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260429T174053Z`

The run produced reviewable full-session video, screenshots, trace, runtime
logs, Playwright output, and structured performance metrics. The golden journey
covered neutral Chat entry, manager lane selection, linked public context,
action creation/invocation, approval resolution, manager send/reply, worker
lane expansion and send/reply, delivery target switching, sparse replay
recovery, and large-transcript scroll proof.

Measured values:

- `/app/console/chat` ready: `820ms`
- manager lane visible after ready: `13ms`
- context sheet open: `67ms`
- document overflow after manager open: `0px`
- large transcript reload ready: `610ms`
- transcript programmatic scroll exercise: `52.3ms`
- transcript wheel-scroll delta: `968px`

Harness fixes needed for the passing proof:

- cleanroom console proxy now forwards WebSocket upgrade traffic
- cleanroom seed sessions use the `operator_chat` origin expected by the
  runtime projection
- Console bundle was rebuilt after URL lane-selection and embedded Chat changes
- embedded Nex project expansion now rehydrates already-expanded empty worker
  lane groups without collapsing them

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
