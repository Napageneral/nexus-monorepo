---
summary: "Validation ladder for archive-backed PR replay durability in Spike."
title: "Spike PR Source Archive Replay Durability Validation"
---

# Spike PR Source Archive Replay Durability Validation

## Rung 1: Record Contract

Pass when a PR record contains:

1. `metadata.head_commit_sha`
2. one attachment with `metadata.artifact_kind = "source_archive"`
3. attachment metadata matching the same `remote_url` and `head_commit_sha`

## Rung 2: Archive Preference

Pass when Spike:

1. detects the matching `source_archive` attachment
2. materializes an archive-backed worktree without requiring mutable branch
   state
3. marks the resulting worktree provenance as archive-derived

## Rung 3: Immutable Git Replay

Pass when Spike:

1. replays via Git when the immutable commit object still exists
2. does not silently use `target_branch`
3. still produces the same snapshot identity

## Rung 4: Truthful Branch Fallback

Pass when a PR record without a resolvable Git object and without a valid
archive uses `source_branch` only as best-effort replay and never uses
`target_branch`.

## Rung 5: Truthful Failure

Pass when a PR record without a resolvable Git object, without a valid
archive, and without a truthful `source_branch` path fails explicitly.

## Rung 6: Hosted Proof

Pass when a hosted historical PR replay succeeds from the preserved source
archive and the resulting snapshot answers `spike.code.search`.
