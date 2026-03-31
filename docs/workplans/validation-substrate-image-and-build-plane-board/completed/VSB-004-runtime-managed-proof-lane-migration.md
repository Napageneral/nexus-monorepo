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

## Outcome

- the operator-console browser proof job now resolves its substrate image
  through the shared content-addressed ensure contract
- representative runtime-managed proof runs stage fresh Nex and console source
  per run while reusing the substrate image after the first host build
- the representative proof lane has since passed end to end on the shared image
  path, including whole-session recording and proof-bundle capture
- the remaining work on this board is follow-on host cleanroom migration,
  image-family alignment, and prewarm/throughput closeout in `VSB-005`
  through `VSB-007`
