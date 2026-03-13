---
summary: "Hard-cut workplan for archive-backed PR replay durability in Spike."
title: "Spike PR Source Archive Replay Durability Workplan"
---

# Spike PR Source Archive Replay Durability Workplan

## Goal

Allow Spike to replay historical PR code truthfully even after the provider no
longer exposes the PR head commit object through Git.

## Customer Outcome

After this cut:

1. current PRs still use normal Git mirror/worktree flows
2. older PRs with preserved source archives still rebuild exactly
3. Spike never answers about the wrong branch just because the original PR head
   disappeared

## Phase 1: Canonical Record Contract

1. lock the git adapter record contract so PR records carry a durable
   `source_archive` attachment for replayable PRs
2. require attachment metadata to include:
   - `artifact_kind`
   - `entity_type`
   - `remote_url`
   - `head_commit_sha`
   - `archive_format`

## Phase 2: Spike Attachment Discovery

1. teach the reconcile job to inspect the canonical record attachments on the
   PR record
2. identify the archive attachment matching the PR `head_commit_sha`
3. make archive presence part of the target selection state instead of an
   afterthought

## Phase 3: Archive-Backed Worktree Materialization

1. add an internal Spike path that expands a source archive into a durable
   Spike-owned worktree root
2. record provenance so the resulting worktree is known to be
   attachment-derived rather than mirror-derived
3. ensure the resulting tree is usable by `spike.code.build`
4. keep deterministic worktree identity for archive-backed replay

## Phase 4: Reconcile Fallback

1. prefer a matching durable archive when one is present and readable
2. otherwise attempt immutable Git replay using `head_commit_sha`
3. if immutable Git replay fails, invoke the archive-backed worktree path
4. only then permit best-effort `source_branch` replay
5. continue into normal `spike.code.build`
6. fail explicitly if no valid archive or truthful Git replay path is
   available

## Phase 5: Hosted Validation

1. backfill a real historical PR whose source branch is gone
2. confirm the record carries the durable archive attachment
3. confirm Spike rebuilds from the archive-backed worktree
4. confirm the resulting snapshot is searchable
