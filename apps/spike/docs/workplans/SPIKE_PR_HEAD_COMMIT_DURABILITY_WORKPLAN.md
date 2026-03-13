---
summary: "Workplan for making Spike PR reconcile durable against deleted source branches."
title: "Spike PR Head Commit Durability Workplan"
---

# Spike PR Head Commit Durability Workplan

## Goal

Make Spike choose the correct PR rebuild target and stop silently building the
wrong branch.

## Customer Outcome

After this cut:

1. PR reconcile prefers immutable `head_commit_sha` when available
2. Spike no longer treats `target_branch` as a valid substitute for PR code
3. missing immutable PR targets fail honestly instead of producing misleading
   builds

## Gap Analysis

Current reconcile logic in
[record-ingested-reconcile.ts](/Users/tyler/nexus/home/projects/nexus/apps/spike/app/jobs/record-ingested-reconcile.ts)
does this for PRs:

1. prefer `source_branch`
2. else prefer `target_branch`

That leads to two bad outcomes:

1. deleted source branches fail late during git ref resolution
2. target-branch fallback can build the wrong code state

## Phases

### Phase 1: Spec lock

Lock the canonical rule that PR rebuilds prefer immutable `head_commit_sha` and
do not fall back to `target_branch`.

### Phase 2: Spike reconcile cut

Files:

- [/Users/tyler/nexus/home/projects/nexus/apps/spike/app/jobs/record-ingested-reconcile.ts](/Users/tyler/nexus/home/projects/nexus/apps/spike/app/jobs/record-ingested-reconcile.ts)

Changes:

1. replace PR target selection with:
   - `head_commit_sha`
   - else `source_branch`
2. pass `commit_sha` into `spike.worktrees.create` when immutable PR head is
   present
3. return a clear error when no usable PR target exists

### Phase 3: Focused regression coverage

Files:

- new job-level test for reconcile target selection

Cases:

1. PR with `head_commit_sha` uses `commit_sha`
2. PR without `head_commit_sha` but with `source_branch` uses `ref`
3. PR with only `target_branch` fails instead of building the wrong code

### Phase 4: Runtime proof

Validation:

1. run the focused reconcile tests locally
2. confirm the job payload sent to `spike.worktrees.create` contains
   `commit_sha` when available
3. confirm no PR test uses `target_branch` as a rebuild substitute

## Dependencies

The full product win requires the git adapter record contract to start emitting
`metadata.head_commit_sha` for PR records. This workplan makes Spike ready for
that contract and removes the misleading `target_branch` fallback immediately.
