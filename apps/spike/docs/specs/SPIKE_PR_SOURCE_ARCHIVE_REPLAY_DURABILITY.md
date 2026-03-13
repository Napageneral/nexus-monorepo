---
summary: "Canonical Spike replay model for PRs whose Git object no longer exists on the remote."
title: "Spike PR Source Archive Replay Durability"
---

# Spike PR Source Archive Replay Durability

## Customer Experience

When an operator opens an older pull request record in Spike, the expectation is
simple:

1. Spike reconstructs the exact PR code that was observed at ingest time
2. source-branch deletion does not silently switch Spike onto the wrong branch
3. if exact reconstruction is impossible, Spike fails truthfully and explains
   why

The operator should not need to keep old PR branches alive forever just so
Spike can still understand historical code.

## Problem

`metadata.head_commit_sha` solves only one part of PR replay durability.

If the provider later stops advertising that commit object, Git alone cannot
materialize the PR head anymore, even when the record still contains the full
immutable SHA.

That means a durable PR replay model needs a preserved source-tree artifact,
not just a better ref-selection rule.

## Canonical Model

### Durable PR replay source

1. The git adapter is the canonical producer of the PR `source_archive`
   attachment.
2. A PR record may carry one durable source-archive attachment representing
   the exact repository tree at `metadata.head_commit_sha`.
3. The source archive is a canonical record attachment, not a Spike-private
   side channel.
4. The archive attachment exists to preserve exact code replay after the Git
   remote loses the commit object.

### Attachment identity

The attachment used for durable PR replay must identify itself through
attachment metadata:

```ts
{
  artifact_kind: "source_archive",
  entity_type: "pull_request",
  remote_url: string,
  head_commit_sha: string,
  archive_format: "zip" | "tar.gz" | "tar",
  root_prefix?: string
}
```

### Spike replay order

For pull request records, Spike replay order is:

1. prefer a durable source-archive attachment matching the PR
   `head_commit_sha` when one is present and readable
2. otherwise prefer `metadata.head_commit_sha` when it is a full immutable OID
3. try normal mirror/worktree materialization from Git for that immutable
   commit
4. if Git cannot resolve the immutable commit object, inspect the PR record
   attachments for `artifact_kind = "source_archive"`
5. if such an attachment exists, materialize an archive-backed worktree from
   that attachment
6. build code intelligence from the materialized archive-backed worktree
7. only if there is no durable archive and no resolvable immutable commit may
   Spike attempt a best-effort replay from `source_branch`
8. if neither Git nor a durable source archive can reconstruct the PR head,
   fail explicitly

### Truthfulness rules

1. Spike must not fall back to `target_branch` for PR replay.
2. Spike must not silently build some other currently-available branch.
3. Archive-backed replay must remain tied to the original PR record and
   `head_commit_sha`.
4. Archive-backed worktrees must be marked as archive-derived provenance, not
   ordinary mirror-derived provenance.
5. Best-effort `source_branch` replay is allowed only when no durable archive
   exists and no immutable commit can be resolved.

## Storage Boundary

1. The durable replay artifact belongs to the canonical record attachment
   surface.
2. Spike may materialize a worktree from that attachment into Spike-owned disk
   state.
3. Spike owns the materialized archive-backed worktree and its provenance
   records.
4. Spike does not become the owner of the preserved source archive itself.

## Validation Requirements

This cut is not complete until:

1. a PR record with a durable source archive attachment can replay after the
   source branch is deleted
2. Spike uses Git first when the immutable commit object still exists
3. Spike falls back to the source archive only when Git cannot resolve the
   commit object
4. the resulting archive-backed worktree can build a code snapshot
5. a PR record with neither resolvable Git object nor durable source archive
   fails explicitly
