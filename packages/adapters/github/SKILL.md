---
name: github
description: Use the GitHub adapter for GitHub API-backed repository, pull request, comment, and backfill workflows through Nex-managed connections.
---

# Nexus GitHub Adapter

Use this adapter when you need GitHub provider APIs plus Nex-managed ingest for
repositories, pull requests, and PR comments.

## Use It For

- creating GitHub-backed Nex connections
- backfilling or monitoring GitHub repositories through Nex
- listing the authenticated user, repositories, branches, commits, pull requests, reviews, files, comments, and source archives safely
- creating branches
- creating pull requests
- posting PR comments
- merging PRs

## Do Not Use It For

- local clones or worktree management
- generic git transport over SSH
- provider-agnostic forge abstractions when GitHub specifics matter

Use the local git tool surface for checkout inspection and branch hygiene. Use
this adapter only when the task needs the GitHub API or GitHub-backed Nex
ingest.

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
- `github.users.me.get`
- `github.repositories.list`
- `github.repositories.get`
- `github.branches.list`
- `github.commits.list`
- `github.commits.diff.get`
- `github.pull_requests.list`
- `github.pull_requests.get`
- `github.pull_requests.diff.get`
- `github.pull_requests.files.list`
- `github.pull_requests.reviews.list`
- `github.pull_requests.commits.list`
- `github.pull_requests.source_archive.get`
- `github.pull_requests.comments.list`
- `github.branches.create`
- `github.pull_requests.create`
- `github.pull_requests.comments.create`
- `github.pull_requests.merge`

## Examples

Read the authenticated GitHub account:

```ts
await github.users.me.get({
  connection_id: "<github-connection-id>",
});
```

List repositories visible to the current connection:

```ts
await github.repositories.list({
  connection_id: "<github-connection-id>",
});
```

Read one repository's metadata:

```ts
await github.repositories.get({
  connection_id: "<github-connection-id>",
  repository: "owner/repo",
});
```

List pull requests for a repository:

```ts
await github.pull_requests.list({
  connection_id: "<github-connection-id>",
  repository: "owner/repo",
});
```

Read the diff and changed files for one pull request:

```ts
await github.pull_requests.diff.get({
  connection_id: "<github-connection-id>",
  repository: "owner/repo",
  pull_request_id: "42",
});

await github.pull_requests.files.list({
  connection_id: "<github-connection-id>",
  repository: "owner/repo",
  pull_request_id: "42",
});
```

`github.pull_requests.source_archive.get` returns a canonical attachment object
that points at the archived source artifact instead of inlining the archive
bytes.

Create a pull request through the GitHub adapter after the local branch already
exists:

```ts
await github.pull_requests.create({
  connection_id: "<github-connection-id>",
  target: {
    connection_id: "<github-connection-id>",
    channel: {
      platform: "github",
      container_id: "owner/repo",
    },
  },
  title: "Dispatch handoff",
  description: "Implements the requested change.",
  source_branch: "dispatch/example-branch",
  target_branch: "main",
});
```

Post a review comment on an existing PR thread:

```ts
await github.pull_requests.comments.create({
  connection_id: "<github-connection-id>",
  target: {
    connection_id: "<github-connection-id>",
    channel: {
      platform: "github",
      container_id: "owner/repo",
      thread_id: "pr/42",
    },
  },
  body: "Validation passed in the cleanroom proof.",
});
```

## Validation

- local: `go test ./... && go vet ./... && go build -o ./bin/github-adapter .`
- cleanroom: `./scripts/e2e/github-live-cleanroom-docker.sh`

Passed cleanroom bundle:

- `/Users/tyler/nexus/state/artifacts/validation/cleanroom/github-live-cleanroom/latest`
