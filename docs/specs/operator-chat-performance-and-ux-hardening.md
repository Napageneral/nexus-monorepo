---
summary: "Target-state performance and UX rules for the Nex-owned t3code operator chat fork."
title: "Operator Chat Performance And UX Hardening"
---

# Operator Chat Performance And UX Hardening

## Purpose

The operator Chat tab must feel like upstream t3code while reading real Nex
manager, worker, session, approval, delivery, and public-context data.

The target state is not a custom redesign. The target state is:

- upstream t3code shell behavior preserved by default
- Nex data adapted through thin bridge/read-model seams
- initial load bounded by lightweight lane summaries
- selected-lane detail loaded only when needed
- smooth scroll under large transcripts and large lane sets
- Nex-only context kept auxiliary and explicitly opened

## Performance Rules

The Chat tab must not block first paint on full historical projection work.

The default `/chat` load should fetch:

- lane summaries
- selected lane identity if one is explicit
- minimal selected-lane transcript detail
- enough metadata for sidebar status, delivery state, and approval indicators

The default `/chat` load should not fetch or regenerate:

- every message for every lane
- all approval history for every lane
- linked public records for every lane
- full replay event history when a fresh snapshot is sufficient

## Sidebar Rules

The left rail keeps upstream project/thread grammar, but Nex remaps the nouns:

- upstream project row means directly chatable agent
- upstream thread row means worker/subagent lane
- the agent row is primary and selectable
- worker/subagent lanes stay collapsed by default
- the expand affordance appears as an intentional secondary control

Most operators should see a manager/agent list first. Reaching worker lanes
should require an explicit expansion or deep link.

## Transcript Rules

The selected transcript must stay scrollable and responsive with large session
history.

The UI should:

- virtualize older rows
- keep the active tail responsive
- avoid re-rendering unchanged markdown rows during lane metadata updates
- avoid forced layout loops while scrolling
- preserve upstream auto-scroll and jump-to-bottom behavior

## Context Rules

Nex-only lane workspace details, approvals, selected delivery, and linked
public context are important, but they must not dominate the default layout.

The default chat workspace should visually read like upstream t3code. Context
details belong in explicit auxiliary surfaces such as the Context sheet.

## Validation Rules

Performance validation must be cleanroom-backed and measurable.

The proof must include:

- runtime timing for `chat.snapshot`
- browser timing for `/chat` first usable state
- scroll responsiveness over a large seeded transcript
- sidebar behavior with many manager and worker lanes
- evidence that the upstream shell shape remains recognizable

Live dogfood review remains useful, but it is secondary to the cleanroom proof.
