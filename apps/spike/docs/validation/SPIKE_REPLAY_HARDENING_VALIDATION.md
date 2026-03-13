# Spike Replay Hardening Validation

## Goal

Prove Spike can replay older PR records truthfully and handle repeated commit
replay idempotently.

## Rung 1: PR fallback tests

Pass when:

1. a PR record without `head_commit_sha` resolves a matching commit record from
   git history
2. the resolved commit SHA is passed to `spike.worktrees.create`
3. a PR record with no immutable fallback fails explicitly

## Rung 2: Code build idempotency

Pass when:

1. building the same snapshot twice succeeds
2. the second build returns the same snapshot id
3. no duplicate-row error is raised

## Rung 3: Local end-to-end replay

Pass when:

1. a locally ingested git PR record triggers automatic Spike reconcile
2. a repeated replay of the same commit record does not fail
3. `spike.code.search` still works on the resulting snapshot
