# Workplan: Frontdoor Repo Hard Cut And Doc Realignment

## Goal

Hard-cut Frontdoor to one active repo root at `frontdoor/`, delete the stale
launcher repo, and realign active docs to the current hosted model.

## Scope

- delete `frontdoor/nexus-frontdoor-web`
- promote `frontdoor/nexus-frontdoor/*` into `frontdoor/`
- remove the now-empty nested active repo path
- rewrite active references from `frontdoor/nexus-frontdoor` to `frontdoor`
- clean active Frontdoor README/docs to describe:
  - AWS-hosted frontdoor
  - OIDC-first auth
  - `standard` / `compliant`
  - one shell

## Non-goals

- UI redesign beyond the repo/doc hard cut
- backwards compatibility for old paths
- preserving `nexus-frontdoor-web` as an active launcher

## Steps

1. Capture the hard-cut ownership model in spec.
2. Delete `frontdoor/nexus-frontdoor-web`.
3. Promote `frontdoor/nexus-frontdoor/*` into `frontdoor/`.
4. Remove the empty `frontdoor/nexus-frontdoor` directory.
5. Rewrite active references to the new `frontdoor/` root.
6. Clean Frontdoor README/docs to the current hosted architecture.
7. Validate no active stale references remain.

## Validation

- `git status` reflects the intended move/delete operations.
- `rg` over active trees finds no remaining `frontdoor/nexus-frontdoor-web`.
- `rg` over active trees finds no remaining `frontdoor/nexus-frontdoor`.
- `frontdoor/README.md` and `frontdoor/docs/README.md` reflect the current
  hosted model.
