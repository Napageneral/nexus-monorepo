---
summary: "Move runtime-managed Nex proof lanes onto the shared image ensure path while preserving fresh-source payload staging."
title: "VSB-004 Runtime-Managed Proof Lane Migration"
---

# VSB-004 Runtime-Managed Proof Lane Migration

## Goal

Move runtime-managed Nex proof lanes off inline host image build logic and onto
the shared substrate image contract.

## Scope

- operator-console browser proof lane
- shared fresh-server proof lanes that currently own image selection inline
- confirmation that fresh source is still staged per run after migration

## Acceptance

- the operator-console browser proof no longer owns ad hoc image build logic
- the migrated lane still stages fresh Nex and app source per run
- proof output and bundle shape remain unchanged except for improved startup
  behavior
- at least one representative runtime-managed proof lane passes from the shared
  image path

## Validation

- focused tests around proof-lane image resolution
- full sandbox-backed browser proof rerun
- `git diff --check`
