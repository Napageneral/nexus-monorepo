---
summary: "Keep t3code transcript scroll native and responsive with large Nex session histories."
title: "OPUX-015 - Transcript Virtualization And Scroll Robustness"
---

# OPUX-015 - Transcript Virtualization And Scroll Robustness

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
