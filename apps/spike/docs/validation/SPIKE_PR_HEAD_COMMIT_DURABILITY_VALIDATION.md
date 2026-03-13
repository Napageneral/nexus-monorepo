---
summary: "Validation ladder for durable PR rebuild target selection in Spike."
title: "Spike PR Head Commit Durability Validation"
---

# Spike PR Head Commit Durability Validation

## Rung 1: Target selection unit coverage

Pass when:

1. PR metadata with `head_commit_sha` causes reconcile to call
   `spike.worktrees.create` with `commit_sha`
2. the same call may still include `ref` when `source_branch` is present
3. PR metadata with only `source_branch` causes reconcile to use `ref`
4. PR metadata with only `target_branch` does not result in a build target

## Rung 2: Local runtime behavior

Pass when:

1. the Spike job module loads successfully
2. a focused local invocation shows the expected `runtime.callMethod` sequence
3. the worktree create payload contains immutable `commit_sha` when present

## Rung 3: Hosted regression target

Pass when:

1. a future git PR record carrying `head_commit_sha` reconciles successfully
2. an older PR record with deleted source branch fails honestly instead of
   building `target_branch`
3. durable job history makes that failure mode explicit
