---
summary: "Execution board for the dedicated cleanroom-backed proof lane for the Nex-owned global Chat tab, lane-based chat runtime, and linked manager/worker/public conversation journey."
title: "Operator Chat Cleanroom Proof Board"
---

# Operator Chat Cleanroom Proof Board

## Purpose

This board is the execution epic for closing the remaining validation gap after
the operator chat hard cut.

The goal is:

- one dedicated cleanroom producer for the global `Chat` surface
- one explicit human-shaped validation script for the operator chat journey
- one deterministic seed path for manager lanes, worker lanes, approvals,
  replay, and linked public conversation context
- one review-worthy cleanroom artifact bundle proving the end-to-end story with
  a primary whole-session sandbox recording

## Canonical Inputs

- [Spec-Driven Development Workflow](/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md)
- [Operator Chat Taxonomy](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-taxonomy.md)
- [Operator Chat Runtime Contract](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-runtime-contract.md)
- [Operator Chat Surface And Agent Lanes](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-surface-and-agent-lanes.md)
- [Operator Chat Cleanroom Validation Ladder](/Users/tyler/nexus/home/projects/nexus/nex/docs/validation/operator-chat-cleanroom-validation-ladder.md)
- [Cleanroom Proof Capture And Demo Artifacts](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/cleanroom-proof-capture-and-demo-artifacts.md)
- [Operator Chat Hard-Cutover Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-hard-cutover-board/README.md)

## Gap Analysis

Current reality already provides:

- the Nex-owned `chat.*` runtime surface, durable chat projection, and replay
  path
- the forked `nex-operator-chat` microfrontend mounted on the global `/chat`
  page
- focused package validation proving the runtime and UI cutover locally
- reusable cleanroom substrate for operator-console browser proof, manager and
  worker runtime proof, and linked public delivery proof

The current remaining gaps are:

- none for product correctness; the dedicated producer, seed helper, browser
  proof, cleanroom capture lane, and Docker-backed harness have now executed
  successfully

## Scope

In scope:

- the operator-chat cleanroom producer entrypoints and capture wrappers
- deterministic operator-chat state seeding through Nex runtime primitives
- narrowly scoped cleanroom-only helpers if deterministic approval or replay
  setup cannot be produced truthfully otherwise
- the explicit human-shaped validation script for the main chat journey
- a dedicated browser proof scenario for the global `Chat` page
- execution of the cleanroom proof and review-artifact capture

Out of scope:

- redesigning the operator chat product surface
- local-runtime-only signoff
- raw database mutation as the primary seed mechanism
- reviving `t3code` project, terminal, worktree, diff, or checkpoint surfaces
- adding any `kind` field to Nex canonical schemas

## Ticket Lifecycle

Tickets live in exactly one folder:

1. `not-started/`
2. `in-progress/`
3. `completed/`
4. `blocked/`

## Ticket Order

1. [OCP-001](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-cleanroom-proof-board/completed/OCP-001-operator-chat-proof-contract-and-human-script.md)
2. [OCP-002](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-cleanroom-proof-board/completed/OCP-002-chat-specific-cleanroom-producer-and-seed-path.md)
3. [OCP-003](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-cleanroom-proof-board/completed/OCP-003-global-chat-browser-proof-and-artifact-capture.md)
4. [OCP-004](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-cleanroom-proof-board/completed/OCP-004-cleanroom-execution-review-and-closeout.md)

## Status

- [Not Started](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-cleanroom-proof-board/not-started/README.md)
- [In Progress](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-cleanroom-proof-board/in-progress/README.md)
- [Completed](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-cleanroom-proof-board/completed/README.md)
- [Blocked](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-cleanroom-proof-board/blocked/README.md)

## Live Snapshot

Current truth driving this board:

- the product hard cut is implemented; the remaining gap is validation, not
  feature architecture
- the validation ladder now includes the explicit human-shaped operator script
  and points at the live proof entrypoints
- the `/chat` Playwright proof scenario is green and wired to the dedicated
  operator-chat seed-helper contract
- the canonical operator-chat cleanroom path now runs through the shared
  capture substrate at
  `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-chat-cleanroom-capture.sh`,
  which executes the proof inside the Linux cleanroom image and retains the
  whole-session recording contract
- the host-managed harness remains available at
  `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-chat-cleanroom-host.sh`
  for focused non-recorded debugging when needed
- the Docker-backed cleanroom harness is now also green at
  `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-chat-cleanroom-docker.sh`
- the latest dedicated operator-chat proof bundle now exists at
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260427T144405Z`
  and is promoted by the sibling `latest` symlink
- that canonical bundle now retains the primary review recording at
  `videos/full-session.webm` plus the shared recording manifest at
  `review/full-session-recording.json`
- that recorded proof now visibly covers lane-action creation and invocation
  in addition to manager chat, worker direct chat, approvals, replay recovery,
  and linked public conversation context
- the correct proof posture remains cleanroom-backed and narrative-first, not
  local-only package validation
- this board is complete because the latest truthful cleanroom proof bundle now
  demonstrates lane actions, manager chat, worker chat, worker-lane reload
  recovery, approvals, replay recovery, and linked public conversation context
  from the global `Chat` page
