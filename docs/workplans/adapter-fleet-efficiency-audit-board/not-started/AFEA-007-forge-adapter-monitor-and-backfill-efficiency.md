# AFEA-007 Forge Adapter Monitor And Backfill Efficiency

## Goal

Remove broad PR comment scans and over-eager historical artifact fetching from
the forge adapters.

## Current Gap

`github`, `gitlab`, and `bitbucket` have good monitor foundations, but their
open PR comment discovery can still call unbounded PR scans in the hot loop.
`gitlab` and `bitbucket` historical backfills also fetch PR diffs and source
archives for every PR without the same caps as GitHub.

Primary files:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/github/monitor.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/gitlab/monitor.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/gitlab/providers/gitlab.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/gitlab/adapter.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/bitbucket/monitor.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/bitbucket/adapter.go`

## Scope

- make PR comment discovery use open-only or updated-since provider calls
- stop pagination as soon as updated watermarks prove older pages are irrelevant
- persist an open-PR set if the provider cannot answer cheaply
- cap or explicitly opt into historical diff/source archive backfills
- reuse PR lists between comment and artifact passes where possible

## Acceptance

1. no-change monitor cycles do not page through old closed PRs
2. historical artifact fetches are capped or operator-requested
3. GitHub, GitLab, and Bitbucket have comparable efficiency proofs
4. provider request counts are included in benchmark artifacts
