---
summary: "Execution board for explicit candidate artifacts, separate validation workers and cleanrooms, profile-runner candidate materialization, and build-backed golden-journey proof."
title: "Implementation Validation Handoff Board"
---

# Implementation Validation Handoff Board

## Purpose

This board executes the contract between Dispatch implementation and Dispatch
signoff validation.

The goal is:

- make `implementing` emit an explicit candidate artifact
- make `validating` consume that exact candidate in a fresh cleanroom
- keep fast local checks in the implementation sandbox without conflating them
  with signoff proof
- make the primary review recording come from the validation cleanroom proving
  the new implementation output end to end

This board is not about replacing validation profiles or golden-journey review.

It is about making those layers prove the exact thing the implementation worker
produced.

## Canonical Inputs

- [Spec-Driven Development Workflow](/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md)
- [Golden Journey Validation And Dispatch Review](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/golden-journey-validation-and-dispatch-review.md)
- [Real Adapter Validation Profiles And Cleanroom Projection](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/real-adapter-validation-profiles-and-cleanroom-projection.md)
- [Candidate Artifact Handoff And Fresh Validation Cleanrooms](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/candidate-artifact-handoff-and-fresh-validation-cleanrooms.md)
- [Real Adapter Golden Journey Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/real-adapter-golden-journey-board/README.md)

## Scope

In scope:

- first-class candidate-artifact contract and issue-state persistence
- implementation-stage publication of exact candidate artifacts
- validation worker packets and separate validation cleanrooms
- profile-runner candidate materialization
- validation recordings proving the candidate under review
- source-snapshot-backed signoff as the first delivery slice
- built-bundle or image-backed signoff as the stronger follow-up slice

Out of scope:

- treating the implementation sandbox as the final review environment
- silently validating against a policy base ref instead of the emitted
  candidate
- encoding candidate selection only as raw branch names or shell conventions
- declaring the real-adapter golden journey complete before it validates the
  exact candidate artifact

## Two-Step Delivery

### Step 1: Source-snapshot-backed validation

The first delivery slice should:

- emit exact workspace snapshots and focused receipts from implementation
- validate those snapshots in a fresh cleanroom
- keep the review recording and evidence on the validation side

### Step 2: Build-backed validation

The stronger follow-up slice should:

- emit installable runtime bundles or container images
- validate those installable artifacts directly in the cleanroom
- make the golden journey prove the built thing, not only the source tree

## Ticket Order

### Step 1

1. [IVH-001](/Users/tyler/nexus/home/projects/nexus/docs/workplans/implementation-validation-handoff-board/not-started/IVH-001-candidate-artifact-contract-and-issue-state.md)
2. [IVH-002](/Users/tyler/nexus/home/projects/nexus/docs/workplans/implementation-validation-handoff-board/not-started/IVH-002-implementation-workspace-snapshot-publication.md)
3. [IVH-003](/Users/tyler/nexus/home/projects/nexus/docs/workplans/implementation-validation-handoff-board/not-started/IVH-003-validation-packet-and-worker-contract.md)
4. [IVH-004](/Users/tyler/nexus/home/projects/nexus/docs/workplans/implementation-validation-handoff-board/not-started/IVH-004-fresh-validation-cleanroom-and-candidate-materialization.md)
5. [IVH-005](/Users/tyler/nexus/home/projects/nexus/docs/workplans/implementation-validation-handoff-board/not-started/IVH-005-profile-runner-candidate-backed-execution.md)
6. [IVH-006](/Users/tyler/nexus/home/projects/nexus/docs/workplans/implementation-validation-handoff-board/not-started/IVH-006-validation-cleanroom-recording-and-evidence.md)
7. [IVH-007](/Users/tyler/nexus/home/projects/nexus/docs/workplans/implementation-validation-handoff-board/not-started/IVH-007-first-source-snapshot-backed-dogfood-ticket.md)

### Step 2

8. [IVH-008](/Users/tyler/nexus/home/projects/nexus/docs/workplans/implementation-validation-handoff-board/not-started/IVH-008-build-backed-candidate-artifact-contract.md)
9. [IVH-009](/Users/tyler/nexus/home/projects/nexus/docs/workplans/implementation-validation-handoff-board/not-started/IVH-009-built-candidate-materialization-in-validation-cleanrooms.md)
10. [IVH-010](/Users/tyler/nexus/home/projects/nexus/docs/workplans/implementation-validation-handoff-board/not-started/IVH-010-first-build-backed-golden-journey-through-dispatch.md)

## Status

- [Not Started](/Users/tyler/nexus/home/projects/nexus/docs/workplans/implementation-validation-handoff-board/not-started/README.md)
- [In Progress](/Users/tyler/nexus/home/projects/nexus/docs/workplans/implementation-validation-handoff-board/in-progress/README.md)
- [Completed](/Users/tyler/nexus/home/projects/nexus/docs/workplans/implementation-validation-handoff-board/completed/README.md)

## Current Execution Status

- Completed in code: `IVH-001`, `IVH-002`, `IVH-003`, `IVH-005`, `IVH-006`
- In progress: `IVH-004`, `IVH-007`
- Not started: `IVH-008`, `IVH-009`, `IVH-010`

Current live blocker:

- the latest `SPEC-259` rerun reached `implementing`, then failed before sandbox creation because the local Docker context `desktop-linux` could not reach a live Docker daemon at `unix:///Users/tyler/.docker/run/docker.sock`

## Live Snapshot

This board is now driven by a narrower set of concrete gaps visible in live
Dispatch runs:

- Dispatch now persists explicit candidate artifacts and validation packets
- validation runs can project those candidate artifacts into a fresh cleanroom
- the shared real-adapter cleanroom harness now resolves candidate/support roots
  explicitly instead of inferring candidate mode from ambient sandbox paths
- source-snapshot validation no longer silently falls back to installed adapter
  releases unless the candidate manifest explicitly allows it
- the real Slack, Jira, and provider-native forge wrappers now use the
  Dispatch validation packet to select the exact projected binding instead of
  defaulting to the first manifest match
- cleanroom proof bundles now record `validation_profile_id` and the selected
  binding metadata so review can see exactly which projected target was proven
- the remaining Step 1 work is to finish one successful source-snapshot-backed
  dogfood run and close the remaining validation/cleanroom seam under
  `IVH-004` and `IVH-007`
- the current blocker for that live rerun is no longer Docker availability; it
  is completing one full pass through `validating` while the runtime surface is
  intermittently timing out and while the remaining support-root and Slack
  harness residue is still being closed

The honest current execution slice is `IVH-004` plus `IVH-007`.
The next untouched slice after Step 1 is `IVH-008`.
