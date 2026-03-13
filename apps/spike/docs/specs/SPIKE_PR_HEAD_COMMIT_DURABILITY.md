---
summary: "Canonical Spike behavior for durable PR rebuild targets when source branches are later deleted."
title: "Spike PR Head Commit Durability"
---

# Spike PR Head Commit Durability

## Purpose

This document defines how Spike should choose a PR rebuild target so older PR
records remain meaningful after the source branch is deleted.

## Customer Experience

When a user asks about an older PR, Spike should either:

1. rebuild the exact PR head commit that the record refers to, or
2. fail clearly because the record did not carry an immutable build target

Spike must not silently rebuild the target branch and pretend that is the PR
code.

## Problem

Current PR record-driven reconcile uses mutable ref names:

1. prefer `source_branch`
2. else prefer `target_branch`

That is wrong for durable PR understanding:

1. `source_branch` may be deleted after merge or cleanup
2. `target_branch` is usually a different code state than the PR head
3. using `target_branch` can produce a successful but incorrect build

## Canonical Rules

1. Spike prefers an immutable PR head commit over branch names.
2. The canonical immutable field is `metadata.head_commit_sha`.
3. If `head_commit_sha` is present, Spike passes that `commit_sha` into
   `spike.worktrees.create`.
4. If `source_branch` is also present, Spike may pass it as the descriptive
   `ref` alongside the immutable `commit_sha`.
5. If `head_commit_sha` is absent, Spike may fall back to `source_branch`.
6. Spike must not fall back to `target_branch` for PR code rebuilds.
7. If neither `head_commit_sha` nor `source_branch` is available, Spike fails
   explicitly.

## Required Git Record Contract Extension

For durable PR replay, the canonical git adapter record should carry:

```typescript
type GitPullRequestMetadata = {
  entity_type: "pull_request";
  remote_url: string;
  source_branch: string;
  target_branch: string;
  head_commit_sha?: string;
};
```

Without `head_commit_sha`, older deleted-branch PR records remain inherently
fragile.

## Spike Reconcile Target Selection

### Commit records

Spike keeps the current immutable commit flow:

1. prefer `refs[0]`
2. else use `thread_id`

### Pull request records

Spike chooses the build target in this order:

1. `metadata.head_commit_sha`
2. `metadata.source_branch`

It does not use `metadata.target_branch` as a rebuild fallback.

## Failure Semantics

If a PR record cannot produce a durable target:

1. the reconcile job fails
2. the failure states that the PR record lacked an immutable or source ref
3. the failure is visible in durable job history

If a PR record includes `source_branch` but the mirror no longer contains it:

1. the reconcile job fails
2. the failure is treated as a stale mutable ref problem
3. the corrective action is to emit `head_commit_sha` in the git record

## Why This Is Canonical

This preserves the customer truth:

1. PR code understanding should be about the PR code, not the current default
   branch
2. older records should remain replayable when possible
3. failures should be honest when immutable identity was never captured
