# Spike Local Git -> Nex -> Spike E2E (2026-03-12)

## Customer flow

The local customer-visible flow for Spike is:

1. A git record exists for a private repository.
2. Nex persists that record and/or queues `record.ingested` work.
3. Spike reconciles automatically from the record.
4. Spike creates a mirror.
5. Spike creates a pinned worktree.
6. Spike builds code intelligence.
7. Spike answers queries against the built snapshot.

## Canonical local proof target

For local validation, the required proof is:

- real canonical git record shape
- real Nex work-runtime execution of `spike.record_ingested_reconcile`
- real connection-backed private clone auth
- real mirror/worktree/code build artifacts on disk
- real `spike.code.search` query success on the resulting snapshot

## Important local constraint

The isolated local `state-gitpkgtest` runtime currently has a dead Bitbucket REST
credential for adapter backfill. That means:

- local live `records.backfill` against Bitbucket cannot complete today
- this is an adapter credential freshness problem, not a Spike reconcile problem

Local validation therefore uses:

- a real adapter-produced git record from the replay ledger
- the real local Spike connection-backed clone path
- the real queued Nex work runtime

This is the correct local downstream proof until a fresh local Bitbucket API
credential is injected.

## Required local runtime state fix

The isolated runtime state had one separate local mismatch:

- `state-gitpkgtest/adapter-connections/connections.json` was still `version: 2`
- current runtime connection loading requires `version: 3`

Without that fix, `adapters.connections.credentials.get` fails with
`connection not found` and Spike cannot resolve private clone credentials.

## Proven local result

Using isolated runtime state:

- state root: `/Users/tyler/nexus/state-gitpkgtest`
- runtime: `ws://127.0.0.1:18890`
- app package: `spike@1.0.1`
- adapter package: `nexus-adapter-git@1.0.6`

The following is proven:

- `spike.mirrors.ensure` succeeds for the private Bitbucket repo using local
  connection-backed auth
- queued `spike.record_ingested_reconcile` completes through Nex work runtime
- mirror path exists
- worktree path exists
- code snapshot build completes
- `spike.code.search` returns hits from the built snapshot

## Snapshot proof

Validated snapshot:

- snapshot id: `fmcom-vrtly-component-library-e7aa9d68408a`

Validated worktree:

- repo: `fmcom/vrtly-component-library`
- commit: `e7aa9d68408ad43b941190e485c09b794d43d3e2`
- ref: `refs/heads/main`

## Remaining local gap

The only remaining local gap for the literal full `git -> Nex -> Spike` path is:

- inject a fresh local Bitbucket API credential so `records.backfill` can emit
  live records directly from the isolated runtime

Everything downstream of canonical git record presence is now locally proven.
