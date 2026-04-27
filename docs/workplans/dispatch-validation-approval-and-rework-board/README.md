---
summary: "Execution board for explicit validation approval boundaries, post-validation manager decisions, validation retry semantics, and implementation rework loops in Dispatch."
title: "Dispatch Validation Approval And Rework Board"
---

# Dispatch Validation Approval And Rework Board

## Purpose

This board closes the remaining product gap after warm-start, candidate
handoff, and the orchestrated golden-runner proof contract already landed.

The goal is:

- stop treating missing approval as a failed validation execution
- make validation approval a first-class Dispatch stage boundary
- make post-validation review a manager-owned decision stage
- let failed validation route cleanly to retry, rework, or human escalation
- make final completion handoff depend on explicit manager completion after
  approved proof

This board is not about rebuilding the proof runner.

It is about finishing the Dispatch product loop around that proof.

## Canonical Inputs

- [Spec-Driven Development Workflow](/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md)
- [Golden Journey Validation And Dispatch Review](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/golden-journey-validation-and-dispatch-review.md)
- [Orchestrated Golden Runner And Demo-Proof Manifest](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/orchestrated-golden-runner-and-demo-proof-manifest.md)
- [Candidate Artifact Handoff And Fresh Validation Cleanrooms](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/candidate-artifact-handoff-and-fresh-validation-cleanrooms.md)
- [Validation Approval, Review, And Rework Loop](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/validation-approval-review-and-rework-loop.md)
- [Dispatch Golden Runner Demo-Proof Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-golden-runner-demo-proof-board/README.md)

## Gap Analysis

Current reality already proves:

- Dispatch can reach `implementing`
- implementation can emit a candidate artifact
- Dispatch can emit a validation packet
- validation approval is already enforced
- the golden-runner contract can produce structured proof artifacts

The live `SPEC-259` rerun proved the next remaining gap:

- implementation completed
- candidate artifact and validation packet were created
- `validating` then stopped because validation script approval was still
  pending

That is the right policy outcome, but the wrong product shape.

The remaining gaps are:

- approval-pending still surfaces as a failed validation stage instead of
  `awaiting_validation_approval`
- approval status is not yet the canonical stage gate for entering
  `validating`
- approval or rejection is not yet a first-class resumable action on the same
  candidate plus validation packet
- validation execution does not yet persist a first-class attempt record and
  classification contract for downstream decision-making
- Dispatch does not yet have a first-class `post_validation_review` stage
- manager next actions are not yet the canonical driver of retry, rework, or
  escalation
- validation failure cannot yet route back into implementation through a
  focused rework packet and preserved lineage
- the final completion handoff is not yet fully owned by the manager decision
  after successful proof

## Scope

In scope:

- validation script revision and approval-state modeling
- `awaiting_validation_approval` stage and truthful issue/run state
- resume from existing candidate artifact plus approved validation packet
- validation attempt records and failure classification
- post-validation review and manager decision routing
- rework packets and new implementation attempts after failed validation
- retry-validation and human-escalation surfaces
- completion handoff driven by the manager's explicit `complete` decision
- one live dogfood run that goes from approval to final completion

Out of scope:

- redoing warm-start or prepared substrates
- replacing the orchestrated golden runner with multiple proof commands
- adding any `kind` field anywhere in the schema

## Ticket Lifecycle

Tickets live in exactly one folder:

1. `not-started/`
2. `in-progress/`
3. `completed/`
4. `blocked/`

## Ticket Order

1. [DVAR-001](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-validation-approval-and-rework-board/completed/DVAR-001-validation-script-revision-and-approval-state-model.md)
2. [DVAR-002](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-validation-approval-and-rework-board/completed/DVAR-002-awaiting-validation-approval-stage-boundary-and-truthful-run-state.md)
3. [DVAR-003](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-validation-approval-and-rework-board/completed/DVAR-003-approval-actions-and-validation-resume-from-existing-candidate-and-packet.md)
4. [DVAR-004](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-validation-approval-and-rework-board/completed/DVAR-004-validation-attempt-record-and-classification-contract.md)
5. [DVAR-005](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-validation-approval-and-rework-board/completed/DVAR-005-post-validation-review-stage-and-manager-decision-routing.md)
6. [DVAR-006](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-validation-approval-and-rework-board/completed/DVAR-006-rework-packet-and-candidate-lineage-loop-back-to-implementation.md)
7. [DVAR-007](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-validation-approval-and-rework-board/completed/DVAR-007-retry-validation-and-human-escalation-surfaces.md)
8. [DVAR-008](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-validation-approval-and-rework-board/completed/DVAR-008-completion-handoff-driven-by-post-validation-manager-decision.md)
9. [DVAR-009](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-validation-approval-and-rework-board/in-progress/DVAR-009-live-spec-259-approval-through-completion-dogfood.md)

## Status

- [Not Started](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-validation-approval-and-rework-board/not-started/README.md)
- [In Progress](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-validation-approval-and-rework-board/in-progress/README.md)
- [Completed](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-validation-approval-and-rework-board/completed/README.md)
- [Blocked](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-validation-approval-and-rework-board/blocked/README.md)

## Live Snapshot

Current truth driving this board:

- DVAR-001 through DVAR-008 are now complete in code and covered by focused
  engine and job tests
- the live `SPEC-259` dogfood rerun is in progress on lineage
  `dagrun_2243845c-b900-41b6-b558-db692d6ce0f1`
- the remaining work is now only the live proof of the approval-through-
  completion loop under the updated Dispatch runtime
