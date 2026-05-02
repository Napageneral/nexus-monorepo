---
summary: "Cleanroom proof for GitHub, GitLab, and Bitbucket bounded backfill behavior."
title: "ABBLS-006 Git Forge Bounded Backfill Cleanroom"
---

# ABBLS-006 Git Forge Bounded Backfill Cleanroom

## Status

Completed 2026-05-02.

## Scope

Prove the shared forge adapter family honors bounded windows across repository
history, pull requests, comments, and related review events.

## Adapters

- GitHub
- GitLab
- Bitbucket

## Acceptance Criteria

1. Package-local `go test ./...` passes for each adapter.
2. Cleanroom smoke proves bounded window behavior for at least one repository
   per adapter.
3. Commits, pull requests, comments, and review metadata after `to` are
   excluded.
4. Existing compatibility wrappers delegate into the new window-aware path.
5. No registered SDK handler exposes the old `Backfill(ctx, since, ...)` shape.

## Evidence To Capture

- cleanroom bundle path
- repository aliases used
- bounded window
- object counts by family
- excluded-after-upper-bound assertion result

## Evidence

- Docker package matrix:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/adapter-bounded-backfill-package-matrix/20260502T214249Z`
- Passed lanes:
  - `github`
  - `gitlab`
  - `bitbucket`

## Notes

- The registered SDK handlers delegate into the window-aware backfill paths.
- Live provider repository and hosted restart proofs are deferred to the shared
  hosted/runtime proof lane rather than repeated in each forge package ticket.
