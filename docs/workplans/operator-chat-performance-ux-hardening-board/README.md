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
9. [OPUX-009](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/in-progress/OPUX-009-chat-bundle-and-asset-budget.md)
10. [OPUX-010](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/not-started/OPUX-010-shallow-snapshot-and-lazy-lane-detail.md)
11. [OPUX-011](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/not-started/OPUX-011-ledger-backed-history-and-live-event-dedupe.md)
12. [OPUX-012](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/not-started/OPUX-012-runtime-state-and-stale-working-cutoff.md)
13. [OPUX-013](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/not-started/OPUX-013-manager-first-sidebar-parity-pass.md)
14. [OPUX-014](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/not-started/OPUX-014-chat-url-selection-state.md)
15. [OPUX-015](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/not-started/OPUX-015-transcript-virtualization-and-scroll-robustness.md)
16. [OPUX-016](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/not-started/OPUX-016-cleanroom-performance-regression-proof.md)

## Status

- [Not Started](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/not-started/README.md)
- [In Progress](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/in-progress/README.md)
- [Completed](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/completed/README.md)
- [Blocked](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/blocked/README.md)

## Live Snapshot

- OPUX-001 through OPUX-005 and OPUX-007 are complete
- OPUX-008 is complete
- OPUX-009 through OPUX-016 define the remaining next pass prompted by live dogfood
  issues found after the previous cleanroom closeout
- first live probe showed `chat.snapshot` exceeding the default runtime timeout
- projection synchronization now skips historical message/approval replay
  backfill for unchanged lanes that already have replay events
- after rebuilding and restarting the runtime, live `chat.snapshot` returned in
  about `0.22s` with `116` lanes, `24` selected-lane messages, and a `154 KB`
  payload
- latest cleanroom proof passed at
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260427T161830Z`
- cleanroom metrics show `/chat` ready in `1.28s`, manager lane visible in
  `21ms`, context sheet open in `97ms`, document overflow at `0px`, and
  large-transcript reload ready in `894ms`
- live dogfood after that closeout still showed delayed entry, confusing URL
  lane state, partial history, duplicate sends, missing replies, stale
  `Working...` state, and scroll/fit concerns
- OPUX-008 local probe now captures shell, runtime connection, chat bundle,
  `chat.snapshot`, first-paint assets, and stale-runtime-url behavior; first
  measured findings are a `2.72 MB` chat script, remote font CSS on first
  paint, and live `chat.snapshot` variance from about `0.7s` to `4.0s`
- OPUX-006 remains open for a dedicated side-by-side upstream visual parity
  review and now feeds OPUX-013
