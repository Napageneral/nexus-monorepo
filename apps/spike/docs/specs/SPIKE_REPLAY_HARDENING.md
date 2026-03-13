---
summary: "Canonical Spike replay behavior for older PR records and repeated snapshot rebuild requests."
title: "Spike Replay Hardening"
---

# Spike Replay Hardening

## Customer Experience

When Spike automatically replays a git record, the operator expectation is:

1. Spike rebuilds the exact code state the record truthfully identifies
2. if an older PR record lacks a durable immutable target, Spike makes a
   truthful best effort from existing git records before failing
3. repeated replay of the same commit does not corrupt the snapshot store or
   fail with duplicate-row errors

## Problem 1: Older PR records without `head_commit_sha`

New canonical PR records should carry `metadata.head_commit_sha`, but older
production rows may not.

If the source branch has since been deleted, branch-only replay fails even
though the records ledger may already contain commit records for that same
source branch.

## Problem 2: Repeated commit replay

The same commit can be replayed more than once through backfill overlap,
monitor replay, or manual reruns.

Repeated build requests for the same snapshot must be idempotent. They must not
fail with duplicate `code_files` rows.

## Canonical Rules

### PR target resolution

1. Spike still prefers `metadata.head_commit_sha` when it is a full immutable
   commit OID.
2. An abbreviated PR head hash is only a hint. Spike must not treat it as an
   immutable commit target unless it can recover the full OID.
3. If `head_commit_sha` is absent or abbreviated and `source_branch` is present, Spike may
   search existing git commit records for the same repository and branch.
4. The fallback search must only consider commit records whose:
   - `platform = "git"`
   - `metadata.entity_type = "commit"`
   - `metadata.remote_url` matches the PR record
   - either `metadata.refs` contains `refs/heads/<source_branch>` or the
     commit SHA matches the abbreviated head hash prefix
5. If the PR record has a timestamp, the fallback should prefer commit records
   at or before that timestamp.
6. If a matching commit record is found, Spike must use that immutable commit
   SHA for worktree creation.
7. Spike must not fall back to `target_branch`.
8. If no immutable match can be derived, Spike fails explicitly.

### Repeated build idempotency

1. Rebuilding the same snapshot id for the same root path and commit is
   idempotent.
2. If a ready snapshot already exists for that exact identity, Spike may return
   the existing snapshot without rebuilding.
3. Concurrent or repeated replay of the same snapshot id must not produce
   duplicate-row failures in `code_files`.
4. Snapshot reuse must preserve truthful response data:
   - snapshot metadata
   - language counts
   - capability rows

## Validation Requirements

The cut is not complete until:

1. a focused Spike job test proves PR replay falls back to a matching commit
   record when `head_commit_sha` is absent
2. a focused Spike job test proves the fallback fails honestly when no matching
   immutable commit record exists
3. a focused code-intel service test proves repeated build of the same snapshot
   id returns successfully without duplicate-row failure
