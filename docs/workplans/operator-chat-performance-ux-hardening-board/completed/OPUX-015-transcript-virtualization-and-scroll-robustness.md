---
summary: "Keep t3code transcript scroll native and responsive with large Nex session histories."
title: "OPUX-015 - Transcript Virtualization And Scroll Robustness"
---

# OPUX-015 - Transcript Virtualization And Scroll Robustness

## Closeout

Status: completed on 2026-04-29.

The seeded cleanroom large-history path passed without a transcript scroll
rewrite. The upstream t3code scroll container remained the owner of transcript
scrolling, page-level document overflow stayed at `0px`, and selected history
is bounded by the lane timeline/read-model windowing work from OPUX-011 and
OPUX-020.

Proof bundle:

- `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260429T174053Z`

Relevant metrics:

- large transcript reload ready: `610ms`
- transcript scroll height: `12,158px`
- transcript programmatic scroll exercise: `52.3ms`
- transcript wheel-scroll delta: `968px`
- document overflow after manager open: `0px`

## Why

The operator reported that they could not scroll. That usually means too many
DOM rows, broken height ownership, or scroll anchoring fighting the composer.
The transcript should behave like upstream t3code while reading large Nex
session histories.

## Required Outcomes

- Transcript owns its own scroll container; page-level browser scrolling is not
  required for normal chat use.
- Large transcript histories are virtualized or cursor-paginated.
- Bottom anchoring and jump-to-bottom behavior remain upstream-like.
- Markdown/tool-heavy rows do not re-render when unrelated lane metadata
  changes.

## Scope

Owned surfaces:

- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/components/ChatView.tsx`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/components/MessagesTimeline.tsx`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/nex/chat-adapter.ts`
- Console embed sizing surfaces if host height ownership is still involved.

## Acceptance

- Seeded large transcript scrolls smoothly in the browser probe.
- Composer remains visible and does not overlap transcript content.
- Programmatic and wheel scroll measurements stay inside the validation budget.

## Validation

- Browser probe over a seeded large transcript.
- Chat package tests/build.
- Cleanroom proof captures large-history scroll evidence.

## Dependencies

- OPUX-010 for bounded windows.
- OPUX-011 for stable ledger-backed message ids.
