---
summary: "Execution board for hard-cutting the Nex-owned global Chat tab, durable chat projection, and forked t3code microfrontend."
title: "Operator Chat Hard-Cutover Board"
---

# Operator Chat Hard-Cutover Board

## Purpose

This board closes the gap between the current Nex operator console chat
implementation and the canonical operator chat architecture.

The goal is:

- one global `Chat` tab in the operator console
- one Nex-owned `chat.*` runtime contract
- one Nex-owned durable chat projection and replayable event log
- one forked `t3code` microfrontend mounted against that Nex contract
- no standalone `t3code` backend or second orchestration engine

## Canonical Inputs

- [Operator Chat Taxonomy](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-taxonomy.md)
- [Operator Chat Runtime Contract](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-runtime-contract.md)
- [Operator Chat Surface And Agent Lanes](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-surface-and-agent-lanes.md)
- [Operator Chat t3code Upstream Fork](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-t3code-shell-transplant.md)
- [Operator Chat Cleanroom Proof Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-cleanroom-proof-board/README.md)
- [Operator Chat t3code Shell Transplant Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-shell-transplant-board/README.md)
- [Operator Chat t3code True Fork Reset Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-true-fork-reset-board/README.md)
- [Spec-Driven Development Workflow](/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md)

## Gap Analysis

Current reality already provides:

- agent, session, conversation, approval, and runtime event primitives in Nex
- existing operator console chat plumbing
- a clear target-state spec set for operator chat
- a viable microfrontend path for a forked `t3code` web client

The current remaining gap is:

- none for the hard-cut runtime and global-Chat product seam
- the remaining visual-shell and upstream-shell-fidelity gap now belongs to
  the dedicated
  [Operator Chat t3code Shell Transplant Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-shell-transplant-board/README.md)

## Scope

In scope:

- Nex runtime capability and schema work for `chat.*`
- durable chat projection and replay support
- lane directory, lane hierarchy, conversation scope, and delivery-target
  synthesis
- hard-cut fork of `t3code` web into a Nex-owned microfrontend
- operator console global `Chat` tab integration
- cleanroom validation for manager chat, worker chat, approvals, replay, and
  linked public conversation context

Out of scope:

- running a standalone `t3code` backend
- preserving project, worktree, terminal, diff, or checkpoint product surfaces
- temporary compatibility servers or transitional UI bridges
- adding any `kind` field to Nex canonical schemas

## Ticket Lifecycle

Tickets live in exactly one folder:

1. `not-started/`
2. `in-progress/`
3. `completed/`
4. `blocked/`

## Ticket Order

1. [OCH-001](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-hard-cutover-board/completed/OCH-001-chat-capability-and-schema-registration.md)
2. [OCH-002](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-hard-cutover-board/completed/OCH-002-durable-chat-projection-and-event-log.md)
3. [OCH-003](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-hard-cutover-board/completed/OCH-003-lane-directory-hierarchy-and-conversation-scope-synthesis.md)
4. [OCH-004](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-hard-cutover-board/completed/OCH-004-chat-snapshot-and-replay-read-side.md)
5. [OCH-005](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-hard-cutover-board/completed/OCH-005-chat-command-path-integration.md)
6. [OCH-006](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-hard-cutover-board/completed/OCH-006-t3code-fork-baseline-and-surface-deletion.md)
7. [OCH-007](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-hard-cutover-board/completed/OCH-007-nex-chat-client-and-lane-store-replacement.md)
8. [OCH-008](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-hard-cutover-board/completed/OCH-008-global-chat-tab-mount-and-host-integration.md)
9. [OCH-009](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-hard-cutover-board/completed/OCH-009-cleanroom-validation-contract-and-proof-lane.md)

## Status

- [Not Started](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-hard-cutover-board/not-started/README.md)
- [In Progress](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-hard-cutover-board/in-progress/README.md)
- [Completed](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-hard-cutover-board/completed/README.md)
- [Blocked](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-hard-cutover-board/blocked/README.md)

## Live Snapshot

Current truth driving this board:

- the canonical operator chat target state is now split cleanly across a
  taxonomy, runtime contract, and product-surface spec
- the next highest-leverage move is runtime-first rather than UI-first
- the canonical `chat.*` runtime surface is now registered in Nex
- the durable chat projection, lane synthesis, and snapshot/replay read side
  are now live in Nex
- the canonical operator chat command path is now live and validated:
  records-first send, canonical abort wiring, approval routing, delivery
  selection, and transcript-to-record linkage
- the fork baseline is now established and validated in
  `packages/apps/nex-operator-chat/app`
- the fork now boots from Nex chat snapshot/replay data and exposes a
  mountable shadow-safe microfrontend surface
- the operator console now exposes `/chat` as the canonical global Chat page
  and mounts the Nex-owned microfrontend against the existing runtime client
- `OCH-009` is now complete with one truthful cleanroom proof bundle for the
  global Chat page
- the cleanroom contract is now documented in
  `nex/docs/validation/operator-chat-cleanroom-validation-ladder.md`
- the dedicated proof execution is now captured in the
  `operator-chat-cleanroom-proof-board`
- the latest canonical signoff bundle is now
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260407T195221Z`
- the Docker-backed operator-chat cleanroom harness now also passes end to end
  through
  `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-chat-cleanroom-docker.sh`
- the canonical signoff bundle now matches the shared Dispatch-era review
  standard by retaining the whole-session cleanroom recording and recording
  manifest
- the current hard cut is functionally complete, but the mounted UI is still
  not a true upstream `t3code` fork
- that remaining shell-fidelity gap now belongs to the dedicated
  [Operator Chat t3code True Fork Reset Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-true-fork-reset-board/README.md)
