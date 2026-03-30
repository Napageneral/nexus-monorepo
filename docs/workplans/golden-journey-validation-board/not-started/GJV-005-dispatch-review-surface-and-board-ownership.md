# GJV-005 Dispatch Review Surface And Board Ownership

## Goal

Move the human review loop out of raw filesystem bundles and into Dispatch.

## Scope

- show the owning run, proof summary, and primary demo artifact in Dispatch
- make board and ticket state visible there
- treat raw sandbox artifact paths as implementation detail

## Acceptance

- a reviewer can open Dispatch and see the run, its main video, and deeper
  evidence links without filesystem spelunking
- Dispatch is the preferred operator-facing board surface once the product path
  is ready
