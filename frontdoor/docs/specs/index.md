# Frontdoor Specs

This subtree contains the active Frontdoor canon.

Use it to understand Frontdoor-specific target-state behavior, not to browse a
hand-maintained registry of every leaf file.

## What Lives Here

The active `specs/` tree currently covers:

- hosted shell, routing, and object-model behavior
- server classes, provisioning, tenancy, and network topology
- package registry, install planning, adapter install, and runtime-auth
  projection
- billing, pricing, and customer-facing hosted flows
- a small set of operator procedure docs that are still colocated here until
  `frontdoor/` gets its own dedicated runbook home

Cross-project canon still lives in:

- `/Users/tyler/nexus/home/projects/nexus/docs/`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/`

## Reading Posture

Use this index to orient, then search the filesystem for the exact leaf you
need.

The active file tree is the source of leaf discovery.
This index intentionally does not mirror the whole subtree.

## Anchor Clusters

Suggested cluster entrypoints:

1. hosted architecture and customer flows
2. routing, networking, and hosted access control
3. package registry, install planning, and adapter/server install policy
4. billing, pricing, and create-server flow
5. compliance and restore/audit posture

## Archive Boundary

Historical and superseded Frontdoor specs live under:

- [Specs Archive](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/specs/_archive)
