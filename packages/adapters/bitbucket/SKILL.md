---
name: bitbucket
description: Use the Bitbucket adapter for Bitbucket API-backed repository, pull request, comment, and backfill workflows through Nex-managed connections.
---

# Nexus Bitbucket Adapter

Use this adapter when you need Bitbucket provider APIs plus Nex-managed ingest
for repositories, pull requests, and PR comments.

## Use It For

- creating Bitbucket-backed Nex connections
- backfilling or monitoring Bitbucket repositories through Nex
- listing repositories, branches, commits, pull requests, and PR comments safely
- listing workspaces and reading repository, commit diff, pull request diff,
  and pull request source archive details safely
- creating branches
- creating pull requests
- posting PR comments
- merging PRs

## Do Not Use It For

- local clones or worktree management
- generic git transport over SSH
- provider-agnostic forge abstractions when Bitbucket specifics matter

Use the local git tool surface for checkout inspection and branch hygiene. Use
this adapter only when the task needs the Bitbucket API or Bitbucket-backed Nex
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
- `bitbucket.repositories.list`
- `bitbucket.repositories.get`
- `bitbucket.workspaces.list`
- `bitbucket.branches.list`
- `bitbucket.commits.list`
- `bitbucket.commits.diff.get`
- `bitbucket.pull_requests.list`
- `bitbucket.pull_requests.diff.get`
- `bitbucket.pull_requests.source_archive.get`
- `bitbucket.pull_requests.comments.list`
- `bitbucket.branches.create`
- `bitbucket.pull_requests.create`
- `bitbucket.pull_requests.comments.create`
- `bitbucket.pull_requests.merge`

## Examples

List tracked/visible repositories through the Bitbucket adapter:

```ts
await bitbucket.repositories.list({
  connection_id: "<bitbucket-connection-id>",
});
```

Read repository metadata for a repository you already know:

```ts
await bitbucket.repositories.get({
  connection_id: "<bitbucket-connection-id>",
  payload: {
    repository: "workspace/repo",
  },
});
```

List pull requests for a tracked repository:

```ts
await bitbucket.pull_requests.list({
  connection_id: "<bitbucket-connection-id>",
  payload: {
    repository: "workspace/repo",
    states: ["OPEN"],
    page_len: 10,
    page: 1,
  },
});
```

Read a commit diff for a known commit SHA:

```ts
await bitbucket.commits.diff.get({
  connection_id: "<bitbucket-connection-id>",
  payload: {
    repository: "workspace/repo",
    sha: "<commit-sha>",
  },
});
```

Read a pull request source archive:

```ts
await bitbucket.pull_requests.source_archive.get({
  connection_id: "<bitbucket-connection-id>",
  payload: {
    repository: "workspace/repo",
    pull_request_id: "42",
  },
});
```

`bitbucket.pull_requests.source_archive.get` returns a canonical attachment
object that points at the archived source artifact instead of inlining the
archive bytes.

For direct Bitbucket reads, prefer `payload.repository = "<workspace>/<repo>"`
when you already know the full repository name. `target` remains useful when
you are starting from a normalized forge record or thread.

Create a pull request through the Bitbucket adapter after the local branch
already exists:

```ts
await bitbucket.pull_requests.create({
  connection_id: "<bitbucket-connection-id>",
  target: {
    connection_id: "<bitbucket-connection-id>",
    channel: {
      platform: "bitbucket",
      container_id: "workspace/repo",
    },
  },
  title: "Dispatch handoff",
  description: "Implements the requested change.",
  source_branch: "dispatch/example-branch",
  target_branch: "main",
});
```

Post a PR comment on an existing review thread:

```ts
await bitbucket.pull_requests.comments.create({
  connection_id: "<bitbucket-connection-id>",
  target: {
    connection_id: "<bitbucket-connection-id>",
    channel: {
      platform: "bitbucket",
      container_id: "workspace/repo",
      thread_id: "pr/42",
    },
  },
  body: "Validation passed in the cleanroom proof.",
});
```

## Validation

- local: `go test ./... && go vet ./... && go build -o ./bin/bitbucket-adapter .`
- cleanroom: `./scripts/e2e/bitbucket-live-cleanroom-docker.sh`

Passed cleanroom bundle:

- `/Users/tyler/nexus/state/artifacts/validation/cleanroom/bitbucket-live-cleanroom/20260401T212708Z`
