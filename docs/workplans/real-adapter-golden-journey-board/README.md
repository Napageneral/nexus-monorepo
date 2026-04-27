---
summary: "Execution board for structured Dispatch validation profiles, real-adapter cleanroom projection, and golden-journey proof against real connected systems."
title: "Real Adapter Golden Journey Board"
---

# Real Adapter Golden Journey Board

## Purpose

This board executes the next layer beyond the review substrate already built by
the golden-journey work.

The goal is:

- choose validation by structured profile instead of raw command strings
- make Dispatch run ticket proof in Docker-backed cleanrooms by default
- project real adapters, real connections, and credential references into the
  cleanroom explicitly
- prove the golden journey against real Slack, Jira, and Git or Bitbucket
  surfaces

This board is not about inventing a third validation model.

It is about making the existing Dispatch-owned proof path truthful for real
integrations.

## Canonical Inputs

- [Spec-Driven Development Workflow](/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md)
- [Golden Journey Validation And Dispatch Review](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/golden-journey-validation-and-dispatch-review.md)
- [Real Adapter Validation Profiles And Cleanroom Projection](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/real-adapter-validation-profiles-and-cleanroom-projection.md)
- [Cleanroom Proof Capture And Demo Artifacts](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/cleanroom-proof-capture-and-demo-artifacts.md)
- [Golden Journey Validation Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/golden-journey-validation-board/README.md)

## Scope

In scope:

- structured `validation_profile` selection in Dispatch policy
- reusable job-definition-backed profile runners
- collapse of duplicate Dispatch validation entrypoints
- cleanroom adapter release projection and install truth
- cleanroom connection and credential projection for real accounts
- dedicated real resource-set binding for review-safe proof runs
- real Slack, Jira, and Git or Bitbucket golden-journey profiles
- one full real-adapter dogfood ticket through Dispatch review

Out of scope:

- removing lower-level fake-adapter harnesses entirely
- treating raw environment-variable toggles as the long-term profile contract
- reintroducing host-only validation as the default ticket-proof executor
- declaring success before a real downstream ticket closes through the new lane

## Ticket Order

1. [RAGV-001](/Users/tyler/nexus/home/projects/nexus/docs/workplans/real-adapter-golden-journey-board/not-started/RAGV-001-validation-profile-contract-and-job-binding.md)
2. [RAGV-002](/Users/tyler/nexus/home/projects/nexus/docs/workplans/real-adapter-golden-journey-board/not-started/RAGV-002-collapse-dispatch-validation-entrypoints-behind-profiles.md)
3. [RAGV-003](/Users/tyler/nexus/home/projects/nexus/docs/workplans/real-adapter-golden-journey-board/not-started/RAGV-003-cleanroom-adapter-release-projection-and-install.md)
4. [RAGV-004](/Users/tyler/nexus/home/projects/nexus/docs/workplans/real-adapter-golden-journey-board/not-started/RAGV-004-cleanroom-connection-and-credential-projection.md)
5. [RAGV-005](/Users/tyler/nexus/home/projects/nexus/docs/workplans/real-adapter-golden-journey-board/not-started/RAGV-005-real-resource-set-binding-for-golden-journey.md)
6. [RAGV-006](/Users/tyler/nexus/home/projects/nexus/docs/workplans/real-adapter-golden-journey-board/not-started/RAGV-006-real-slack-golden-journey-profile.md)
7. [RAGV-007](/Users/tyler/nexus/home/projects/nexus/docs/workplans/real-adapter-golden-journey-board/not-started/RAGV-007-real-jira-golden-journey-profile.md)
8. [RAGV-008](/Users/tyler/nexus/home/projects/nexus/docs/workplans/real-adapter-golden-journey-board/not-started/RAGV-008-real-git-and-bitbucket-golden-journey-profile.md)
9. [RAGV-009](/Users/tyler/nexus/home/projects/nexus/docs/workplans/real-adapter-golden-journey-board/not-started/RAGV-009-first-full-real-adapter-dogfood-ticket.md)

## Status

- [Not Started](/Users/tyler/nexus/home/projects/nexus/docs/workplans/real-adapter-golden-journey-board/not-started/README.md)
- [In Progress](/Users/tyler/nexus/home/projects/nexus/docs/workplans/real-adapter-golden-journey-board/in-progress/README.md)
- [Completed](/Users/tyler/nexus/home/projects/nexus/docs/workplans/real-adapter-golden-journey-board/completed/README.md)

## Live Snapshot

Known gaps driving this board:

- Dispatch policy still carries command arrays instead of a first-class
  validation-profile contract
- the real cleanroom proof lane still depends on shell/env topology residue in
  places
- adapter installation inside validation cleanrooms still relies on source or
  release discovery instead of explicit projection
- the latest `SPEC-259` proof line reached the correct Docker cleanroom
  command, but failed because the Slack adapter was not projected into the
  validation cleanroom as an explicit installable artifact

The honest first execution slice is `RAGV-001`.
