---
summary: "Execution board for replacing the current custom operator-chat UI with a real upstream-derived t3code shell remapped to agent groups, lanes, and Nex-native actions."
title: "Operator Chat t3code Shell Transplant Board"
---

# Operator Chat t3code Shell Transplant Board

## Status

This board is now historical.

It records the first upstream-derived shell attempt, but it should no longer be
treated as the active plan for upstream UI fidelity.

The active reset path now lives in:

- [Operator Chat t3code True Fork Reset Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-true-fork-reset-board/README.md)

## Purpose

This board closes the gap between the current functional Nex operator chat cut
and the desired upstream-derived `t3code` shell transplant.

The goal is:

- one real upstream-derived `t3code` shell inside `nex-operator-chat`
- one preserved `project -> thread` visual grammar remapped to
  `agent group -> lane`
- one preserved upstream chat workspace shell backed by Nex `chat.*`
- one preserved action bar remapped to Nex-native lane actions
- no unsupported git, terminal, diff, worktree, or PR chrome

## Canonical Inputs

- [Spec-Driven Development Workflow](/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md)
- [Operator Chat Taxonomy](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-taxonomy.md)
- [Operator Chat Runtime Contract](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-runtime-contract.md)
- [Operator Chat Surface And Agent Lanes](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-surface-and-agent-lanes.md)
- [Operator Chat t3code Shell Transplant](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-t3code-shell-transplant.md)
- [Operator Chat Hard-Cutover Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-hard-cutover-board/README.md)
- [Operator Chat Cleanroom Proof Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-cleanroom-proof-board/README.md)

## Gap Analysis

Current reality already provides:

- the Nex-owned `chat.*` runtime surface
- durable chat projection, replay, approvals, and linked conversation context
- a global `Chat` tab in the operator console
- a working `nex-operator-chat` package and cleanroom proof path

The current remaining gaps are:

- the current package still is not a true upstream fork
- critical shell files were rewritten too heavily to satisfy upstream parity
- the remaining gap now belongs to the dedicated true-fork reset board

## Scope

In scope:

- vendoring and preserving the real upstream `t3code` web shell
- resetting `nex-operator-chat` around the upstream app structure
- remapping the sidebar from projects and threads to agent groups and lanes
- remapping the chat workspace from threads to lane detail
- preserving the upstream action control and reinterpreting it as lane actions
- deleting unsupported upstream git, terminal, diff, worktree, and PR surfaces
- embedding the transplanted shell back into the global `Chat` tab
- cleanroom validation and recorded review proof for the visual transplant

Out of scope:

- performance tuning and snapshot boot optimization beyond correctness
- reviving the stock `t3code` backend or SQLite store
- treating projects, worktrees, git branches, or checkpoints as operator chat
  product nouns
- temporary compatibility servers or transitional dual-UI paths
- adding any `kind` field to Nex canonical schemas

## Ticket Lifecycle

Tickets live in exactly one folder:

1. `not-started/`
2. `in-progress/`
3. `completed/`
4. `blocked/`

## Ticket Order

1. [OTT-001](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-shell-transplant-board/completed/OTT-001-upstream-web-shell-provenance-and-package-reset.md)
2. [OTT-002](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-shell-transplant-board/completed/OTT-002-standalone-microfrontend-shell-and-tooling-transplant.md)
3. [OTT-003](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-shell-transplant-board/completed/OTT-003-agent-group-sidebar-remap.md)
4. [OTT-004](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-shell-transplant-board/completed/OTT-004-lane-workspace-and-chat-shell-transplant.md)
5. [OTT-005](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-shell-transplant-board/completed/OTT-005-lane-actions-contract-and-header-remap.md)
6. [OTT-006](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-shell-transplant-board/completed/OTT-006-nex-chat-state-spine-and-route-cutover.md)
7. [OTT-007](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-shell-transplant-board/completed/OTT-007-unsupported-surface-deletion-and-shell-cleanup.md)
8. [OTT-008](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-shell-transplant-board/completed/OTT-008-cleanroom-visual-shell-proof-and-closeout.md)

## Status

- [Not Started](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-shell-transplant-board/not-started/README.md)
- [In Progress](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-shell-transplant-board/in-progress/README.md)
- [Completed](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-shell-transplant-board/completed/README.md)
- [Blocked](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-shell-transplant-board/blocked/README.md)

## Live Snapshot

Current truth driving this board:

- this board produced a functioning Nex-backed chat surface and useful
  vendored primitives
- it did not preserve the main upstream shell files closely enough to satisfy
  the actual target state
- the route model, sidebar shell, and chat workspace shell remain too custom
- the active parity path is now the dedicated true-fork reset board
