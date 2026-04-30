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

The Chat tab must expose enough first-party timing data to distinguish:

- console shell first paint
- runtime WebSocket connection
- chat microfrontend bundle load
- first `chat.snapshot` response
- first lane list paint
- selected transcript paint
- transcript scroll readiness

Performance debugging must be evidence-backed. A slow page load is not
actionable until the runtime, network, bundle, and render costs are separated.

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

The t3code fork bundle should preserve upstream visual behavior, but it should
not ship code surfaces that are not part of Nex Chat. Terminal, worktree, diff,
checkpoint, IDE, pull-request, and provider-runtime controls are not part of
the Nex Chat tab. Their assets and imports should not sit on the default Chat
critical path.

Runtime-served Console pages must use the current runtime origin as their
default WebSocket endpoint. Persisted development or remote runtime URLs must
not strand `/app/console/*` pages that are already served by a live Nex
runtime.

## Sidebar Rules

The left rail keeps upstream project/thread grammar, but Nex remaps the nouns:

- upstream project row means directly chatable agent
- upstream thread row means worker/subagent lane
- the agent row is primary and selectable
- worker/subagent lanes stay collapsed by default
- the expand affordance appears as an intentional secondary control

Most operators should see a manager/agent list first. Reaching worker lanes
should require an explicit expansion or deep link.

The sidebar should not require the initial snapshot to carry all worker detail.
Agent rows should be sufficient for first paint. Worker rows should be fetched
or expanded only when the operator opens an agent, deep-links to a worker, or
searches/filter-navigates into worker scope.

## Transcript Rules

The selected transcript must stay scrollable and responsive with large session
history.

The UI should:

- virtualize older rows
- keep the active tail responsive
- avoid re-rendering unchanged markdown rows during lane metadata updates
- avoid forced layout loops while scrolling
- preserve upstream auto-scroll and jump-to-bottom behavior

The transcript source of truth is the Nex agent session ledger for the selected
lane. The UI may receive live chat events, but those events must dedupe against
stable ledger message ids so optimistic sends, replayed events, and refreshed
snapshots do not produce duplicate bubbles.

The default selected transcript should load a bounded recent window. Older
history should be cursor-paginated or virtualized behind scroll-up behavior
instead of rendered as one unbounded DOM tree.

Lane runtime state must be projected by Nex, not inferred by the browser from
old messages. Stale active-run indicators should age out according to the
runtime projection rules so old sessions do not appear to be working forever.
The current runtime projection cutoff is two hours: queued, running, or
approval-waiting state older than that is projected as idle, non-abortable, and
annotated with the stale diagnostic subtitle.

Chat URL state should be explicit and reversible:

- entering the Chat tab without an explicit lane shows the neutral lane picker
- selecting a lane writes the lane parameter
- stale or invalid lane parameters clear to the neutral picker
- leaving and returning through top-level Console navigation must not preserve
  an invalid lane selection accidentally

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
