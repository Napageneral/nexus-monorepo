---
summary: "Execution board for warm implementation substrates, repo-keyed startup preparation, preflighted worker sandbox attach, and Dispatch cutover to warm implementation startup."
title: "Warm Implementation Substrate Board"
---

# Warm Implementation Substrate Board

## Purpose

This board executes the startup-speed layer that sits between reusable sandbox
images and fresh per-run implementation sandboxes.

The goal is:

- keep base images toolchain-oriented instead of rebuilding them per commit
- prepare repo-keyed warm implementation substrates ahead of worker attach
- run startup preflight before the worker spends budget on code work
- launch implementation workers into warm writable sandboxes
- preserve fresh candidate-driven validation cleanrooms as the signoff truth

This board does not replace candidate artifacts, validation profiles, or
cleanroom signoff.

It makes implementation startup fast, deterministic, and manager-friendly.

## Canonical Inputs

- [Spec-Driven Development Workflow](/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md)
- [Warm Implementation Substrates And Preflighted Sandbox Startup](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/warm-implementation-substrates-and-preflighted-sandbox-startup.md)
- [Shared Validation Substrate Images And Host Build Serialization](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/shared-validation-substrate-images-and-host-build-serialization.md)
- [Candidate Artifact Handoff And Fresh Validation Cleanrooms](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/candidate-artifact-handoff-and-fresh-validation-cleanrooms.md)
- [Compact Sandbox-Hosted Codex Worker Startup](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/agents/compact-sandbox-hosted-codex-worker-startup.md)
- [Sandbox Runtime Config And Image Identity](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/work/sandbox-execution-profiles-and-image-identity.md)
- [Sandbox Runtime Primitive](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/work/sandbox-runtime-primitive.md)
- [Validation Substrate Image And Build-Plane Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/validation-substrate-image-and-build-plane-board/README.md)
- [Implementation Validation Handoff Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/implementation-validation-handoff-board/README.md)

## Scope

In scope:

- first-class prepared-substrate contract and provenance
- repo- and dependency-keyed warm substrate identity
- substrate prepare, verify, and invalidate job family
- sandbox creation from immutable warm substrates
- repo-local startup preflight and receipts
- Dispatch cutover between `hydrate_repo` and `implementing`
- compact Codex worker warm-start posture
- operator controls for warm substrate lifecycle and image/substrate separation
- one live Dispatch dogfood issue proving the warm-start path

Out of scope:

- rebuilding base sandbox images for every commit
- collapsing implementation and validation into the same sandbox
- replacing candidate-artifact handoff with substrate identity
- treating a shared mutable dependency tree as acceptable worker state
- moving ticket-level signoff proof out of fresh validation cleanrooms

## Ticket Lifecycle

Tickets live in exactly one folder:

1. `not-started/`
2. `in-progress/`
3. `completed/`
4. `blocked/`

Rules:

1. each ticket must close one atomic gap in the warm-start model
2. a ticket closes only when at least one real worker or live Dispatch path
   can use the new substrate behavior truthfully
3. image work and warm substrate work must stay separate in code and review
4. moving the file between folders is the status change

## Delivery Slices

### Step 1: Contracts and substrate prep

The first slice should:

- define the prepared-substrate noun
- persist it durably
- add prepare, verify, and invalidate job primitives
- establish the keying and preflight contract

### Step 2: Sandbox and Dispatch cutover

The second slice should:

- create implementation sandboxes from immutable warm substrates
- attach workers only after startup preflight passes
- cut Dispatch over to substrate resolution before `implementing`

### Step 3: Hard-cut startup resolution and failure truth

The third slice should:

- replace env-var image selection with registry-backed startup-profile
  resolution
- hard-cut compact-worker startup onto the canonical runtime-backed image
  mapping
- surface the real downstream cause when implementation-stage sandbox
  materialization fails
- persist canonical stage failure truth into issue state and review summaries

### Step 4: Live warm-start proof

The final slice should:

- prove a real Dispatch issue reaches implementation without wasting budget on
  dependency install or substrate repair
- preserve candidate-artifact publication and fresh validation cleanroom proof

### Step 5: Validation resilience and operator truth

The last follow-on slice should:

- identify the real source of repeated runtime `SIGTERM` restarts
- keep active validation and Dispatch jobs from being lost across runtime
  restart windows
- make validation interruption retryable from existing candidate and packet
  state
- harden `dispatch.runs.get`, `dispatch.runs.cancel`, and
  `dispatch.runs.requeue` during active runs
- keep issue-state stage truth current during validation
- clear stale prepared-substrate error residue after successful reruns

## Current Status Snapshot

Completed:

- `WIS-001`
- `WIS-002`
- `WIS-003`
- `WIS-004`
- `WIS-005`
- `WIS-006`
- `WIS-007`
- `WIS-008`
- `WIS-009`
- `WIS-011`
- `WIS-012`
- `WIS-013`
- `WIS-014`
- `WIS-015`
- `WIS-016`
- `WIS-017`
- `WIS-018`
- `WIS-019`

In Progress:

- none

Blocked:

- `WIS-010`

Not Started:

- none

## Ticket Order

1. [WIS-001](/Users/tyler/nexus/home/projects/nexus/docs/workplans/warm-implementation-substrate-board/completed/WIS-001-prepared-substrate-contract-and-identity-model.md)
2. [WIS-002](/Users/tyler/nexus/home/projects/nexus/docs/workplans/warm-implementation-substrate-board/completed/WIS-002-prepared-substrate-registry-and-sandbox-provenance.md)
3. [WIS-003](/Users/tyler/nexus/home/projects/nexus/docs/workplans/warm-implementation-substrate-board/completed/WIS-003-substrate-key-computation-and-invalidation-rules.md)
4. [WIS-004](/Users/tyler/nexus/home/projects/nexus/docs/workplans/warm-implementation-substrate-board/completed/WIS-004-implementation-substrate-prepare-verify-and-invalidate-jobs.md)
5. [WIS-005](/Users/tyler/nexus/home/projects/nexus/docs/workplans/warm-implementation-substrate-board/completed/WIS-005-sandbox-materialization-from-immutable-warm-substrates.md)
6. [WIS-006](/Users/tyler/nexus/home/projects/nexus/docs/workplans/warm-implementation-substrate-board/completed/WIS-006-repo-local-startup-preflight-and-receipts.md)
7. [WIS-007](/Users/tyler/nexus/home/projects/nexus/docs/workplans/warm-implementation-substrate-board/completed/WIS-007-dispatch-cutover-between-hydrate-repo-and-implementing.md)
8. [WIS-008](/Users/tyler/nexus/home/projects/nexus/docs/workplans/warm-implementation-substrate-board/completed/WIS-008-compact-codex-worker-warm-start-cutover.md)
9. [WIS-009](/Users/tyler/nexus/home/projects/nexus/docs/workplans/warm-implementation-substrate-board/completed/WIS-009-image-prewarm-substrate-lifecycle-and-operator-controls.md)
10. [WIS-011](/Users/tyler/nexus/home/projects/nexus/docs/workplans/warm-implementation-substrate-board/completed/WIS-011-startup-profile-registry-resolution-and-hard-cut-image-selection.md)
11. [WIS-012](/Users/tyler/nexus/home/projects/nexus/docs/workplans/warm-implementation-substrate-board/completed/WIS-012-implementation-stage-runtime-failure-observability.md)
12. [WIS-013](/Users/tyler/nexus/home/projects/nexus/docs/workplans/warm-implementation-substrate-board/completed/WIS-013-canonical-dispatch-stage-failure-persistence.md)
13. [WIS-014](/Users/tyler/nexus/home/projects/nexus/docs/workplans/warm-implementation-substrate-board/completed/WIS-014-runtime-sigterm-provenance-and-restart-source-attribution.md)
14. [WIS-015](/Users/tyler/nexus/home/projects/nexus/docs/workplans/warm-implementation-substrate-board/completed/WIS-015-runtime-restart-fencing-and-active-job-draining.md)
15. [WIS-016](/Users/tyler/nexus/home/projects/nexus/docs/workplans/warm-implementation-substrate-board/completed/WIS-016-validation-interruption-classification-and-resume-from-packet.md)
16. [WIS-017](/Users/tyler/nexus/home/projects/nexus/docs/workplans/warm-implementation-substrate-board/completed/WIS-017-dispatch-run-control-and-observability-surface-hardening.md)
17. [WIS-018](/Users/tyler/nexus/home/projects/nexus/docs/workplans/warm-implementation-substrate-board/completed/WIS-018-active-stage-persistence-during-validation-and-review.md)
18. [WIS-019](/Users/tyler/nexus/home/projects/nexus/docs/workplans/warm-implementation-substrate-board/completed/WIS-019-prepared-substrate-success-reconciliation-and-residue-clear.md)
19. [WIS-010](/Users/tyler/nexus/home/projects/nexus/docs/workplans/warm-implementation-substrate-board/blocked/WIS-010-first-dispatch-warm-start-dogfood-ticket.md)

## Manager-Mode Execution Split

Recommended sequencing for manager-mode burn-down:

- `WIS-001` -> `WIS-002` -> `WIS-003` should land first because they lock the
  nouns, persistence, and keying
- `WIS-004` depends on `WIS-001` through `WIS-003`
- `WIS-005` and `WIS-006` can proceed in parallel once `WIS-004` establishes
  the job/runtime contract
- `WIS-007` depends on `WIS-004` through `WIS-006`
- `WIS-008` can run alongside the latter half of `WIS-007` as long as the
  sandbox startup contract is stable
- `WIS-009` can run in parallel after `WIS-004` because it is mostly lifecycle
  and operator-surface work
- `WIS-011` hard-cuts startup-profile image resolution and is already closed
- `WIS-012` and `WIS-013` are already closed and now serve as the canonical
  failure-truth and review-gate baseline
- `WIS-015` is already closed because restart fencing is live and active work
  is fenced during restart requests
- `WIS-014` through `WIS-019` are now closed in code and focused verification
- `WIS-010` remains as the final blocked execution slice because the live
  dogfood lane now fails at the product/demo-proof gate rather than at startup,
  restart, or operator-truth seams

## Ownership Split

- this board owns warm implementation startup and prepared-substrate behavior
- the validation-substrate image board owns the shared image/build plane
- the implementation-validation handoff board owns candidate-artifact and
  validation-cleanroom truth
- app-specific boards should consume the warm substrate contract instead of
  growing their own cold-start bootstrap logic

## Status

- [Not Started](/Users/tyler/nexus/home/projects/nexus/docs/workplans/warm-implementation-substrate-board/not-started/README.md)
- [In Progress](/Users/tyler/nexus/home/projects/nexus/docs/workplans/warm-implementation-substrate-board/in-progress/README.md)
- [Completed](/Users/tyler/nexus/home/projects/nexus/docs/workplans/warm-implementation-substrate-board/completed/README.md)
- [Blocked](/Users/tyler/nexus/home/projects/nexus/docs/workplans/warm-implementation-substrate-board/blocked/README.md)
