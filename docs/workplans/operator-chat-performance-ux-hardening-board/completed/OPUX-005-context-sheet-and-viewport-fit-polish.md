---
summary: "Keep Nex context useful but auxiliary, and ensure the chat workspace fits the viewport."
title: "OPUX-005 - Context Sheet And Viewport Fit Polish"
---

# OPUX-005 - Context Sheet And Viewport Fit Polish

## Why

Nex-only context is important, but the default workspace should still feel like
upstream t3code and fit inside the console viewport.

## Required Outcomes

- no normal chat view requires browser page-level scrolling
- context sheet opens deliberately and fits available space
- composer, transcript, and header do not overlap
- delivery/context controls remain discoverable

## Planned Changes

- audit embedded shell height and overflow ownership
- keep context in the explicit sheet by default
- tighten responsive breakpoints for console embedding

## Current Progress

- Console now gives Chat a fixed viewport-height content area instead of
  allowing page-level overflow
- the embedded t3code shell now uses host-owned `h-full` sizing instead of
  standalone viewport wrappers
- stale `lane` query params are cleared when leaving Chat through console tab
  navigation, while direct Chat deep links remain supported
- cleanroom proof verifies the context sheet opens with an internal scroll
  viewport and that the normal chat view has `0px` document overflow after the
  manager lane opens

## Exit Criteria

- viewport fit is stable in cleanroom screenshots
- context sheet can open, scroll internally, and close without disturbing the
  transcript

## Validation

- operator-console Playwright screenshots
- cleanroom recording review
- passed cleanroom bundle:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260427T161830Z`
- screenshots:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260427T161830Z/screenshots/02-operator-chat-initial-state.png`
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260427T161830Z/screenshots/05-operator-chat-manager-send-reply.png`
- metrics:
  `document_overflow_after_manager_open = 0px`,
  `context_sheet_open = 97ms`
