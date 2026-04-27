# WIS-003 Substrate Key Computation And Invalidation Rules

## Goal

Define the keying and invalidation rules for repo-keyed warm implementation
substrates.

## Scope

- compute substrate identity from stable inputs such as runtime config, image
  artifact, repo id, source commit, lockfile hash, and manifest hash
- define when a new substrate is required versus when an existing one may be
  reused
- define invalidation triggers for drift, failed preflight, and explicit reset
- keep ticket ids and timestamps out of the identity model

## Acceptance

- equivalent repo execution inputs reuse the same prepared-substrate identity
- dependency or startup-surface changes force a new substrate when needed
- invalidation behavior is explicit and does not rely on ad hoc operator guesswork
