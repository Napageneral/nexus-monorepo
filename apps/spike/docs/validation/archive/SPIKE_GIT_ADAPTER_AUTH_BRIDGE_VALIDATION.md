# Spike Validation: Shared Connection Credential Retrieval Cut

## Goal

Prove that hosted Spike can automatically reconcile private git records by
resolving Nex-owned git connection bindings correctly.

## Rung 1: Resolver unit coverage

Pass when:

1. exact shared `connection_id` lookup returns auth
2. runtime credential retrieval returns the credential bound to that connection
3. missing bindings return nil auth
4. no direct Nex state-file parsing remains in the resolver

## Rung 2: Local package build

Pass when:

1. `go test ./cmd/spike-engine ./internal/git` passes
2. Spike service binary builds cleanly

## Rung 3: Hosted Frontdoor live proof

Pass when the live test:

1. installs the git adapter package
2. installs Spike
3. completes git custom setup
4. emits or backfills a private Bitbucket git record
5. runs `spike.record_ingested_reconcile`
6. completes with `mirror_id`, `worktree_id`, and `snapshot_id`
7. does not fail with `could not read Username for 'https://bitbucket.org'`

## Rung 4: Mirror hygiene

Pass when the resulting mirror config still uses the clean canonical remote URL
with no embedded credentials.
