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
- Dispatch issue detail now renders:
  - the pre-execution validation-script preview
  - the latest review video
  - review-package and gap summary cards

Validated:

- `go test ./cmd/dispatch-engine/...`
- consumer-ui touched-file TypeScript sanity for:
  - `app/runs/page.tsx`
  - `app/issue/[id]/IssueDetail.tsx`
  - `lib/types.ts`

Closure Notes:

- Dispatch is now the preferred operator-facing review surface for this model
- repo workplan boards remain the canonical planning source until the first
  full downstream dogfood ticket proves the end-to-end ownership path
- richer issue/run aggregation can still improve later, but it is no longer the
  blocker for review
