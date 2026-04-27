---
summary: "Prove and harden transcript scrolling with large selected-lane session history."
title: "OPUX-004 - Transcript Scroll And Virtualization Proof"
---

# OPUX-004 - Transcript Scroll And Virtualization Proof

## Why

The selected transcript must remain scrollable with real session history.

## Required Outcomes

- large transcript rows stay virtualized
- scrolling does not trigger repeated full markdown/layout work
- jump-to-bottom and auto-scroll still behave like upstream
- cleanroom proof includes a large-history scroll scenario

## Planned Changes

- profile `MessagesTimeline` under large transcript fixtures
- preserve upstream virtualization behavior where possible
- reduce unnecessary row invalidation from Nex metadata events
- add focused browser coverage for scroll responsiveness

## Current Progress

- embedded shell height ownership has been fixed so browser-page scrolling
  should no longer fight transcript scrolling
- cleanroom proof now seeds `80` additional manager turns, reloads the lane,
  and verifies transcript-owned programmatic and wheel scrolling
- latest passed proof measured `20,092px` transcript scroll height, `641px`
  transcript viewport height, `42.3ms` programmatic scroll exercise, and
  `1,060px` wheel-scroll delta
- page-level browser scroll remained at `0`

## Exit Criteria

- large seeded transcript can scroll smoothly in browser proof
- timeline virtualization tests remain green

## Validation

- chat timeline browser tests
- performance cleanroom scenario
- passed cleanroom bundle:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260427T161830Z`
- metrics:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260427T161830Z/operator-chat-performance-metrics.json`
- screenshot:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260427T161830Z/screenshots/06-operator-chat-large-transcript-scroll-proof.png`
