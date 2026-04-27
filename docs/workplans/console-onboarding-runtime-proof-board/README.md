---
summary: "Execution board for runtime-backed Console adapter setup, post-connect ingestion controls, and one VM-recorded onboarding-and-data proof."
title: "Console Onboarding Runtime-Proof Board"
---

# Console Onboarding Runtime-Proof Board

## Purpose

This board closes the next product gap after Dispatch proof, completion
handoff, and the current whole-session recording substrate already landed.

The goal is:

- keep one VM or sandbox recording stack
- make the Operator Console the real proof surface inside that recording
- connect adapters through the Console UI
- make post-connect backfill and livesync explicit and deterministic
- prove runtime-backed records, contacts, and channels loading through the UI
- leave chat and Dispatch as follow-on layers rather than the first blocker

The fresh-sandbox successor for the real-adapter matrix now lives in:

- [Console Real-Adapter Cleanroom Proof Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-real-adapter-cleanroom-proof-board/README.md)

## Canonical Inputs

- [Spec-Driven Development Workflow](/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md)
- [Console Onboarding And Runtime-Backed Data Proof](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/console-onboarding-and-runtime-backed-data-proof.md)
- [Cleanroom Proof Capture And Demo Artifacts](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/cleanroom-proof-capture-and-demo-artifacts.md)
- [Operator Console Cleanroom Integration Testing](/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/docs/specs/OPERATOR_CONSOLE_CLEANROOM_INTEGRATION.md)

## Gap Analysis

Current reality already proves:

- the full-session VM recording substrate exists
- the runtime-managed Operator Console browser proof job exists
- the Console shell renders against a fresh inner runtime
- chat plumbing still exists in the Console codebase

The current remaining gaps are:

- the proof harness is stale against the current Console DOM
- the top-level connectors flow is still partly presentation-first and does not
  hard-cut to the real runtime-backed integration actions
- post-connect backfill and livesync are not yet exposed as explicit operator
  controls in the Console proof story
- the primary browser proof still emphasizes broad synthetic page coverage over
  the onboarding and runtime-backed data narrative
- records, contacts, and channels are not yet the explicit post-connect proof
  target for this lane

## Scope

In scope:

- stale selector and route contract refresh for the current Console
- runtime-backed connector action cutover in the top-level connectors flow
- explicit post-connect controls for backfill and livesync
- runtime-backed proof assertions for records, contacts, and channels
- one narrative VM-recorded Console onboarding and data journey
- one live proof rerun producing a review-worthy `full-session.webm`

Out of scope:

- inventing a second recording stack
- making chat the prerequisite for the initial Console proof lane
- making Dispatch the prerequisite for the initial Console proof lane
- adding any `kind` field anywhere in the schema

## Ticket Lifecycle

Tickets live in exactly one folder:

1. `not-started/`
2. `in-progress/`
3. `completed/`
4. `blocked/`

## Ticket Order

1. [CORP-001](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-onboarding-runtime-proof-board/completed/CORP-001-operator-console-proof-harness-refresh-for-current-dom-and-nav-contract.md)
2. [CORP-002](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-onboarding-runtime-proof-board/completed/CORP-002-connectors-tab-hard-cut-to-runtime-backed-integration-actions.md)
3. [CORP-003](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-onboarding-runtime-proof-board/completed/CORP-003-post-connect-backfill-and-livesync-control-surface.md)
4. [CORP-004](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-onboarding-runtime-proof-board/in-progress/CORP-004-runtime-backed-records-contacts-and-channels-proof-contract.md)
5. [CORP-005](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-onboarding-runtime-proof-board/not-started/CORP-005-narrative-vm-recorded-console-onboarding-journey.md)
6. [CORP-006](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-onboarding-runtime-proof-board/not-started/CORP-006-live-console-runtime-proof-rerun-and-review-artifact-signoff.md)

## Status

- [Not Started](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-onboarding-runtime-proof-board/not-started/README.md)
- [In Progress](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-onboarding-runtime-proof-board/in-progress/README.md)
- [Completed](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-onboarding-runtime-proof-board/completed/README.md)
- [Blocked](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-onboarding-runtime-proof-board/blocked/README.md)

## Live Snapshot

Current truth driving this board:

- the stale Console proof harness now targets the current `.console-*` shell
  and nav contract
- the focused Connectors and Agents e2e slice passes against the rebuilt
  Console dist
- the top-level connectors tab now renders the runtime-backed integrations
  experience directly instead of the presentation-first picker surface
- the runtime-backed Connectors flow now exposes `Test connection`,
  `Backfill now`, `Livesync`, and `Disconnect` against concrete connection ids
- the current most valuable next move is to define and prove the
  runtime-backed records, contacts, and channels story that follows those
  controls
- the next board after this foundation is the fresh-sandbox real-adapter
  matrix, not more local-only proof iterations
