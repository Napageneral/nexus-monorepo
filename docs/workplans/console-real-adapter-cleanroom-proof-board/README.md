---
summary: "Execution board for the fresh-sandbox Operator Console real-adapter proof suite."
title: "Console Real-Adapter Cleanroom Proof Board"
---

# Console Real-Adapter Cleanroom Proof Board

## Purpose

This board turns the Console onboarding proof into a real-adapter cleanroom
suite.

The goal is:

- keep one VM recording stack
- run each important adapter in a fresh cleanroom
- connect the adapter through the real Console UI
- run `Test connection`
- run `Backfill now` when supported
- wait for backfill or equivalent ingest completion
- record observed counts or equivalent inventory totals in the bundle summary
- require ticket-owned minimum thresholds before a proof can pass
- show runtime-backed data in the right Console surfaces
- produce one recording, one screenshot set, and one structured result per
  adapter

## Canonical Inputs

- [Spec-Driven Development Workflow](/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md)
- [Console Onboarding And Runtime-Backed Data Proof](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/console-onboarding-and-runtime-backed-data-proof.md)
- [Console Real-Adapter Cleanroom Proof Suite](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/console-real-adapter-cleanroom-proof-suite.md)
- [Real Adapter Validation Profiles And Cleanroom Projection](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/real-adapter-validation-profiles-and-cleanroom-projection.md)
- [Cleanroom Proof Capture And Demo Artifacts](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/cleanroom-proof-capture-and-demo-artifacts.md)

## Gap Analysis

Current reality already proves:

- one full-session VM recording stack exists
- the Operator Console browser proof job exists
- the Connectors tab is now runtime-backed
- post-connect `Test connection`, `Backfill now`, `Livesync`, and `Disconnect`
  controls exist
- the local runtime Slack flow has already been proved through the UI
- the shared harness can drive a real adapter through a fresh cleanroom
- Slack now has a passing cleanroom proof that waits for full backfill
  completion and records observed counts

The current remaining gaps are:

- each remaining adapter still needs its own cleanroom proof profile and
  signoff run under the stricter completion-and-counts contract
- the matrix needs one final rerun and artifact index once the per-adapter
  slices are green

## Scope

In scope:

- one shared cleanroom harness for real-adapter Console proof
- per-adapter proof profiles and proof runs
- screenshot plans and runtime-backed assertion plans
- full matrix rerun and signoff

Out of scope:

- Dispatch chat or task-submission proof
- Eve or iMessage host-bound proof
- any second recording stack

## Ticket Lifecycle

Tickets live in exactly one folder:

1. `not-started/`
2. `in-progress/`
3. `completed/`
4. `blocked/`

## Ticket Order

1. [OCRP-001](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-real-adapter-cleanroom-proof-board/completed/OCRP-001-shared-console-real-adapter-cleanroom-harness.md)
2. [OCRP-002](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-real-adapter-cleanroom-proof-board/completed/OCRP-002-slack-console-cleanroom-proof.md)
3. [OCRP-003](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-real-adapter-cleanroom-proof-board/completed/OCRP-003-jira-console-cleanroom-proof.md)
4. [OCRP-004](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-real-adapter-cleanroom-proof-board/not-started/OCRP-004-bitbucket-console-cleanroom-proof.md)
5. [OCRP-005](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-real-adapter-cleanroom-proof-board/not-started/OCRP-005-github-console-cleanroom-proof.md)
6. [OCRP-006](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-real-adapter-cleanroom-proof-board/not-started/OCRP-006-confluence-console-cleanroom-proof.md)
7. [OCRP-007](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-real-adapter-cleanroom-proof-board/not-started/OCRP-007-google-console-cleanroom-proof.md)
8. [OCRP-008](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-real-adapter-cleanroom-proof-board/not-started/OCRP-008-meta-ads-console-cleanroom-proof.md)
9. [OCRP-009](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-real-adapter-cleanroom-proof-board/not-started/OCRP-009-google-ads-console-cleanroom-proof.md)
10. [OCRP-010](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-real-adapter-cleanroom-proof-board/not-started/OCRP-010-tiktok-business-console-cleanroom-proof.md)
11. [OCRP-011](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-real-adapter-cleanroom-proof-board/not-started/OCRP-011-tiktok-display-console-cleanroom-proof.md)
12. [OCRP-012](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-real-adapter-cleanroom-proof-board/not-started/OCRP-012-shopify-console-cleanroom-proof.md)
13. [OCRP-013](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-real-adapter-cleanroom-proof-board/not-started/OCRP-013-zenoti-console-cleanroom-proof.md)
14. [OCRP-014](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-real-adapter-cleanroom-proof-board/not-started/OCRP-014-full-matrix-rerun-and-artifact-index.md)

## Status

- [Not Started](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-real-adapter-cleanroom-proof-board/not-started/README.md)
- [In Progress](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-real-adapter-cleanroom-proof-board/in-progress/README.md)
- [Completed](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-real-adapter-cleanroom-proof-board/completed/README.md)
- [Blocked](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-real-adapter-cleanroom-proof-board/blocked/README.md)

## Live Snapshot

Current truth driving this board:

- the local runtime Slack flow has been proved through the Console UI
- the stale synthetic Slack `echo` connection has been removed from the lived-
  in runtime
- the fresh cleanroom Slack proof passed on `20260406T225705Z`
- the fresh cleanroom Jira proof passed on `20260407T030845Z`
- passing now means: connect through UI, pass `Test connection`, wait for full
  backfill completion, record observed counts, and satisfy ticket-owned
  minimums before signoff
- the next honest move is to reuse that standard for Bitbucket, GitHub,
  Confluence, and the remaining adapter matrix
