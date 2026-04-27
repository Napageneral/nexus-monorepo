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
- focused chat browser tests are currently blocked by a missing local
  Playwright browser executable
- the ticket remains open until a browser or cleanroom proof exercises a
  large-history scroll scenario

## Exit Criteria

- large seeded transcript can scroll smoothly in browser proof
- timeline virtualization tests remain green

## Validation

- chat timeline browser tests
- performance cleanroom scenario
