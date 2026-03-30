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

## Current State

Landed:

- Dispatch runs review now hydrates `dispatch.runs.get` on demand
- the expanded run view can render:
  - the primary demo artifact
  - the run-scoped validation script
  - proof bundle location
  - child job runs
- Dispatch run payloads now carry `issue_id` so the run view can pivot back to
  the owning issue

Remaining:

- richer issue-backed review aggregation still belongs on top of the run view
- Dispatch is not yet the sole canonical board surface for this workflow, so
  the repo workplan remains the planning source for now
