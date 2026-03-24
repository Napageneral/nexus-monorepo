# LinkedIn Adapter Workplan

## Goal

Ship a Nex-hosted LinkedIn adapter for organization publishing and programmatic
read access.

## Scope

In scope:

- OAuth-backed LinkedIn connection metadata
- organization discovery
- organization post publishing
- image post publishing
- post read methods
- comment read methods
- social metadata read method
- package-local docs, tests, and release packaging

Out of scope:

- LinkedIn messaging
- member posting
- push/webhook ingest
- monitor/backfill flows
- edit/delete flows
- non-image media

## Work Items

1. scaffold the package in the standard TypeScript adapter shape
2. implement a LinkedIn REST client with Nex runtime credential loading
3. implement organization ACL and organization lookup helpers
4. implement post get/list/create helpers
5. implement image upload initialization and upload helpers
6. implement comments and social metadata read helpers
7. expose publishing through `linkedin.posts.create`
8. add contract smoke tests and focused unit tests for payload shaping
9. validate build, test, and package flows

## Exit Criteria

1. `adapter.info` advertises the intended auth and method surface
2. `adapter.health` validates token and organization access
3. `linkedin.organizations.list` returns administered organizations
4. `linkedin.posts.create` creates organization posts
5. read methods return LinkedIn-native ids and raw payloads
6. `pnpm test`, `pnpm build`, and `./scripts/package-release.sh` pass
