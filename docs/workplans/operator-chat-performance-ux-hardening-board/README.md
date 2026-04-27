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
- the embedded Chat proof passes in cleanroom
- live `chat.snapshot` against the operator workspace can exceed the CLI
  runtime timeout
- the sidebar still needs a stricter manager-first behavior pass
- transcript scrolling and viewport fit need explicit performance evidence

## Scope

In scope:

- runtime snapshot/projection performance
- replay performance and reset behavior
- sidebar manager-first collapse/expand behavior
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

## Status

- [Not Started](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/not-started/README.md)
- [In Progress](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/in-progress/README.md)
- [Completed](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/completed/README.md)
- [Blocked](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/blocked/README.md)

## Live Snapshot

- OPUX-001 through OPUX-005 and OPUX-007 are complete
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
- OPUX-006 remains open for a dedicated side-by-side upstream visual parity
  review
