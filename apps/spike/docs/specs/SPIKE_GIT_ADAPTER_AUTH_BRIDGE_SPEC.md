---
summary: "Canonical Spike behavior for retrieving Nex-managed connection credentials during private mirror clone and fetch."
read_when:
  - You are implementing Spike mirror auth for private git repositories
  - You are validating record.ingested to Spike reconcile against private repos
title: "Spike Shared Connection Credential Retrieval"
---

# Spike Shared Connection Credential Retrieval

## Purpose

This spec defines how Spike retrieves the credential behind a shared git
connection for private repository clone and fetch.

## Customer Experience

The operator connects a private git account once through the git adapter.

After that:

1. the git adapter ingests canonical git records
2. Nex persists the record and emits `record.ingested`
3. Spike reacts automatically
4. Spike clones or fetches the private repository successfully
5. no second repository auth setup is required inside Spike

The operator should not have to bind the same Bitbucket repository twice.

## Canonical Rules

1. `record.metadata.remote_url` remains the canonical repository locator
2. `remote_url` remains credential-free at all times
3. Spike reuses runtime-owned git connection binding, not provider names alone
4. Spike retrieves the credential bound to the producing shared `connection_id`
   from Nex core runtime
5. Spike must not persist authenticated remotes into mirror config
6. Spike must not write credentials into records, mirror rows, worktree rows, or
   logs

## Credential Source

Spike resolves private clone credentials from Nex core runtime through the
canonical trusted-app credential retrieval surface.

Hosted runtimes may satisfy that retrieval from local Nex-owned state or
through the managed-connection gateway.

Spike must not guess provider auth from repo URL or provider name alone. It
must resolve through Nex-owned connection state.

Spike resolves auth as follows:

1. normalize the incoming credential-free `remote_url`
2. resolve the producing or explicitly supplied shared git `connection_id`
3. call the Nex runtime to retrieve the credential bound to that
   `connection_id`
4. use the returned credential material for git clone or fetch

Spike does not read `connections.json`, does not read credential files, and
does not rely on a separate adapter runtime account slot.

## Provider Mapping

For this cut, the required live path is Bitbucket.

Because Nex returns generic credential material rather than a transport-specific
projection, Spike is responsible for applying any provider-specific git usage
rules it needs during clone or fetch.

## Git Transport Execution

Spike must authenticate clone/fetch through a temporary askpass-based git
environment.

Required behavior:

1. set `GIT_TERMINAL_PROMPT=0`
2. provide username/password through a temporary `GIT_ASKPASS` helper
3. run clone/fetch against the clean canonical remote URL
4. delete the temporary helper after the command finishes

This keeps:

- the command line free of raw tokens
- `.git/config` / bare mirror `config` free of credentialed remote URLs

## Failure Behavior

If no git adapter credential can be resolved for a private remote:

- Spike may still attempt an anonymous clone/fetch
- the resulting error must remain local to the Spike reconcile run
- the failure must not mutate canonical record state

If a credential is found but clone/fetch still fails:

- the reconcile run fails with the git error
- the operator can inspect the failed job run

## Validation

The pass is complete when all of the following are true:

1. a private Bitbucket git record triggers `spike.record_ingested_reconcile`
2. Spike resolves the matching shared git `connection_id`
3. Spike retrieves the credential for that connection through Nex
4. Spike clones or fetches the repository successfully
5. the mirror origin remains the clean credential-free URL
6. the reconcile job proceeds into worktree and code build steps
