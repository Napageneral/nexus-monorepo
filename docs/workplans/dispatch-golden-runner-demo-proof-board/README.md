---
summary: "Execution board for deterministic validation preflight, one orchestrated Dispatch golden runner, one canonical demo recording, and manifest-driven review gating."
title: "Dispatch Golden Runner Demo-Proof Board"
---

# Dispatch Golden Runner Demo-Proof Board

## Purpose

This board closes the remaining gap after warm-start, candidate handoff, and
validation cleanroom architecture already landed.

The goal is:

- verify the validation lane deterministically before proof begins
- replace several top-level proof commands with one orchestrated golden runner
- keep Slack as one top-level proof phase with internal checkpoints
- produce one canonical demo recording
- emit one structured result manifest
- make review gate consume that manifest

This board is not about redoing warm-start or candidate handoff.

It is about turning the proof lane into a clean product.

## Canonical Inputs

- [Spec-Driven Development Workflow](/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md)
- [Golden Journey Validation And Dispatch Review](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/golden-journey-validation-and-dispatch-review.md)
- [Real Adapter Validation Profiles And Cleanroom Projection](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/real-adapter-validation-profiles-and-cleanroom-projection.md)
- [Orchestrated Golden Runner And Demo-Proof Manifest](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/orchestrated-golden-runner-and-demo-proof-manifest.md)
- [Candidate Artifact Handoff And Fresh Validation Cleanrooms](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/candidate-artifact-handoff-and-fresh-validation-cleanrooms.md)
- [Warm Implementation Substrate Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/warm-implementation-substrate-board/README.md)

## Scope

In scope:

- deterministic validation preflight before the demo begins
- Jira adapter registration and health verification in the cleanroom
- one orchestrated golden runner entrypoint
- one top-level Slack phase with internal checkpoints
- one canonical recording for the whole journey
- one structured golden-run manifest
- review-gate cutover from raw exit-code inference to manifest evaluation
- demotion of per-adapter proof commands to internal diagnostics
- one live rerun proving `demo_proof` on the same Dispatch lineage
- one completion handoff shape that can include Jira, forge, and video links

Out of scope:

- undoing the fresh validation cleanroom model
- reverting to several top-level proof commands as the long-term contract
- treating Slack follow-up or media as implicitly required for every ticket
- adding a `kind` field anywhere in the schema

## Ticket Lifecycle

Tickets live in exactly one folder:

1. `not-started/`
2. `in-progress/`
3. `completed/`
4. `blocked/`

## Ticket Order

1. [DGR-001](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-golden-runner-demo-proof-board/completed/DGR-001-validation-preflight-contract-and-result-surface.md)
2. [DGR-002](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-golden-runner-demo-proof-board/completed/DGR-002-jira-cleanroom-adapter-registration-and-preflight-cutover.md)
3. [DGR-003](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-golden-runner-demo-proof-board/completed/DGR-003-unified-slack-phase-with-required-and-optional-checkpoints.md)
4. [DGR-004](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-golden-runner-demo-proof-board/completed/DGR-004-orchestrated-golden-runner-entrypoint-and-phase-execution.md)
5. [DGR-005](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-golden-runner-demo-proof-board/completed/DGR-005-canonical-demo-recording-lifecycle-and-artifact-ownership.md)
6. [DGR-006](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-golden-runner-demo-proof-board/completed/DGR-006-structured-golden-manifest-and-subproof-reporting.md)
7. [DGR-007](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-golden-runner-demo-proof-board/completed/DGR-007-review-gate-manifest-consumption-and-tier-evaluation.md)
8. [DGR-008](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-golden-runner-demo-proof-board/completed/DGR-008-per-adapter-proof-demotion-to-internal-diagnostics.md)
9. [DGR-009](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-golden-runner-demo-proof-board/completed/DGR-009-dispatch-completion-handoff-with-ticket-pr-and-video-links.md)
10. [DGR-010](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-golden-runner-demo-proof-board/blocked/DGR-010-live-spec-259-demo-proof-rerun-through-the-orchestrated-lane.md)

## Status

- [Not Started](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-golden-runner-demo-proof-board/not-started/README.md)
- [In Progress](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-golden-runner-demo-proof-board/in-progress/README.md)
- [Completed](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-golden-runner-demo-proof-board/completed/README.md)
- [Blocked](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-golden-runner-demo-proof-board/blocked/README.md)

## Live Snapshot

Current truth driving this board:

- `DGR-001` through `DGR-009` are landed in code
- `real_all` now resolves to one orchestrated golden-runner command instead of
  three top-level proof commands
- validation preflight, manifest ingestion, subproof-aware review gating, and
  completion handoff now operate on the new contract
- the follow-on live dogfood rerun later reached candidate publication and then
  stopped because validation script approval was still pending
- that remaining gap is no longer about the golden-runner proof contract
- the canonical follow-on execution lane is now:
  [Dispatch Validation Approval And Rework Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-validation-approval-and-rework-board/README.md)

This board is effectively complete as a proof-runner board. The remaining live
Dispatch work belongs to the approval, post-validation review, and rework loop.
