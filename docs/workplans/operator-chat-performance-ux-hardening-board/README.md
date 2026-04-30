---
summary: "Execution board for operator Chat performance, scroll responsiveness, sidebar UX, and viewport hardening after the true t3code fork reset."
title: "Operator Chat Performance UX Hardening Board"
---

# Operator Chat Performance UX Hardening Board

## Purpose

This board follows the true-fork reset. The fork is now cleanroom-green; this
board makes it fast and comfortable under real Nex data.

## Canonical Inputs

- [Spec-Driven Development Workflow](/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md)
- [Operator Chat Performance And UX Hardening](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-performance-and-ux-hardening.md)
- [Operator Chat t3code Upstream Fork](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-t3code-shell-transplant.md)
- [Operator Chat Performance UX Validation Ladder](/Users/tyler/nexus/home/projects/nexus/docs/validation/operator-chat-performance-ux-validation-ladder.md)
- [Operator Chat t3code True Fork Reset Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-true-fork-reset-board/README.md)

## Gap Analysis

Current reality:

- the t3code fork reset is complete
- the embedded Chat proof has passed in cleanroom, but the latest live dogfood
  review exposed remaining gaps
- runtime-served Console pages can be stranded by stale persisted runtime URLs
  unless they resolve the current origin first
- Chat first usable state still needs phase-separated timing for shell, runtime
  connection, microfrontend load, snapshot, lane paint, and transcript paint
- the Chat bundle is large and still needs a default-path asset/import budget
- the default snapshot should become shallower so first paint is manager-first
  and worker detail loads lazily
- selected-lane history must be ledger-backed, cursor-friendly, and deduped
  against live events
- lane runtime state must not leave old sessions showing `Working...`
- the sidebar still needs a dedicated upstream-parity visual pass
- transcript scrolling must be proven against large Nex history after the
  ledger/windowing changes

## Scope

In scope:

- browser and runtime performance instrumentation
- bundle and asset budget for the t3code fork
- runtime snapshot/projection performance
- replay performance and reset behavior
- sidebar manager-first collapse/expand behavior
- ledger-backed selected-lane transcript correctness
- live event dedupe and send/reply reconciliation
- runtime state freshness for lane activity indicators
- deterministic Chat URL selection behavior
- transcript scroll responsiveness
- context sheet and viewport fit
- cleanroom performance proof artifacts

Out of scope:

- changing the hard-cutover chat contract
- custom redesign away from upstream t3code
- adding any `kind` field to Nex canonical schemas
- reviving terminal, diff, PR, IDE, or worktree product surfaces

## Ticket Lifecycle

Tickets live in exactly one folder:

1. `not-started/`
2. `in-progress/`
3. `completed/`
4. `blocked/`

## Ticket Order

1. [OPUX-001](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/completed/OPUX-001-runtime-snapshot-baseline-and-hot-path-map.md)
2. [OPUX-002](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/completed/OPUX-002-chat-projection-sync-cost-reduction.md)
3. [OPUX-003](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/completed/OPUX-003-manager-first-sidebar-collapse-and-hover-expand.md)
4. [OPUX-004](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/completed/OPUX-004-transcript-scroll-and-virtualization-proof.md)
5. [OPUX-005](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/completed/OPUX-005-context-sheet-and-viewport-fit-polish.md)
6. [OPUX-006](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/not-started/OPUX-006-upstream-parity-visual-review-pass.md)
7. [OPUX-007](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/completed/OPUX-007-cleanroom-performance-proof-and-closeout.md)
8. [OPUX-008](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/completed/OPUX-008-perf-instrumentation-and-browser-probe.md)
9. [OPUX-009](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/completed/OPUX-009-chat-bundle-and-asset-budget.md)
10. [OPUX-010](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/completed/OPUX-010-shallow-snapshot-and-lazy-lane-detail.md)
11. [OPUX-011](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/completed/OPUX-011-ledger-backed-history-and-live-event-dedupe.md)
12. [OPUX-012](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/completed/OPUX-012-runtime-state-and-stale-working-cutoff.md)
13. [OPUX-013](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/not-started/OPUX-013-manager-first-sidebar-parity-pass.md)
14. [OPUX-014](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/completed/OPUX-014-chat-url-selection-state.md)
15. [OPUX-018](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/completed/OPUX-018-sparse-monotonic-replay-semantics.md)
16. [OPUX-019](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/completed/OPUX-019-selected-snapshot-payload-reduction.md)
17. [OPUX-020](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/completed/OPUX-020-lane-global-history-timeline.md)
18. [OPUX-015](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/completed/OPUX-015-transcript-virtualization-and-scroll-robustness.md)
19. [OPUX-016](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/completed/OPUX-016-cleanroom-performance-regression-proof.md)
20. [OPUX-017](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/completed/OPUX-017-forensic-handoff-and-new-agent-prompt.md)

## Status

- [Not Started](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/not-started/README.md)
- [In Progress](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/in-progress/README.md)
- [Completed](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/completed/README.md)
- [Blocked](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/blocked/README.md)

## Live Snapshot

- OPUX-001 through OPUX-005 and OPUX-007 are complete
- OPUX-008 through OPUX-010 are complete
- OPUX-011, OPUX-012, and OPUX-014 through OPUX-020 are complete; OPUX-013
  remains open
- first live probe showed `chat.snapshot` exceeding the default runtime timeout
- projection synchronization now skips historical message/approval replay
  backfill for unchanged lanes that already have replay events
- after rebuilding and restarting the runtime, live `chat.snapshot` returned in
  about `0.22s` with `116` lanes, `24` selected-lane messages, and a `154 KB`
  payload
- latest cleanroom proof passed at
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260429T174053Z`
- cleanroom metrics show `/app/console/chat` ready in `820ms`, manager lane
  visible in `13ms`, context sheet open in `67ms`, document overflow at
  `0px`, and large-transcript reload ready in `610ms`
- live dogfood after that closeout still showed delayed entry, confusing URL
  lane state, partial history, duplicate sends, missing replies, stale
  `Working...` state, and scroll/fit concerns
- OPUX-008 local probe now captures shell, runtime connection, chat bundle,
  `chat.snapshot`, first-paint assets, and stale-runtime-url behavior; first
  measured findings are a `2.72 MB` chat script, remote font CSS on first
  paint, and live `chat.snapshot` variance from about `0.7s` to `4.0s`
- OPUX-009 removed remote font CSS from the default runtime-served Chat path
  and split disabled code/worktree surfaces out of the default embedded bundle;
  the embedded chat script dropped to about `2.06 MB`, and the clean browser
  probe reached a connected sidebar in `932ms`
- OPUX-010 made default `chat.snapshot` shallow: the no-lane API path now
  returns only `3` root agent lanes in `0.122s`, and the browser probe reaches a
  connected default Chat tab in `316ms` with `chat.snapshot` at `17.9ms`
- OPUX-011 made selected-lane transcript history ledger-backed with stable
  dedupe ids and cursor paging; Echo browser proof now shows the UI-send smoke
  as exactly one user row plus one assistant row, while the selected lane
  snapshot still takes about `1.65s` because expanded lane detail includes the
  full child-lane summary set
- OPUX-012 added a two-hour server-side runtime projection cutoff; stale active
  proof-worker lanes now project as idle, non-abortable, and annotated with
  `Stale active state aged out`, while the selected Echo browser probe shows no
  stale `Working...` indicator
- OPUX-014 verified, rebuilt, synced, and restarted the runtime-served Console
  package so `/app/console/chat?lane=...` now serves the current bundle with
  `initialLaneId`, embedded `onLaneSelectionChange`, and Chat-preserving lane
  URL behavior
- OPUX-018 changed replay recovery to accept sparse monotonic event sequences;
  `chat.replay` now reserves reset for actual retained-window loss instead of
  sequence gaps
- OPUX-019 reduced selected Echo snapshots to root lanes plus selected context:
  the live selected read is now about `11.7 KB` with `3` lanes and no worker
  summaries, while explicit child expansion still returns the `112` worker
  lanes
- OPUX-020 added explicit lane-global history reads for agent lanes while
  preserving active-session reads as the send and continuation target
- OPUX-006 remains open for a dedicated side-by-side upstream visual parity
  review and now feeds OPUX-013
- OPUX-017 is completed as the forensic handoff record that spawned OPUX-014
  and OPUX-018 through OPUX-020
- OPUX-015 and OPUX-016 passed in the 2026-04-29 Docker cleanroom proof at
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260429T174053Z`;
  the run measured `/app/console/chat` ready in `820ms`, manager lane visible
  in `13ms`, context sheet open in `67ms`, document overflow at `0px`, large
  transcript reload ready in `610ms`, programmatic transcript scroll in
  `52.3ms`, and wheel-scroll delta at `968px`
