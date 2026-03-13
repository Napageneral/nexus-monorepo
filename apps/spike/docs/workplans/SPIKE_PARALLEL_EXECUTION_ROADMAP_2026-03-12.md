---
summary: "Spike-only roadmap for work that can proceed in parallel with the shared Nex connection cutover."
title: "Spike Parallel Execution Roadmap 2026-03-12"
---

# Spike Parallel Execution Roadmap

## Purpose

Track Spike-specific work that should move forward without colliding with the
active shared Nex cutover for single-identity connections and generic
credential retrieval.

## Customer Experience

The intended product experience remains:

1. install shared git
2. create one shared git connection
3. install Spike
4. ingest git records
5. let `record.ingested` trigger Spike automatically
6. have Spike produce mirrors, worktrees, and code intelligence

The remaining Spike-side gaps after the production auth proof are narrower:

1. old PR records can fail when the source branch has been deleted
2. repeated replay can still fail with duplicate `code_files` rows under real
   runtime pressure
3. Spike package metadata still needs full alignment with the refined package
   dependency model
4. agents still need a canonical Spike skill file once the hosted proof is
   fully stable

## Parallel Workstreams

### 1. External dependency: shared Nex connection cutover

Owned elsewhere.

This covers:

1. single `connection_id` execution identity
2. canonical `adapters.connections.create` / `update`
3. trusted runtime credential retrieval by `connection_id`
4. removal of `adapterAccount` and filesystem scraping from the canonical model

Spike should not duplicate that work.

### 2. Active Spike-only slice: PR head commit durability

Owned here.

Problem:

- a PR record currently gives Spike mutable branch names
- older PR reconciles can fail with `fatal: Needed a single revision`
- building `target_branch` instead would be incorrect for PR-specific code

Target:

1. Spike prefers immutable PR head commit identity when available
2. Spike stops silently falling back to `target_branch` for PR rebuilds
3. missing immutable PR target is surfaced as an explicit durability gap

Artifacts:

- [SPIKE_PR_HEAD_COMMIT_DURABILITY.md](/Users/tyler/nexus/home/projects/nexus/apps/spike/docs/specs/SPIKE_PR_HEAD_COMMIT_DURABILITY.md)
- [SPIKE_PR_HEAD_COMMIT_DURABILITY_WORKPLAN.md](/Users/tyler/nexus/home/projects/nexus/apps/spike/docs/workplans/SPIKE_PR_HEAD_COMMIT_DURABILITY_WORKPLAN.md)
- [SPIKE_PR_HEAD_COMMIT_DURABILITY_VALIDATION.md](/Users/tyler/nexus/home/projects/nexus/apps/spike/docs/validation/SPIKE_PR_HEAD_COMMIT_DURABILITY_VALIDATION.md)

### 3. New deeper Spike slice: durable historical replay

Owned here after the first production rollout fixes land.

Problem:

- some historical PR head commits no longer exist on the Git remote
- a full `head_commit_sha` is necessary but still not sufficient for exact
  replay
- repeated `spike.code.build` replay can still race into duplicate `code_files`
  inserts

Target:

1. PR records can preserve a durable source archive attachment for exact
   historical replay
2. Spike can materialize an archive-backed worktree when Git can no longer
   resolve the commit object
3. Spike code builds serialize durably by `snapshot_id`

Artifacts:

- [SPIKE_PR_SOURCE_ARCHIVE_REPLAY_DURABILITY.md](/Users/tyler/nexus/home/projects/nexus/apps/spike/docs/specs/SPIKE_PR_SOURCE_ARCHIVE_REPLAY_DURABILITY.md)
- [SPIKE_PR_SOURCE_ARCHIVE_REPLAY_DURABILITY_WORKPLAN.md](/Users/tyler/nexus/home/projects/nexus/apps/spike/docs/workplans/SPIKE_PR_SOURCE_ARCHIVE_REPLAY_DURABILITY_WORKPLAN.md)
- [SPIKE_PR_SOURCE_ARCHIVE_REPLAY_DURABILITY_VALIDATION.md](/Users/tyler/nexus/home/projects/nexus/apps/spike/docs/validation/SPIKE_PR_SOURCE_ARCHIVE_REPLAY_DURABILITY_VALIDATION.md)
- [SPIKE_CODE_BUILD_REPLAY_SERIALIZATION.md](/Users/tyler/nexus/home/projects/nexus/apps/spike/docs/specs/SPIKE_CODE_BUILD_REPLAY_SERIALIZATION.md)
- [SPIKE_CODE_BUILD_REPLAY_SERIALIZATION_WORKPLAN.md](/Users/tyler/nexus/home/projects/nexus/apps/spike/docs/workplans/SPIKE_CODE_BUILD_REPLAY_SERIALIZATION_WORKPLAN.md)
- [SPIKE_CODE_BUILD_REPLAY_SERIALIZATION_VALIDATION.md](/Users/tyler/nexus/home/projects/nexus/apps/spike/docs/validation/SPIKE_CODE_BUILD_REPLAY_SERIALIZATION_VALIDATION.md)

### 4. Follow-on Spike package alignment

Gated on the shared connection cutover landing.

Work:

1. align the live manifest with the refined `requires.adapters` dependency model
2. rerun hosted install/upgrade validation after the new connection contract is
   live

### 5. Final Spike operator/agent skill

Last step after hosted proof is green again.

Work:

1. write a canonical Spike skill file for agents
2. cover mirror creation, worktree creation, code builds, and code query usage
3. describe the automatic record-driven path so agents do not duplicate work

## Execution Order

1. finish the shared Nex connection cutover
2. finish Spike PR head commit durability
3. deploy the first production rollout fixes
4. complete the deeper historical replay slice
5. rerun hosted Git + Spike validation against the refined replay model
6. write the Spike skill file
