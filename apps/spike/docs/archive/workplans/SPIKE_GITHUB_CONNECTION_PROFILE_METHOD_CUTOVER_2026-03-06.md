# Spike GitHub Connection Profile And Method Contract Cutover

**Status:** COMPLETED
**Last Updated:** 2026-03-06

---

## Purpose

This workplan defines the next Spike GitHub gap-closure slice after the route
ownership cutover.

The customer-facing goal is:

1. Spike should declare the shared GitHub adapter and the app-facing Spike
   connection profiles in its manifest.
2. Spike's public GitHub runtime methods should describe the parameters the code
   actually uses.
3. The managed GitHub App install-start flow should be explicitly keyed by
   `connectionProfileId`.

This is a contract-faithfulness cutover. It is not the full runtime shared
adapter connection-system cutover.

---

## Current Drift

The current Spike package still diverges in three important ways:

1. `app/app.nexus.json` declares only `requires.nex` and does not declare the
   shared `github` adapter dependency or the Spike-owned GitHub
   `connectionProfiles`.
2. several GitHub method schemas in the manifest still claim `tree_id` inputs
   even though the live runtime methods operate on `installation_id`.
3. the managed GitHub App install-start flow does not yet require an explicit
   `connectionProfileId`, even though the active adapter model says app flows
   must start from a specific app-owned profile.

There is also one dead public method residue:

- `spike.connectors.github.install.callback`

That method is no longer canonical after the route cutover moved callback
completion onto `/auth/github/callback`.

---

## Target State

After this cutover:

1. Spike manifest declares:
   - `requires.adapters: [{ "id": "github", ... }]`
   - `adapters[]` entry for shared `github`
   - Spike app-facing `connectionProfiles`
2. `spike.connectors.github.install.start` requires `connectionProfileId`.
3. the install-start code validates the selected profile and carries it through
   signed pending state.
4. stale manifest-only methods with no live runtime implementation are removed.
5. live GitHub method schemas in the manifest match the parameters the handlers
   actually consume today.

---

## In Scope

### Manifest

Update `apps/spike/app/app.nexus.json` to:

1. declare the shared `github` adapter dependency
2. declare Spike GitHub connection profiles:
   - `spike-managed-github-app`
   - `bring-your-own-github-app`
   - `personal-access-token`
3. remove stale manifest-only GitHub methods that no longer have live runtime
   implementations
4. correct GitHub method parameter schemas to match the live handlers

### Runtime methods

Update `service/cmd/spike-engine` to:

1. require `connectionProfileId` on the managed GitHub App install-start flow
2. validate that this flow is only used for the managed GitHub App profile
3. carry `connectionProfileId` through the signed install state
4. remove the stale public `spike.connectors.github.install.callback` runtime
   method

### UI

Update Spike UI to:

1. start the GitHub App install flow with an explicit
   `connectionProfileId: "spike-managed-github-app"`

---

## Explicit Non-Goals

This slice does not yet:

- provide UI for choosing among all declared GitHub connection profiles
- replace installation-centric Spike state with shared `connection_id`
- move provider secret ownership fully into the shared adapter/runtime layer
- rename the remaining `spike.connectors.github.*` method family to its final
  target vocabulary

Those are later cutovers.

---

## Validation

Minimum validation:

1. focused Spike engine tests pass
2. Spike manifest validates successfully under the canonical runtime parser
3. the manifest no longer advertises GitHub methods that do not exist in the
   live runtime method table

## Completion Notes

Completed on 2026-03-06.

Validated by:

1. focused Spike engine tests covering:
   - managed-profile install start
   - signed callback state round-trip
   - rejection of missing or unsupported `connectionProfileId`
   - callback rejection for unsupported profiles
2. canonical manifest validation with zero errors and zero warnings
3. direct comparison of Spike GitHub manifest methods against the live
   `buildNexOperationHandlers()` method table, with no missing entries on either
   side
