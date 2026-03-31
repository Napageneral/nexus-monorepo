---
summary: "Execution board for shared content-addressed validation substrate images, host Docker build serialization, proof-lane migration, and hosted cleanroom alignment."
title: "Validation Substrate Image And Build-Plane Board"
---

# Validation Substrate Image And Build-Plane Board

## Purpose

This board executes the shared Docker substrate work that sits underneath local
Nex proof lanes and hosted cleanroom executors.

The goal is:

- reusable content-addressed validation substrate images
- one shared host Docker build plane with explicit serialization
- fresh Nex and package payload staged per run
- concurrent proof execution after image availability
- one coherent image family story across Nex and Frontdoor cleanroom lanes

This board does not replace the layered cleanroom model or the sandbox proof
model.

It makes those models fast, honest, and stable under concurrent execution.

## Canonical Inputs

- [Spec-Driven Development Workflow](/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md)
- [Layered Validation Substrates And Sandbox-Managed Cleanrooms](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/layered-validation-substrates-and-sandbox-managed-cleanrooms.md)
- [Dispatch-Orchestrated Fresh-Boot Sandbox Test Execution](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/sandbox-managed-validation-campaigns-and-fresh-server-provisioning.md)
- [Shared Validation Substrate Images And Host Build Serialization](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/shared-validation-substrate-images-and-host-build-serialization.md)
- [Cleanroom Proof Capture And Demo Artifacts](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/cleanroom-proof-capture-and-demo-artifacts.md)
- [Frontdoor Hosted Package Live Testing](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_HOSTED_PACKAGE_LIVE_TESTING.md)

## Scope

In scope:

- content-addressed substrate image identity
- one shared image ensure contract
- host Docker build lock or queue behavior
- image prewarm and steady-state readiness
- migration of Nex proof lanes off ad hoc inline host `docker build`
- build-context and ignore-contract discipline for proof images
- Frontdoor hosted cleanroom alignment to the same image family story

Out of scope:

- redefining the sandbox proof bundle model
- inventing a new validation object family
- forcing one literal final image for every local and hosted lane
- changing the fresh-source payload model into image-baked source snapshots

## Ticket Lifecycle

Tickets live in exactly one folder:

1. `not-started/`
2. `in-progress/`
3. `completed/`
4. `blocked/`

Rules:

1. each ticket must close one atomic gap in the shared image and build-plane
   model
2. shared substrate work closes only when at least one real proof lane or
   executor path is wired to it truthfully
3. lane-specific proof migration should reuse the shared substrate contract
   rather than growing new inline build logic
4. moving the file between folders is the status change

## Current Status Snapshot

Completed:

- `VSB-001`
- `VSB-002`
- `VSB-003`
- `VSB-004`

In Progress:

- none

Blocked:

- none

Not Started:

1. `VSB-005`
2. `VSB-006`
3. `VSB-007`

## Ownership Split

- this board owns shared substrate image and host build-plane behavior
- individual proof and hosted-suite boards own the scenario-specific proof
  assertions that run on top of that substrate
- lane-specific boards should consume the shared image contract instead of
  recreating it

## Ticket Order

1. [VSB-001](/Users/tyler/nexus/home/projects/nexus/docs/workplans/validation-substrate-image-and-build-plane-board/completed/VSB-001-canon-and-board-bootstrap.md)
2. [VSB-002](/Users/tyler/nexus/home/projects/nexus/docs/workplans/validation-substrate-image-and-build-plane-board/completed/VSB-002-content-addressed-image-identity-and-ensure-contract.md)
3. [VSB-003](/Users/tyler/nexus/home/projects/nexus/docs/workplans/validation-substrate-image-and-build-plane-board/completed/VSB-003-host-docker-build-lock-and-shared-build-queue.md)
4. [VSB-004](/Users/tyler/nexus/home/projects/nexus/docs/workplans/validation-substrate-image-and-build-plane-board/completed/VSB-004-runtime-managed-proof-lane-migration.md)
5. [VSB-005](/Users/tyler/nexus/home/projects/nexus/docs/workplans/validation-substrate-image-and-build-plane-board/not-started/VSB-005-host-cleanroom-script-migration-and-build-context-discipline.md)
6. [VSB-006](/Users/tyler/nexus/home/projects/nexus/docs/workplans/validation-substrate-image-and-build-plane-board/not-started/VSB-006-frontdoor-and-hosted-cleanroom-image-family-alignment.md)
7. [VSB-007](/Users/tyler/nexus/home/projects/nexus/docs/workplans/validation-substrate-image-and-build-plane-board/not-started/VSB-007-prewarm-throughput-proof-and-board-closeout.md)

## Status

- [Not Started](/Users/tyler/nexus/home/projects/nexus/docs/workplans/validation-substrate-image-and-build-plane-board/not-started/README.md)
- [In Progress](/Users/tyler/nexus/home/projects/nexus/docs/workplans/validation-substrate-image-and-build-plane-board/in-progress/README.md)
- [Completed](/Users/tyler/nexus/home/projects/nexus/docs/workplans/validation-substrate-image-and-build-plane-board/completed/README.md)
- [Blocked](/Users/tyler/nexus/home/projects/nexus/docs/workplans/validation-substrate-image-and-build-plane-board/blocked/README.md)
