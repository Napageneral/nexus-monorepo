---
summary: "Execution board for resetting nex-operator-chat onto a true upstream t3code fork baseline and then reconnecting it to Nex through thin patch seams."
title: "Operator Chat t3code True Fork Reset Board"
---

# Operator Chat t3code True Fork Reset Board

## Purpose

This board closes the gap between the current operator-chat package and the
actual target-state UI strategy.

The goal is:

- one true Nex-owned fork of upstream `t3code/apps/web`
- one operator chat microfrontend that preserves upstream behavior and
  appearance as closely as possible
- one thin Nex integration layer instead of a broad custom shell rewrite
- one truthful validation story proving visual and interaction parity where
  Nex still shares the same product nouns

## Canonical Inputs

- [Spec-Driven Development Workflow](/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md)
- [Operator Chat Taxonomy](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-taxonomy.md)
- [Operator Chat Runtime Contract](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-runtime-contract.md)
- [Operator Chat Surface And Agent Lanes](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-surface-and-agent-lanes.md)
- [Operator Chat t3code Upstream Fork](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-t3code-shell-transplant.md)
- [Operator Chat t3code True Fork Parity Review](/Users/tyler/nexus/home/projects/nexus/docs/validation/operator-chat-t3code-true-fork-parity-review.md)
- [Operator Chat Hard-Cutover Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-hard-cutover-board/README.md)
- [Operator Chat Cleanroom Proof Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-cleanroom-proof-board/README.md)

## Gap Analysis

This board is now closed.

The original gap was that `nex-operator-chat` had drifted into a custom
recreation of the t3code UI rather than a true fork. That gap is now closed by:

- resetting the package onto upstream t3code `apps/web` commit
  `28e481eb24dc7e790b6d1ea963f20024b6a2bbc4`
- preserving a clean upstream copy at
  `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/upstream-apps-web`
- retaining zero removed upstream `src` files
- concentrating Nex integration into ten Nex-only source files and eighteen
  modified upstream source files
- reconnecting the fork through Nex runtime bridge, read-model, route,
  feature-policy, and console-host seams
- proving the embedded fork through the captured cleanroom bundle at
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260427T144405Z`

## Scope

In scope:

- truthfully resetting `nex-operator-chat` to an upstream-rooted package
- preserving upstream shell files wherever Nex does not truly need a patch
- reintroducing Nex through thin runtime, read-model, and feature-policy seams
- restoring upstream-like route behavior for the chat workspace
- deleting or gating unsupported surfaces without reauthoring the shell
- host reintegration, visual proof, and cleanroom validation

Out of scope:

- reviving stock `t3code` backend ownership
- adding any `kind` field to Nex canonical schemas
- re-litigating the `chat.*` runtime model
- broad UI redesign unrelated to upstream parity

## Ticket Lifecycle

Tickets live in exactly one folder:

1. `not-started/`
2. `in-progress/`
3. `completed/`
4. `blocked/`

## Ticket Order

1. [OTF-001](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-true-fork-reset-board/completed/OTF-001-corpus-correction-and-upstream-provenance-reset.md)
2. [OTF-002](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-true-fork-reset-board/completed/OTF-002-package-reset-to-upstream-apps-web-baseline.md)
3. [OTF-003](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-true-fork-reset-board/completed/OTF-003-route-parity-and-clean-chat-index-restoration.md)
4. [OTF-004](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-true-fork-reset-board/completed/OTF-004-nex-native-runtime-bridge-and-read-model-adapter.md)
5. [OTF-005](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-true-fork-reset-board/completed/OTF-005-agent-group-and-lane-remap-with-minimal-shell-drift.md)
6. [OTF-006](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-true-fork-reset-board/completed/OTF-006-unsupported-surface-policy-and-thin-feature-gates.md)
7. [OTF-007](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-true-fork-reset-board/completed/OTF-007-console-host-reintegration-and-build-validation.md)
8. [OTF-008](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-true-fork-reset-board/completed/OTF-008-upstream-parity-review-proof-and-cleanroom-closeout.md)

## Status

- [Not Started](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-true-fork-reset-board/not-started/README.md)
- [In Progress](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-true-fork-reset-board/in-progress/README.md)
- [Completed](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-true-fork-reset-board/completed/README.md)
- [Blocked](/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-true-fork-reset-board/blocked/README.md)

## Live Snapshot

Current truth driving this board:

- all tickets are complete
- the package is reset onto upstream t3code `apps/web` commit
  `28e481eb24dc7e790b6d1ea963f20024b6a2bbc4`
- the fork preserves the upstream route set and core shell files, with drift
  concentrated in explicit Nex seam files and feature gates
- the app now keeps `/chat` clean until explicit lane selection and preserves
  deep links for selected manager and worker lanes
- worker-lane reload now uses lane-specific read-model hydration instead of a
  default snapshot that can collapse worker detail
- the console host mounts the forked chat app through the global Chat tab
- the latest host-managed debug proof passed at
  `/tmp/operator-chat-proof-bundle-2ffHNj`
- the canonical recorded cleanroom proof passed at
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260427T144405Z`
- the `latest` cleanroom artifact symlink now points at `20260427T144405Z`
