# RAGV-002 Collapse Dispatch Validation Entrypoints Behind Profiles

## Goal

Ensure Dispatch validation no longer chooses between live versus Docker proof
lanes through string rewrites or duplicated shell entrypoints.

## Scope

- route Dispatch validation through the profile runner only
- delete Dispatch-side ambiguity between `test:live:*` and `test:docker:*`
  entrypoints for the same ticket-proof lane
- make the validating worker prompt derive from the resolved profile contract
- keep manual debug entrypoints only as non-Dispatch operator tools

## Acceptance

- Dispatch-owned validation for this lane uses one canonical profile-backed
  execution path
- validating worker prompts, issue state, and review script all agree on that
  path
- Dispatch no longer needs command-string surgery to switch proof topology
