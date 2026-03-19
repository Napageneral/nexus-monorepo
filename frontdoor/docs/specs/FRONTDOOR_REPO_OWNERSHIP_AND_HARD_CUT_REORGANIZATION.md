# Frontdoor Repo Ownership And Hard-Cut Reorganization

## Customer Experience

Frontdoor must present as one product surface:

- one hosted frontdoor
- one shell
- one authentication entry
- one repo that owns the implementation

The repository structure must reinforce that customer truth instead of
contradicting it.

## Problem

The current `frontdoor/` tree contains two overlapping projects:

- `frontdoor/nexus-frontdoor`
- `frontdoor/nexus-frontdoor-web`

This creates avoidable ambiguity:

- the active backend and active hosted shell live in `frontdoor/nexus-frontdoor`
- a second launcher/proxy frontend still exists in `frontdoor/nexus-frontdoor-web`
- active docs and scripts still reference the nested `frontdoor/nexus-frontdoor` path
- the repo layout suggests multiple frontdoor implementations when the product
  has already hard-cut to one

That structure is residue and should be removed.

## Decision

Frontdoor hard-cuts to a single active repo root:

- active repo root: `frontdoor/`

The following repo is deleted:

- `frontdoor/nexus-frontdoor-web`

The contents of the following repo are promoted into `frontdoor/`:

- `frontdoor/nexus-frontdoor/*`

After the move:

- `frontdoor/` owns the backend
- `frontdoor/` owns the hosted customer shell
- `frontdoor/` owns the Frontdoor docs
- `frontdoor/` is the only active Frontdoor implementation path

## Consequences

### Active ownership

After the hard cut, all active Frontdoor work must assume:

- `frontdoor/src/` is the active backend
- `frontdoor/src/server.ts` is the active hosted shell surface
- `frontdoor/docs/` is the active Frontdoor doc tree
- `frontdoor/scripts/` is the active Frontdoor operational tooling root

### Deleted ownership

`frontdoor/nexus-frontdoor-web` is not preserved as an active launcher,
alternate frontend, or compatibility tier.

If historical retention is needed, that belongs in an archive path outside the
active Frontdoor root. The active `frontdoor/` tree must not continue to carry
two competing implementations.

## Documentation posture

Active Frontdoor docs must describe the real hosted model:

- AWS-hosted frontdoor
- OIDC-first authentication
- `standard` and `compliant` server classes
- one hosted shell
- no provider-brand UX in normal customer flows

Docs must stop teaching:

- `frontdoor/nexus-frontdoor` as the active repo root
- `frontdoor/nexus-frontdoor-web` as a current frontend surface
- password-first hosted auth as the primary product posture

## Path rewrite rules

Active docs, scripts, and references must be rewritten from:

- `frontdoor/nexus-frontdoor/...`

to:

- `frontdoor/...`

Any active references to:

- `frontdoor/nexus-frontdoor-web/...`

must be removed unless they are intentionally archival.

## Validation

The hard cut is only complete when:

1. `frontdoor/nexus-frontdoor-web` no longer exists in the active tree.
2. `frontdoor/nexus-frontdoor` no longer exists in the active tree.
3. `frontdoor/` contains the promoted active implementation.
4. Active docs and scripts no longer reference `frontdoor/nexus-frontdoor`.
5. Active docs no longer present `nexus-frontdoor-web` as a live surface.
6. Frontdoor README and docs describe the current hosted model:
   AWS-hosted, OIDC-first, `standard`/`compliant`, one shell.
