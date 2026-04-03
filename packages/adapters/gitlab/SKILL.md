---
name: gitlab
description: Use the GitLab adapter for GitLab API-backed repository, merge request, comment, and backfill workflows through Nex-managed connections.
---

# Nexus GitLab Adapter

Use this adapter when you need GitLab provider APIs plus Nex-managed ingest for
repositories, merge requests, and MR comments.

## Use It For

- creating GitLab-backed Nex connections
- backfilling or monitoring GitLab repositories through Nex
- creating branches
- creating merge requests
- posting MR comments
- merging MRs

## Do Not Use It For

- local clones or worktree management
- generic git transport over SSH
- provider-agnostic forge abstractions when GitLab specifics matter

## Core Runtime Surfaces

- `adapter.info`
- `adapter.health`
- `adapter.connections.list`
- `adapter.setup.start`
- `adapter.setup.submit`
- `adapter.setup.status`
- `adapter.setup.cancel`
- `adapter.monitor.start`
- `records.backfill`
- `gitlab.branches.create`
- `gitlab.pull_requests.create`
- `gitlab.pull_requests.comments.create`
- `gitlab.pull_requests.merge`

## Validation

- local: `go test ./... && go vet ./... && go build -o ./bin/gitlab-adapter .`
- cleanroom: `./scripts/e2e/gitlab-live-cleanroom-docker.sh`

Current live proof blocker:

- no GitLab credential is present in the current workspace
